"""Internal API for the App Registry.

The supported way for any feature to ask "does this school have this app?" and
for the Executive Console to install and uninstall. Nothing outside
``apps/registry/`` should import :mod:`apps.registry.models` directly — same
rule, and same reasoning, as ``apps.students.api``.

Reads are cached per school for a short window. Access is checked on nearly
every request, and the answer changes only when a founder installs or removes
something, so the cache is invalidated on write rather than merely expiring.
"""

from __future__ import annotations

from typing import Optional

from django.core.cache import cache

from .manifest import AppManifest, AppScope, AppTier, all_manifests, get_manifest
from .models import AppInstallation, UserAppInstallation

CACHE_SECONDS = 300


def _cache_key(school_id) -> str:
    return f'registry:installed:{school_id}'


def _invalidate(school_id) -> None:
    cache.delete(_cache_key(school_id))


def _user_cache_key(user_id) -> str:
    return f'registry:user_installed:{user_id}'


def _invalidate_user(user_id) -> None:
    cache.delete(_user_cache_key(user_id))


# Catalogue -------------------------------------------------------------------


def uploaded_manifests() -> dict:
    """Manifests of every uploaded app that has a live published build.

    Read from the stored manifest rather than the package file: the zip is the
    artifact, the manifest is the fact, and nothing should have to open an
    archive to answer "what does this app declare?".
    """
    from .build_models import AppPackage
    from .manifest_schema import manifest_from_dict
    from .manifest import ManifestError

    result = {}
    packages = (
        AppPackage.objects.filter(is_listed=True, live_build__isnull=False)
        .select_related('live_build')
    )
    for package in packages:
        build = package.live_build
        if build is None or not build.is_runnable:
            continue
        try:
            result[package.key] = manifest_from_dict(build.manifest)
        except ManifestError:
            # A stored manifest that no longer validates means the rules
            # tightened after it was published. Skip it rather than take the
            # whole catalogue down, and let the review queue surface it.
            continue
    return result


def list_catalogue() -> list[AppManifest]:
    """Every app available in this release: built in, then uploaded.

    A built-in key always wins. Uploaded apps cannot shadow a shipped one,
    which would let an upload silently replace Attendance or Fees.
    """
    manifests = dict(all_manifests())
    try:
        for key, manifest in uploaded_manifests().items():
            manifests.setdefault(key, manifest)
    except Exception:  # noqa: BLE001 - catalogue must survive a database problem
        pass

    ordered = list(manifests.values())
    ordered.sort(key=lambda m: (not m.is_core, m.name.lower()))
    return ordered


def get_app(key: str) -> Optional[AppManifest]:
    """A manifest by key, built-in or uploaded."""
    manifest = get_manifest(key)
    if manifest is not None:
        return manifest
    try:
        return uploaded_manifests().get(key)
    except Exception:  # noqa: BLE001
        return None


# Reads -----------------------------------------------------------------------


def installed_app_keys(school) -> set:
    """Keys of every app this school can currently use.

    Core apps are always included — they are the platform, not a purchase.
    Disabled and expired installations are excluded.
    """
    core_keys = {m.key for m in all_manifests().values() if m.is_core}
    school_id = getattr(school, 'id', school)
    if not school_id:
        return core_keys

    key = _cache_key(school_id)
    cached = cache.get(key)
    if cached is not None:
        return set(cached)

    live = set()
    for installation in AppInstallation.objects.filter(
        school_id=school_id, is_enabled=True
    ):
        if installation.is_active:
            live.add(installation.app_key)

    result = core_keys | live
    cache.set(key, list(result), CACHE_SECONDS)
    return result


def is_installed(school, app_key: str) -> bool:
    """Whether ``school`` may use the app with this key."""
    if not app_key:
        return False
    manifest = get_app(app_key)
    if manifest is not None and manifest.is_core:
        return True
    if school is None:
        return False
    return app_key in installed_app_keys(school)


def user_installed_app_keys(user) -> set:
    """Keys of every app this person has installed into their own account."""
    user_id = getattr(user, 'id', user)
    if not user_id:
        return set()

    key = _user_cache_key(user_id)
    cached = cache.get(key)
    if cached is not None:
        return set(cached)

    live = {
        installation.app_key
        for installation in UserAppInstallation.objects.filter(
            user_id=user_id, is_enabled=True
        )
        if installation.is_active
    }
    cache.set(key, list(live), CACHE_SECONDS)
    return live


def is_installed_for_user(user, app_key: str) -> bool:
    """Whether ``user`` may use the app right now.

    Scope decides what has to be true:

    * SCHOOL — the school holds a licence, and that is enough for everyone there.
    * USER   — this person installed it themselves; the school is not involved.
    * BOTH   — the school holds the licence *and* this person opted in. That is
               the "school purchases it, authorised users use it" case, so both
               have to be satisfied.

    Platform executives always pass: they run the platform and must be able to
    reach every app to support schools.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return False

    manifest = get_app(app_key)

    # Uploaded apps are not in the built-in manifest registry — their
    # declaration lives in the build. For those, the school licence plus the
    # role targeting chosen at install decide who gets the app.
    if manifest is None:
        if getattr(user, 'is_platform_executive', False):
            return True
        installation = get_installation(getattr(user, 'school_id', None), app_key)
        if installation is None or not installation.is_active:
            return False
        return _uploaded_app_targets_role(installation, user, app_key)

    if manifest.is_core:
        return True
    if getattr(user, 'is_platform_executive', False):
        return True

    if manifest.needs_school_licence:
        if not is_installed(getattr(user, 'school_id', None), app_key):
            return False
    if manifest.installs_per_user:
        if app_key not in user_installed_app_keys(user):
            return False
    return True


def _uploaded_app_targets_role(installation, user, app_key: str) -> bool:
    """Whether an uploaded app's role targeting includes this user.

    A school picks the roles an app is for when installing it. Empty targeting
    means everyone the app itself is built for, taken from the app's own
    declared roles, so a school cannot hand an app to a role the app never
    supported.
    """
    role = str(getattr(user, 'role', '') or '').upper()
    chosen = [str(r).upper() for r in (installation.allowed_roles or [])]
    if chosen:
        return role in chosen

    manifest_roles = _uploaded_app_roles(app_key)
    if manifest_roles:
        return role in manifest_roles
    return True


def _uploaded_app_roles(app_key: str) -> set:
    """Roles the live build of an uploaded app declares it is for."""
    from .build_models import AppPackage

    package = AppPackage.objects.select_related('live_build').filter(key=app_key).first()
    if package is None or package.live_build is None:
        return set()
    return {
        str(r).upper() for r in (package.live_build.manifest or {}).get('roles') or []
    }


def available_app_keys_for_user(user) -> set:
    """Every app key this user can actually open. Used to build navigation."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return set()
    return {
        manifest.key
        for manifest in all_manifests().values()
        if is_installed_for_user(user, manifest.key)
    }


def installable_apps_for_user(user) -> list[dict]:
    """The personal store: apps this user could add to their own account.

    Only apps that install per user appear. Where the school also has to hold a
    licence, that is reported rather than hidden, so a teacher can see the app
    exists and knows to ask their administrator instead of assuming it is
    missing.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return []

    mine = user_installed_app_keys(user)
    school_id = getattr(user, 'school_id', None)
    rows = []
    for manifest in list_catalogue():
        if not manifest.installs_per_user:
            continue
        school_ok = (
            is_installed(school_id, manifest.key)
            if manifest.needs_school_licence
            else True
        )
        row = manifest.as_dict()
        row.update({
            'installed': manifest.key in mine,
            'school_licence_ok': school_ok,
            'blocked_reason': (
                '' if school_ok
                else 'Your school has not subscribed to this app yet.'
            ),
        })
        rows.append(row)
    return rows


def install_for_user(user, app_key: str, *, licence_expiry=None) -> UserAppInstallation:
    """Add an app to a person's own account."""
    manifest = get_app(app_key)
    if manifest is None:
        raise RegistryError(f'There is no app called {app_key!r} in this release.')
    if not manifest.installs_per_user:
        raise RegistryError(
            f'{manifest.name} is installed for a whole school, not per person. '
            'Ask your administrator.'
        )
    if manifest.needs_school_licence and not is_installed(
        getattr(user, 'school_id', None), app_key
    ):
        raise RegistryError(
            f'Your school has not subscribed to {manifest.name} yet.'
        )

    user_id = getattr(user, 'id', user)
    installation, _created = UserAppInstallation.objects.update_or_create(
        user_id=user_id,
        app_key=app_key,
        defaults={
            'is_enabled': True,
            'licence_expiry': licence_expiry,
            'disabled_at': None,
        },
    )
    _invalidate_user(user_id)
    return installation


def uninstall_for_user(user, app_key: str) -> UserAppInstallation:
    """Remove an app from a person's account. Their data is kept."""
    user_id = getattr(user, 'id', user)
    installation = UserAppInstallation.objects.filter(
        user_id=user_id, app_key=app_key
    ).first()
    if installation is None:
        raise RegistryError('That app is not installed in your account.')

    from django.utils import timezone

    installation.is_enabled = False
    installation.disabled_at = timezone.now()
    installation.save(update_fields=['is_enabled', 'disabled_at', 'modified'])
    _invalidate_user(user_id)
    return installation


def screens_for_apps(app_keys) -> dict:
    """Screens each uploaded app contributes, as dashboard routes.

    Built-in apps are absent: they own fixed routes compiled into the client.
    An uploaded app's route is derived here rather than taken from the
    manifest, so an app cannot claim a path belonging to the platform.
    """
    wanted = set(app_keys or [])
    if not wanted:
        return {}

    result: dict = {}
    try:
        from .build_models import AppPackage

        packages = (
            AppPackage.objects.filter(key__in=wanted, live_build__isnull=False)
            .select_related('live_build')
        )
        for package in packages:
            build = package.live_build
            if build is None or not build.is_runnable:
                continue
            screens = []
            for screen in (build.manifest or {}).get('screens') or []:
                if not isinstance(screen, dict) or not screen.get('id'):
                    continue
                screens.append({
                    'id': screen['id'],
                    'title': screen.get('title') or screen['id'],
                    'roles': list(screen.get('roles') or []),
                    'route': f"/dashboard/a/{package.key}/{screen['id']}",
                })
            if screens:
                result[package.key] = screens
    except Exception:  # noqa: BLE001 - navigation must survive a database problem
        return {}
    return result


def get_installation(school, app_key: str):
    """One school's installation row for an app, or None.

    The call path needs the row itself rather than a yes/no, because the
    pinned build lives on it.
    """
    school_id = getattr(school, 'id', school)
    if not school_id or not app_key:
        return None
    return (
        AppInstallation.objects.select_related('pinned_build')
        .filter(school_id=school_id, app_key=app_key)
        .first()
    )


def list_installations(school) -> list:
    """Raw installation rows for a school, for the console."""
    school_id = getattr(school, 'id', school)
    if not school_id:
        return []
    return list(
        AppInstallation.objects.filter(school_id=school_id).select_related('installed_by')
    )


def describe_for_school(school) -> list[dict]:
    """The catalogue annotated with this school's state — what the console shows."""
    installations = {i.app_key: i for i in list_installations(school)}
    rows = []
    for manifest in list_catalogue():
        installation = installations.get(manifest.key)
        row = manifest.as_dict()
        row.update(
            {
                'installed': manifest.is_core or installation is not None,
                'enabled': manifest.is_core
                or bool(installation and installation.is_active),
                'licence_expiry': (
                    installation.licence_expiry.isoformat()
                    if installation and installation.licence_expiry
                    else None
                ),
                'expired': bool(installation and installation.is_expired),
                'installed_at': (
                    installation.installed_at.isoformat() if installation else None
                ),
                'note': installation.note if installation else '',
            }
        )
        rows.append(row)
    return rows


# Writes ----------------------------------------------------------------------


class RegistryError(RuntimeError):
    """A refused install or uninstall, with a message safe to show a founder."""


def _resolve_app(app_key: str):
    """(name, is_core, exists) for a built-in *or* an uploaded app.

    install/uninstall have to work for both. Uploaded apps are not in the
    built-in manifest registry — their record is an AppPackage — so an
    app-key check that only consulted the built-in registry would reject every
    uploaded app.
    """
    manifest = get_app(app_key)
    if manifest is not None:
        return manifest.name, manifest.is_core, True
    from .build_models import AppPackage

    package = AppPackage.objects.filter(key=app_key).first()
    if package is not None:
        return package.name, False, True
    return app_key, False, False


def install(school, app_key: str, *, by=None, licence_expiry=None, note='',
            allowed_roles=None, notify=True) -> AppInstallation:
    """Give a school an app, or re-enable one that was turned off.

    ``allowed_roles`` narrows who at the school gets it — an empty list means
    everyone the app is built for. On install the affected users are notified,
    so the app appearing in their account is never a surprise.
    """
    name, is_core, exists = _resolve_app(app_key)
    if not exists:
        raise RegistryError(f'There is no app called {app_key!r}.')
    if school is None:
        raise RegistryError('An app must be installed for a specific school.')
    if is_core:
        raise RegistryError(
            f'{name} is part of the platform and is always available; '
            'it does not need installing.'
        )

    roles = [str(r).upper() for r in (allowed_roles or []) if str(r).strip()]
    if 'EVERYONE' in roles or '*' in roles:
        roles = []

    school_id = getattr(school, 'id', school)
    installation, _created = AppInstallation.objects.update_or_create(
        school_id=school_id,
        app_key=app_key,
        defaults={
            'is_enabled': True,
            'allowed_roles': roles,
            'licence_expiry': licence_expiry,
            'installed_by': by,
            'disabled_at': None,
            'note': note or '',
        },
    )
    _invalidate(school_id)
    if notify:
        _notify_school_app(school_id, app_key, name, roles, installed=True)
    return installation


def uninstall(school, app_key: str, *, by=None, note='', notify=True) -> AppInstallation:
    """Turn an app off for a school. The school's data is kept.

    The users who had it are notified that it is gone, so it disappearing from
    their account is never a surprise either.
    """
    name, is_core, exists = _resolve_app(app_key)
    if not exists:
        raise RegistryError(f'There is no app called {app_key!r}.')
    if is_core:
        raise RegistryError(f'{name} is part of the platform and cannot be removed.')

    school_id = getattr(school, 'id', school)
    installation = AppInstallation.objects.filter(
        school_id=school_id, app_key=app_key
    ).first()
    if installation is None:
        raise RegistryError(f'{name} is not installed for this school.')

    from django.utils import timezone

    roles_that_had_it = list(installation.allowed_roles or [])
    installation.is_enabled = False
    installation.disabled_at = timezone.now()
    if note:
        installation.note = note
    if by is not None:
        installation.installed_by = installation.installed_by or by
    installation.save(update_fields=['is_enabled', 'disabled_at', 'note', 'installed_by', 'modified'])
    _invalidate(school_id)
    if notify:
        _notify_school_app(school_id, app_key, name, roles_that_had_it, installed=False)
    return installation


def users_for_roles(school_id, app_key: str, roles) -> list:
    """Active users at a school in the given roles.

    Empty ``roles`` means everyone the app is built for, so an install for
    "everyone" still cannot reach a role the app never supported.
    """
    from django.contrib.auth import get_user_model

    wanted = {str(r).upper() for r in (roles or []) if str(r).strip()}
    if not wanted:
        wanted = _uploaded_app_roles(app_key)
    queryset = get_user_model().objects.filter(
        school_id=school_id, is_active=True, is_drafted=False
    )
    if wanted:
        queryset = queryset.filter(role__in=wanted)
    return list(queryset[:5000])


def _notify_school_app(school_id, app_key, name, roles, *, installed: bool) -> None:
    """Tell the affected users an app arrived in, or left, their account."""
    try:
        from apps.notifications.utils import notify_users

        recipients = users_for_roles(school_id, app_key, roles)
        if not recipients:
            return
        if installed:
            title = f'New app: {name}'
            message = f'{name} has been added to your account. Open it from your menu.'
        else:
            title = f'{name} removed'
            message = f'{name} is no longer available on your account.'
        notify_users(recipients, title, message, notification_type='platform')
    except Exception:  # noqa: BLE001 - a notification must never block the install
        import logging

        logging.getLogger(__name__).exception('App install/removal notify failed for %s', app_key)


def is_visible_to_school(package, school_id) -> bool:
    """Whether a school may see and install this uploaded app.

    The publisher chooses the audience before publishing: every school, or a
    named set. A school outside the audience never sees the app in its store.
    """
    if getattr(package, 'visible_to_all', True):
        return True
    allowed = {str(s) for s in (getattr(package, 'visible_school_ids', None) or [])}
    return str(school_id) in allowed


def set_licence_expiry(school, app_key: str, expiry) -> AppInstallation:
    """Change when a school's licence for an app runs out."""
    school_id = getattr(school, 'id', school)
    installation = AppInstallation.objects.filter(
        school_id=school_id, app_key=app_key
    ).first()
    if installation is None:
        raise RegistryError('That app is not installed for this school.')
    installation.licence_expiry = expiry
    installation.save(update_fields=['licence_expiry', 'modified'])
    _invalidate(school_id)
    return installation


def install_defaults(school, *, by=None) -> int:
    """Give a new school every app that ships with a subscription.

    Called when a school is created, so a new school is usable immediately
    rather than arriving with an empty platform.
    """
    installed = 0
    for manifest in all_manifests().values():
        if manifest.tier == AppTier.INCLUDED and manifest.needs_school_licence:
            install(school, manifest.key, by=by, note='Included with subscription.')
            installed += 1
    return installed

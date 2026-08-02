"""What an EduIgnite app declares about itself.

An "app" here is a feature module that ships inside the platform — Attendance,
Fees, the Library. It is not an uploaded package: the code is compiled into the
release, and *installing* an app means granting a school a licence to use it.

Every app declares itself in ``apps/<name>/eduignite_app.py``:

    from apps.registry.manifest import AppManifest, AppTier, register

    register(AppManifest(
        key='attendance',
        name='Attendance',
        summary='Daily attendance per class, with absence alerts to parents.',
        icon='ClipboardCheck',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER'],
        routes=['/dashboard/attendance'],
        api_prefixes=['attendance/'],
        core_services=['students'],
        owns_data=['attendance records', 'attendance sessions'],
    ))

The declaration lives beside the code it describes so the two cannot drift, and
it is plain Python — no schema file to parse, no upload step, and a typo is a
startup error rather than a silent misconfiguration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class AppScope(str, Enum):
    """Who decides that an app is in use.

    SCHOOL   the school buys it and everyone there gets it, subject to roles.
             Attendance, Fees, a payment wallet.
    USER     a person installs it into their own account. Study material like
             GCE Past Questions or Math O-Level — one teacher wanting it should
             not require the whole school to buy it.
    BOTH     the school holds the licence and each user opts in. "The school
             purchases it and authorised users use it" — Teacher Attendance.
    """

    SCHOOL = 'school'
    USER = 'user'
    BOTH = 'both'


class AppPricing(str, Enum):
    """How an app is paid for.

    ONE_TIME never expires once bought. SUBSCRIPTION uses the installation's
    licence_expiry, so access stops on its own when a renewal is missed.
    """

    FREE = 'free'
    ONE_TIME = 'one_time'
    SUBSCRIPTION = 'subscription'


class AppTier(str, Enum):
    """What a school has to do to get an app.

    CORE apps are the platform itself — accounts, schools, student records,
    notifications. They cannot be uninstalled, because nothing else works
    without them, and they are never billed separately.

    INCLUDED apps come with any subscription. STANDARD and PREMIUM are sold,
    and a school only sees them once a founder installs them.
    """

    CORE = 'core'
    INCLUDED = 'included'
    STANDARD = 'standard'
    PREMIUM = 'premium'


@dataclass(frozen=True)
class AppManifest:
    """An app's declaration of itself.

    Frozen on purpose: a manifest describes a shipped release, so nothing
    should be able to mutate one at runtime.
    """

    #: Stable identifier. Never change it — installations reference it.
    key: str
    #: Human name, shown in the console and the school's app list.
    name: str
    #: One sentence a school administrator would understand.
    summary: str
    #: Lucide icon name, so web, desktop and mobile can all render it.
    icon: str = 'Boxes'
    tier: AppTier = AppTier.STANDARD
    scope: AppScope = AppScope.SCHOOL
    pricing: AppPricing = AppPricing.FREE
    #: How often a subscription renews: 'monthly', 'termly', 'yearly'. Empty for
    #: free and one-time apps, which do not recur.
    interval: str = ''
    #: Amount in `currency`. Zero for free apps.
    price: float = 0.0
    currency: str = 'XAF'
    #: Roles that get this app in their navigation once it is installed.
    roles: list[str] = field(default_factory=list)
    #: Frontend routes this app owns. Used to guard pages.
    routes: list[str] = field(default_factory=list)
    #: API path prefixes under /api/v1/ this app owns.
    api_prefixes: list[str] = field(default_factory=list)
    #: Core services this app reads through — e.g. ['students'].
    core_services: list[str] = field(default_factory=list)
    #: Plain-language list of what this app stores, for the uninstall warning.
    owns_data: list[str] = field(default_factory=list)
    #: Shown to a founder deciding whether to install it.
    price_hint: str = ''

    @property
    def installs_per_user(self) -> bool:
        """Whether an individual installs this into their own account."""
        return self.scope in (AppScope.USER, AppScope.BOTH)

    @property
    def needs_school_licence(self) -> bool:
        """Whether the school must hold a licence before anyone can use it."""
        return self.scope in (AppScope.SCHOOL, AppScope.BOTH)

    @property
    def is_core(self) -> bool:
        return self.tier == AppTier.CORE

    @property
    def is_uninstallable(self) -> bool:
        return self.tier != AppTier.CORE

    def as_dict(self) -> dict:
        return {
            'key': self.key,
            'name': self.name,
            'summary': self.summary,
            'icon': self.icon,
            'tier': self.tier.value,
            'scope': self.scope.value,
            'pricing': self.pricing.value,
            'interval': self.interval,
            'price': self.price,
            'currency': self.currency,
            'installs_per_user': self.installs_per_user,
            'needs_school_licence': self.needs_school_licence,
            'roles': list(self.roles),
            'routes': list(self.routes),
            'api_prefixes': list(self.api_prefixes),
            'core_services': list(self.core_services),
            'owns_data': list(self.owns_data),
            'price_hint': self.price_hint,
            'is_core': self.is_core,
            'is_uninstallable': self.is_uninstallable,
        }


class ManifestError(RuntimeError):
    """Raised at startup when a declaration is wrong.

    Failing loudly here is deliberate: a bad manifest that loaded quietly would
    show up much later as a school mysteriously missing a feature.
    """


_REGISTRY: dict[str, AppManifest] = {}


def validate_manifest(manifest: AppManifest) -> AppManifest:
    """Rules every manifest must satisfy, however it was authored.

    Applied both to built-in declarations and to uploaded ones, so an uploaded
    app is held to exactly the same standard as a shipped one.
    """
    if not manifest.key or not manifest.key.replace('_', '').isalnum():
        raise ManifestError(
            f'App key {manifest.key!r} must be a non-empty alphanumeric slug.'
        )
    if not manifest.name or not manifest.summary:
        raise ManifestError(f'App {manifest.key!r} needs both a name and a summary.')
    if manifest.pricing != AppPricing.FREE and manifest.price <= 0:
        raise ManifestError(
            f'App {manifest.key!r} is priced {manifest.pricing.value} but has no price. '
            'A paid app with no price would be sold for nothing.'
        )
    if manifest.pricing == AppPricing.FREE and manifest.price:
        raise ManifestError(
            f'App {manifest.key!r} is free but carries a price of {manifest.price}.'
        )
    if manifest.is_core and manifest.pricing != AppPricing.FREE:
        raise ManifestError(
            f'App {manifest.key!r} is Core, so it cannot be sold separately.'
        )
    return manifest


def register(manifest: AppManifest) -> AppManifest:
    """Add a built-in app to the registry. Called from ``eduignite_app.py``."""
    validate_manifest(manifest)
    existing = _REGISTRY.get(manifest.key)
    if existing is not None and existing != manifest:
        raise ManifestError(
            f'Two different apps both declare the key {manifest.key!r}. '
            'Keys identify installations and must be unique.'
        )
    _REGISTRY[manifest.key] = manifest
    return manifest


def all_manifests() -> dict[str, AppManifest]:
    """Every declared app, keyed by app key."""
    return dict(_REGISTRY)


def get_manifest(key: str) -> AppManifest | None:
    return _REGISTRY.get(key)


def clear_registry() -> None:
    """Test helper. Never call this from application code."""
    _REGISTRY.clear()

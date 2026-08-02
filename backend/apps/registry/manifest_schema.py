"""Validating an uploaded manifest.json into an AppManifest.

Built-in apps declare themselves in Python, so a mistake there is a startup
error. Uploaded manifests arrive as JSON through a browser, so everything here
assumes the input is wrong until proved otherwise, and every rejection carries
a message meant for whoever uploaded it.

The output is the same :class:`AppManifest` built-in apps use, so the catalogue,
install checks and console treat an uploaded app exactly like a shipped one.
"""

from __future__ import annotations

import re

from .manifest import (
    AppManifest, AppPricing, AppScope, AppTier, ManifestError, validate_manifest,
)

#: Field types a collection may declare.
FIELD_TYPES = {
    'string', 'text', 'integer', 'decimal', 'boolean',
    'date', 'datetime', 'enum', 'reference', 'json',
}

#: Core objects an app may point a reference field at. Deliberately small.
CORE_REFERENCES = {'core.user', 'core.student', 'core.school_class', 'core.school'}

#: Core permissions an app may request. Read-only in v1 — an app that could
#: write student records or marks is one bad build away from corrupting a term
#: of data, and nothing we want to build first needs it.
CORE_PERMISSIONS = {'students:read', 'users:read', 'classes:read', 'school:read'}

#: How often a subscription may renew.
BILLING_INTERVALS = {'monthly', 'termly', 'yearly'}

SEMVER = re.compile(r'^\d+\.\d+\.\d+$')
RUNTIME_API = re.compile(r'^\d+\.(x|\d+)$')


def _require(condition, message):
    if not condition:
        raise ManifestError(message)


def _slug(value) -> bool:
    return isinstance(value, str) and bool(value) and value.replace('_', '').isalnum()


def _validate_collections(collections) -> None:
    _require(isinstance(collections, list), 'collections must be a list.')
    seen = set()
    for collection in collections:
        _require(isinstance(collection, dict), 'Each collection must be an object.')
        name = collection.get('name', '')
        _require(_slug(name), f'Collection name {name!r} must be an alphanumeric slug.')
        _require(name not in seen, f'Collection {name!r} is declared twice.')
        seen.add(name)

        fields = collection.get('fields')
        _require(isinstance(fields, list) and fields,
                 f'Collection {name!r} declares no fields.')

        field_names = set()
        for spec in fields:
            _require(isinstance(spec, dict), f'Collection {name!r} has a malformed field.')
            fname = spec.get('name', '')
            _require(_slug(fname),
                     f'Field name {fname!r} in {name!r} must be an alphanumeric slug.')
            _require(fname not in field_names,
                     f'Field {fname!r} is declared twice in {name!r}.')
            field_names.add(fname)

            ftype = spec.get('type')
            _require(ftype in FIELD_TYPES,
                     f'Field {name}.{fname} has unknown type {ftype!r}.')
            if ftype == 'enum':
                values = spec.get('values')
                _require(isinstance(values, list) and values,
                         f'Enum field {name}.{fname} declares no values.')
            if ftype == 'reference':
                target = spec.get('to')
                _require(
                    target in CORE_REFERENCES,
                    f'Field {name}.{fname} references {target!r}, which apps cannot '
                    f'reach. Allowed: {", ".join(sorted(CORE_REFERENCES))}.',
                )


def _validate_screens(screens, roles) -> None:
    _require(isinstance(screens, list), 'screens must be a list.')
    seen_ids, seen_routes = set(), set()
    for screen in screens:
        _require(isinstance(screen, dict), 'Each screen must be an object.')
        sid = screen.get('id', '')
        _require(isinstance(sid, str) and sid, 'Every screen needs an id.')
        _require(sid not in seen_ids, f'Screen id {sid!r} is used twice.')
        seen_ids.add(sid)

        _require(bool(screen.get('title')), f'Screen {sid!r} needs a title.')

        route = screen.get('route', '')
        _require(isinstance(route, str) and route.startswith('/'),
                 f'Screen {sid!r} route must start with "/".')
        _require(route not in seen_routes, f'Route {route!r} is claimed twice.')
        seen_routes.add(route)

        for role in screen.get('roles') or []:
            _require(
                role in roles,
                f'Screen {sid!r} is for role {role!r}, which the app does not declare.',
            )


def _validate_permissions(permissions, collections) -> None:
    _require(isinstance(permissions, dict), 'permissions must be an object.')
    declared = {c.get('name') for c in collections if isinstance(c, dict)}

    for entry in permissions.get('core') or []:
        _require(
            entry in CORE_PERMISSIONS,
            f'Permission {entry!r} is not available to apps. Allowed: '
            f'{", ".join(sorted(CORE_PERMISSIONS))}. Apps cannot write Core data.',
        )

    for entry in permissions.get('collections') or []:
        _require(isinstance(entry, str) and ':' in entry,
                 f'Collection permission {entry!r} must look like "name:read".')
        name, _, action = entry.partition(':')
        _require(action in {'read', 'write'},
                 f'Collection permission {entry!r} must end in :read or :write.')
        _require(
            name in declared,
            f'Permission {entry!r} refers to collection {name!r}, '
            'which the app does not declare.',
        )


def _validate_handlers(handlers, roles) -> None:
    """Server functions the app exposes to its own UI.

    A handler the manifest does not declare cannot be called, so an app cannot
    ship a private entry point and reach it from its own screens.
    """
    _require(isinstance(handlers, list), 'handlers must be a list.')
    seen = set()
    for entry in handlers:
        _require(isinstance(entry, dict), 'Each handler must be an object.')
        name = entry.get('name')
        _require(_slug(name), f'Handler name {name!r} must be an alphanumeric slug.')
        _require(name not in seen, f'Handler {name!r} is declared twice.')
        seen.add(name)
        target = entry.get('target') or ''
        _require(
            isinstance(target, str) and '.' in target,
            f'Handler {name!r} needs a target like "handlers.clock_in".',
        )
        for role in entry.get('roles') or []:
            _require(
                role in roles,
                f'Handler {name!r} is for role {role!r}, which the app does not declare.',
            )


def _validate_jobs(jobs) -> None:
    _require(isinstance(jobs, list), 'jobs must be a list.')
    for job in jobs:
        _require(isinstance(job, dict), 'Each job must be an object.')
        name = job.get('name')
        _require(bool(name), 'Every job needs a name.')
        _require(bool(job.get('handler')), f'Job {name!r} needs a handler.')
        schedule = job.get('schedule', '')
        _require(
            isinstance(schedule, str) and len(schedule.split()) == 5,
            f'Job {name!r} needs a five-field cron schedule.',
        )


def manifest_from_dict(raw: dict) -> AppManifest:
    """Build and validate an AppManifest from an uploaded manifest.json."""
    _require(isinstance(raw, dict), 'manifest.json must be a JSON object.')

    version = raw.get('version', '')
    _require(bool(SEMVER.match(str(version))),
             f'version {version!r} must look like 1.2.0.')

    runtime_api = raw.get('runtime_api', '')
    _require(bool(RUNTIME_API.match(str(runtime_api))),
             f'runtime_api {runtime_api!r} must look like "1.x" or "1.4".')

    try:
        scope = AppScope(raw.get('scope', 'school'))
    except ValueError:
        raise ManifestError(
            f'scope {raw.get("scope")!r} must be one of: school, user, both.'
        ) from None

    pricing_raw = raw.get('pricing') or {}
    _require(isinstance(pricing_raw, dict), 'pricing must be an object.')
    try:
        pricing = AppPricing(pricing_raw.get('model', 'free'))
    except ValueError:
        raise ManifestError(
            f'pricing.model {pricing_raw.get("model")!r} must be one of: '
            'free, one_time, subscription.'
        ) from None

    interval = str(pricing_raw.get('interval') or '')
    if pricing == AppPricing.SUBSCRIPTION:
        # The interval is the founder's to set in the console; the manifest only
        # suggests one. An unknown or absent interval defaults to termly rather
        # than rejecting the upload, since it can be changed after publishing.
        if interval not in BILLING_INTERVALS:
            interval = 'termly'
    else:
        # A free or one-time app does not recur, so an interval would be
        # meaningless. Drop it rather than store a contradiction.
        interval = ''

    try:
        tier = AppTier(raw.get('tier', 'standard'))
    except ValueError:
        raise ManifestError(f'tier {raw.get("tier")!r} is not a known tier.') from None
    _require(
        tier != AppTier.CORE,
        'An uploaded app cannot declare itself Core. Core is the platform itself.',
    )

    roles = raw.get('roles') or []
    _require(isinstance(roles, list), 'roles must be a list.')

    collections = raw.get('collections') or []
    screens = raw.get('screens') or []

    _validate_collections(collections)
    _validate_screens(screens, roles)
    _validate_permissions(raw.get('permissions') or {}, collections)
    _validate_handlers(raw.get('handlers') or [], roles)
    _validate_jobs(raw.get('jobs') or [])

    manifest = AppManifest(
        key=str(raw.get('key', '')),
        name=str(raw.get('name', '')),
        summary=str(raw.get('summary', '')),
        icon=str(raw.get('icon') or 'Boxes'),
        tier=tier,
        scope=scope,
        pricing=pricing,
        interval=interval,
        price=float(pricing_raw.get('price') or 0),
        currency=str(pricing_raw.get('currency') or 'XAF'),
        roles=list(roles),
        routes=[s.get('route') for s in screens if isinstance(s, dict) and s.get('route')],
        api_prefixes=[],
        core_services=sorted(
            {p.split(':')[0] for p in (raw.get('permissions') or {}).get('core') or []}
        ),
        owns_data=[
            c.get('name') for c in collections if isinstance(c, dict) and c.get('name')
        ],
        price_hint=str(pricing_raw.get('hint') or ''),
    )

    # Held to exactly the same rules as a built-in declaration.
    validate_manifest(manifest)
    return manifest

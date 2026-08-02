"""EduIgnite app declaration for Schools & Classes.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='schools',
        name='Schools & Classes',
        summary='Schools, sub-schools, classes, the timetable and school settings.',
        icon='Building2',
        tier=AppTier.CORE,
        roles=[],
        routes=['/dashboard/institution', '/dashboard/schedule'],
        api_prefixes=['schools/', 'timetable/'],
        core_services=[],
        owns_data=['schools', 'classes', 'timetable entries'],
        price_hint='',
    )
)

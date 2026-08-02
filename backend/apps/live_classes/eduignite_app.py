"""EduIgnite app declaration for Live Classes.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='live_classes',
        name='Live Classes',
        summary='Schedule and run live lessons, with the class notified.',
        icon='Video',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
        routes=['/dashboard/live-classes'],
        api_prefixes=['live-classes/'],
        core_services=['students'],
        owns_data=['live class sessions'],
        price_hint='Standard',
    )
)

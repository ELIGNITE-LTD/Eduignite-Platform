"""EduIgnite app declaration for Staff Remarks.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='staff_remarks',
        name='Staff Remarks',
        summary='Private staff notes and conduct remarks on students.',
        icon='StickyNote',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER'],
        routes=[],
        api_prefixes=['staff-remarks/'],
        core_services=['students'],
        owns_data=['staff remarks'],
        price_hint='Standard',
    )
)

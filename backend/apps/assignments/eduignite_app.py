"""EduIgnite app declaration for Assignments.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='assignments',
        name='Assignments',
        summary='Set assignments with deadlines, collect and grade submissions.',
        icon='ClipboardList',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
        routes=['/dashboard/assignments'],
        api_prefixes=['assignments/'],
        core_services=['students'],
        owns_data=['assignments', 'submissions'],
        price_hint='Standard',
    )
)

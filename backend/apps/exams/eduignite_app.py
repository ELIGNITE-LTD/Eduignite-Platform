"""EduIgnite app declaration for Exams.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='exams',
        name='Exams',
        summary='Schedule exams and run them online with automatic marking.',
        icon='FileCheck2',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT'],
        routes=['/dashboard/exams'],
        api_prefixes=['exams/'],
        core_services=['students'],
        owns_data=['exams', 'exam submissions'],
        price_hint='Standard',
    )
)

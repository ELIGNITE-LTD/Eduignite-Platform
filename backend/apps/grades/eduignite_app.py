"""EduIgnite app declaration for Marks & Report Cards.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='grades',
        name='Marks & Report Cards',
        summary='Sequence marks, averages and official bilingual Cameroon report cards.',
        icon='NotebookPen',
        tier=AppTier.INCLUDED,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
        routes=['/dashboard/grades', '/dashboard/transcripts', '/dashboard/class-history', '/dashboard/class-marks', '/dashboard/conduct'],
        api_prefixes=['grades/'],
        core_services=['students'],
        owns_data=['marks', 'report cards', 'term and annual results'],
        price_hint='Included',
    )
)

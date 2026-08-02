"""EduIgnite app declaration for Digital Library.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='library',
        name='Digital Library',
        summary='Catalogue books, manage lending and chase overdue copies.',
        icon='Library',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'LIBRARIAN', 'TEACHER', 'STUDENT'],
        routes=['/dashboard/library'],
        api_prefixes=['library/'],
        core_services=['students'],
        owns_data=['books', 'loans', 'book requests'],
        price_hint='Standard',
    )
)

"""EduIgnite app declaration for Announcements.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='announcements',
        name='Announcements',
        summary='School-wide announcements to staff, students and families.',
        icon='Megaphone',
        tier=AppTier.INCLUDED,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
        routes=['/dashboard/announcements'],
        api_prefixes=['announcements/'],
        core_services=[],
        owns_data=['announcements'],
        price_hint='Included',
    )
)

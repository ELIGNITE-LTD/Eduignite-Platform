"""EduIgnite app declaration for Support.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='support',
        name='Support',
        summary='Support tickets and contributions to the platform.',
        icon='LifeBuoy',
        tier=AppTier.INCLUDED,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'BURSAR', 'LIBRARIAN'],
        routes=['/dashboard/support'],
        api_prefixes=['support/'],
        core_services=[],
        owns_data=['support tickets'],
        price_hint='Included',
    )
)

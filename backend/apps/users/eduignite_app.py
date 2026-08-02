"""EduIgnite app declaration for People.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='users',
        name='People',
        summary='Every account on the platform, their role and their profile.',
        icon='Users',
        tier=AppTier.CORE,
        roles=[],
        routes=['/dashboard/profile', '/dashboard/staff'],
        api_prefixes=['users/'],
        core_services=[],
        owns_data=['user accounts', 'profiles'],
        price_hint='',
    )
)

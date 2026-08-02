"""EduIgnite app declaration for Accounts & Sign-in.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='authentication',
        name='Accounts & Sign-in',
        summary='Sign-in, password reset and student activation by matricule.',
        icon='KeyRound',
        tier=AppTier.CORE,
        roles=[],
        routes=[],
        api_prefixes=['auth/'],
        core_services=[],
        owns_data=['sign-in sessions', 'activation tokens'],
        price_hint='',
    )
)

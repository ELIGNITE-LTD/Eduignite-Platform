"""EduIgnite app declaration for Platform Settings.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='platform',
        name='Platform Settings',
        summary='Platform-wide settings, branding, fees and public content.',
        icon='Settings2',
        tier=AppTier.CORE,
        roles=[],
        routes=['/dashboard/platform-settings', '/dashboard/subscription'],
        api_prefixes=['platform/'],
        core_services=[],
        owns_data=['platform settings', 'public events'],
        price_hint='',
    )
)

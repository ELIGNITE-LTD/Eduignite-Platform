"""EduIgnite app declaration for App Registry.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='registry',
        name='App Registry',
        summary='The catalogue of apps and which schools have them.',
        icon='Boxes',
        tier=AppTier.CORE,
        roles=[],
        routes=['/dashboard/apps'],
        api_prefixes=['registry/'],
        core_services=[],
        owns_data=['app installations'],
        price_hint='',
    )
)

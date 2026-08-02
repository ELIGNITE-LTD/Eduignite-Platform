"""EduIgnite app declaration for Orders.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='orders',
        name='Orders',
        summary='Orders and platform purchases.',
        icon='ShoppingCart',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR'],
        routes=[],
        api_prefixes=['orders/'],
        core_services=[],
        owns_data=['orders'],
        price_hint='Standard',
    )
)

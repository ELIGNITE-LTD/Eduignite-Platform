"""EduIgnite app declaration for Notifications.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='notifications',
        name='Notifications',
        summary='In-app and push notifications, mirrored to parents.',
        icon='BellRing',
        tier=AppTier.CORE,
        roles=[],
        routes=['/dashboard/notifications'],
        api_prefixes=['notifications/'],
        core_services=['students'],
        owns_data=['notifications', 'device tokens'],
        price_hint='',
    )
)

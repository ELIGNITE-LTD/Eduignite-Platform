"""EduIgnite app declaration for App Showcase.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='app_store',
        name='App Showcase',
        summary='The catalogue of downloadable EduIgnite apps shown to schools.',
        icon='Store',
        tier=AppTier.INCLUDED,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
        routes=['/dashboard/app-store'],
        api_prefixes=['app-store/'],
        core_services=[],
        owns_data=['showcase listings'],
        price_hint='Included',
    )
)

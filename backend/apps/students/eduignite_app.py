"""EduIgnite app declaration for Student Records.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='students',
        name='Student Records',
        summary='Student profiles, guardians, admission details and QR-verified ID cards.',
        icon='GraduationCap',
        tier=AppTier.CORE,
        roles=[],
        routes=['/dashboard/students', '/dashboard/id-cards', '/dashboard/health-records', '/dashboard/certificates'],
        api_prefixes=['students/'],
        core_services=[],
        owns_data=['student records', 'guardian links', 'ID cards'],
        price_hint='',
    )
)

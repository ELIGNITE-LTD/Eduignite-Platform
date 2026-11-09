"""EduIgnite app declaration for Higher Education.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='higher_ed',
        name='Higher Education',
        summary='Departments, programmes, academic calendar and grading policy for universities and higher institutions.',
        icon='GraduationCap',
        tier=AppTier.CORE,
        roles=[],
        routes=['/dashboard/higher'],
        api_prefixes=['higher-ed/'],
        core_services=['schools'],
        owns_data=['organizational units', 'programmes', 'academic years and periods', 'grading policy'],
        price_hint='',
    )
)

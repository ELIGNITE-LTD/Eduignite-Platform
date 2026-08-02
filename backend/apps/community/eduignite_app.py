"""EduIgnite app declaration for Community & Blog.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='community',
        name='Community & Blog',
        summary='School stories, testimonies and the public blog.',
        icon='Newspaper',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
        routes=['/dashboard/community', '/dashboard/log-post', '/dashboard/testimonials'],
        api_prefixes=['community/'],
        core_services=[],
        owns_data=['blog posts', 'testimonies', 'comments'],
        price_hint='Standard',
    )
)

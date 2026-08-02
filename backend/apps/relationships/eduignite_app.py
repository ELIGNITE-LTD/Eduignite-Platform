"""EduIgnite app declaration for Class Masters.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='relationships',
        name='Class Masters',
        summary='Class-master assignments and teacher-class relationships.',
        icon='Network',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER'],
        routes=[],
        api_prefixes=['relationships/'],
        core_services=['students'],
        owns_data=['class master assignments'],
        price_hint='Standard',
    )
)

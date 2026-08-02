"""EduIgnite app declaration for Messaging.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='chat',
        name='Messaging',
        summary='Direct and group chat for staff, students and parents.',
        icon='MessageCircle',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'BURSAR', 'LIBRARIAN'],
        routes=['/dashboard/chat'],
        api_prefixes=['chat/'],
        core_services=['students'],
        owns_data=['conversations', 'messages'],
        price_hint='Standard',
    )
)

"""EduIgnite app declaration for Feedback.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='feedback',
        name='Feedback',
        summary='Collect feedback from staff, students and parents.',
        icon='MessageSquareHeart',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
        routes=['/dashboard/feedback'],
        api_prefixes=['feedback/'],
        core_services=[],
        owns_data=['feedback entries'],
        price_hint='Standard',
    )
)

"""EduIgnite app declaration for AI Assistance.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='ai_features',
        name='AI Assistance',
        summary='Study plans, performance insights, career reports and exam preparation.',
        icon='Sparkles',
        tier=AppTier.PREMIUM,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
        routes=['/dashboard/ai-assistant', '/dashboard/career-orientation', '/dashboard/ai-feedback'],
        api_prefixes=['ai/'],
        core_services=['students'],
        owns_data=['AI requests', 'career reports', 'insights'],
        price_hint='Premium',
    )
)

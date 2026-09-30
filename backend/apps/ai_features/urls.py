from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import feature_views
from . import credit_views

app_name = 'ai_features'

router = DefaultRouter()
router.register(r'requests', views.AIRequestViewSet, basename='ai-request')
router.register(r'insights', views.AIInsightViewSet, basename='ai-insight')
router.register(r'exam-drafts', feature_views.AIExamDraftViewSet, basename='ai-exam-draft')
router.register(r'question-bank', feature_views.QuestionBankViewSet, basename='question-bank')
router.register(r'career-reports', feature_views.CareerOrientationReportViewSet, basename='career-report')
router.register(r'roadmaps', feature_views.AcademicRoadmapViewSet, basename='roadmap')
router.register(r'skill-gap', feature_views.SkillGapReportViewSet, basename='skill-gap')
router.register(r'guidance-reports', feature_views.StudentGuidanceReportViewSet, basename='guidance-report')

urlpatterns = [
    path('', include(router.urls)),
    path('chat/', views.direct_chat, name='direct-chat'),
    path('chat/quota/', views.chat_quota_view, name='chat-quota'),

    # AI credits
    path('credits/', credit_views.credit_balance, name='credit-balance'),
    path('credits/estimate/', credit_views.credit_estimate, name='credit-estimate'),
    path('credits/history/', credit_views.CreditHistoryView.as_view(), name='credit-history'),
    path('credits/usage/', credit_views.credit_usage, name='credit-usage'),
    path('credits/pricing/', credit_views.credit_pricing, name='credit-pricing'),
    path('credits/purchase/', credit_views.credit_purchase, name='credit-purchase'),
    path('credits/purchase/<str:transaction_id>/', credit_views.credit_purchase_status, name='credit-purchase-status'),
    path('credits/admin/config/', credit_views.admin_credit_config, name='credit-admin-config'),
    path('credits/admin/economics/', credit_views.admin_credit_economics, name='credit-admin-economics'),
    path('credits/admin/account/', credit_views.admin_credit_account, name='credit-admin-account'),
    path('credits/admin/adjust/', credit_views.admin_credit_adjust, name='credit-admin-adjust'),
]

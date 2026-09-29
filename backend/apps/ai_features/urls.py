from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import feature_views

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
]

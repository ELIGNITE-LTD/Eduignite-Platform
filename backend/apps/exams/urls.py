from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ExamSubmissionViewSet, ExamViewSet

app_name = 'exams'

router = DefaultRouter()
router.register(r'exams', ExamViewSet, basename='exam')
router.register(r'submissions', ExamSubmissionViewSet, basename='exam-submission')

urlpatterns = [
    path('', include(router.urls)),
]

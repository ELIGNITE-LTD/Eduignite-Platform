from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AssignmentSubmissionViewSet, AssignmentViewSet

app_name = 'assignments'

router = DefaultRouter()
router.register(r'assignments', AssignmentViewSet, basename='assignment')
router.register(r'submissions', AssignmentSubmissionViewSet, basename='assignment-submission')

urlpatterns = [
    path('', include(router.urls)),
]


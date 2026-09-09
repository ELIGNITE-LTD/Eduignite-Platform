"""URL routes for Surveys. Mounted at ``/api/v1/surveys/`` by ``config.urls``."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import SurveyViewSet

app_name = 'surveys'

router = DefaultRouter()
router.register(r'', SurveyViewSet, basename='survey')

urlpatterns = [
    path('', include(router.urls)),
]

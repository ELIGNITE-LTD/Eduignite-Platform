"""URL routes for Surveys. Mounted at ``/api/v1/surveys/`` by ``config.urls``."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import SurveyPublisherViewSet, SurveyViewSet

app_name = 'surveys'

router = DefaultRouter()
# Registered before the empty prefix so "publishers/" is never read as a
# survey id by the detail route.
router.register(r'publishers', SurveyPublisherViewSet, basename='survey-publisher')
router.register(r'', SurveyViewSet, basename='survey')

urlpatterns = [
    path('', include(router.urls)),
]

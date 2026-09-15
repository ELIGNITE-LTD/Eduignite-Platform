from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import AnnouncementAudienceGrantViewSet, AnnouncementViewSet

app_name = 'announcements'

router = DefaultRouter()
router.register(r'audience-grants', AnnouncementAudienceGrantViewSet, basename='announcement-audience-grant')
router.register(r'announcements', AnnouncementViewSet, basename='announcement')

urlpatterns = [
    path('', include(router.urls)),
]

from django.urls import path, include
from rest_framework.routers import DefaultRouter

app_name = 'announcements'
from .views import AnnouncementViewSet

router = DefaultRouter()
router.register(r'announcements', AnnouncementViewSet, basename='announcement')

urlpatterns = [
    path('', include(router.urls)),
]

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LiveClassViewSet

app_name = 'live_classes'

router = DefaultRouter()
router.register(r'', LiveClassViewSet, basename='live-class')

urlpatterns = [
    path('', include(router.urls)),
]

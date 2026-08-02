from django.urls import path, include
from rest_framework.routers import DefaultRouter

app_name = 'support'
from .views import SupportContributionViewSet

router = DefaultRouter()
router.register(r'contributions', SupportContributionViewSet, basename='support-contribution')

urlpatterns = [
    path('', include(router.urls)),
]

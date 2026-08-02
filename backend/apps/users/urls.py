from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, FounderProfileViewSet

app_name = 'users'

router = DefaultRouter()
router.register(r'founders', FounderProfileViewSet, basename='founder')
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    path('', include(router.urls)),
]

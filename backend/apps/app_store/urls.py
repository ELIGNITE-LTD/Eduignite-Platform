from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AppStoreItemViewSet

app_name = 'app_store'

router = DefaultRouter()
router.register(r'apps', AppStoreItemViewSet, basename='app-store-item')

urlpatterns = [
    path('', include(router.urls)),
]

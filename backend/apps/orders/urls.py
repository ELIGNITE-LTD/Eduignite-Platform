from django.urls import path, include
from rest_framework.routers import DefaultRouter

app_name = 'orders'
from .views import OrderViewSet

router = DefaultRouter()
router.register(r'orders', OrderViewSet, basename='order')

urlpatterns = [
    path('', include(router.urls)),
]

from django.urls import path, include
from rest_framework.routers import DefaultRouter

app_name = 'staff_remarks'
from .views import StaffRemarkViewSet

router = DefaultRouter()
router.register(r'remarks', StaffRemarkViewSet, basename='staff-remark')

urlpatterns = [
    path('', include(router.urls)),
]

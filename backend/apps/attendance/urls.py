from django.urls import path, include
from rest_framework.routers import DefaultRouter

app_name = 'attendance'
from .views import AttendanceSessionViewSet, AttendanceRecordViewSet, TeacherAttendanceViewSet

router = DefaultRouter()
router.register(r'sessions', AttendanceSessionViewSet, basename='attendance-session')
router.register(r'records', AttendanceRecordViewSet, basename='attendance-record')
router.register(r'teacher-attendance', TeacherAttendanceViewSet, basename='teacher-attendance')

urlpatterns = [
    path('', include(router.urls)),
]

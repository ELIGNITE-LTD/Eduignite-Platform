from django.urls import path, include
from rest_framework.routers import DefaultRouter

app_name = 'students'
from .views import (
    GuardianStudentsView,
    StudentGuardianCollectionView,
    StudentGuardianDetailView,
    StudentViewSet,
    ParentStudentLinkViewSet,
)

router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'parent-student-links', ParentStudentLinkViewSet, basename='parent-student-link')

urlpatterns = [
    path('schools/<str:school_id>/students/<uuid:student_id>/guardians/', StudentGuardianCollectionView.as_view(), name='student-guardians'),
    path('schools/<str:school_id>/students/<uuid:student_id>/guardians/<uuid:guardian_id>/', StudentGuardianDetailView.as_view(), name='student-guardian-detail'),
    path('guardians/me/students/', GuardianStudentsView.as_view(), name='guardian-me-students'),
    path('guardians/<uuid:guardian_id>/students/', GuardianStudentsView.as_view(), name='guardian-students'),
    path('', include(router.urls)),
]

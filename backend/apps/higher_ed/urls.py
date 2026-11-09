"""URL routes for Higher Education. Mounted at ``/api/v1/higher-ed/`` by ``config.urls``."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademicPeriodViewSet,
    AcademicYearViewSet,
    GradingPolicyView,
    GradingPresetsView,
    OrganizationalUnitViewSet,
    ProgrammeViewSet,
    ProgrammeYearViewSet,
    SetupStatusView,
)

app_name = 'higher_ed'

router = DefaultRouter()
router.register(r'units', OrganizationalUnitViewSet, basename='he-unit')
router.register(r'programmes', ProgrammeViewSet, basename='he-programme')
router.register(r'programme-years', ProgrammeYearViewSet, basename='he-programme-year')
router.register(r'academic-years', AcademicYearViewSet, basename='he-academic-year')
router.register(r'academic-periods', AcademicPeriodViewSet, basename='he-academic-period')

urlpatterns = [
    path('setup-status/', SetupStatusView.as_view(), name='setup-status'),
    path('grading-presets/', GradingPresetsView.as_view(), name='grading-presets'),
    path('grading-policy/', GradingPolicyView.as_view(), name='grading-policy'),
    path('', include(router.urls)),
]

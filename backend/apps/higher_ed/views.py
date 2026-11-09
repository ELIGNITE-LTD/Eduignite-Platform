"""Higher Education endpoints, mounted at /api/v1/higher-ed/.

Every query is filtered by the caller's institution (``user.school``) and every
view requires ``IsHigherEdInstitution`` (403 for non-higher schools; writes only
for the institution administrator).
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from . import api, grading_presets
from .models import AcademicPeriod, AcademicYear, OrganizationalUnit, Programme, ProgrammeYear
from .permissions import IsHigherEdInstitution
from .serializers import (
    AcademicPeriodSerializer,
    AcademicYearSerializer,
    GradingPolicySerializer,
    OrganizationalUnitSerializer,
    ProgrammeSerializer,
    ProgrammeYearSerializer,
)


def _as_api_error(exc):
    if isinstance(exc, DjangoValidationError):
        return serializers.ValidationError(exc.message_dict if hasattr(exc, 'error_dict') else exc.messages)
    return serializers.ValidationError({'detail': 'This already exists or is still in use.'})


class SchoolScopedViewSet(viewsets.ModelViewSet):
    permission_classes = [IsHigherEdInstitution]
    http_method_names = ['get', 'post', 'patch', 'put', 'delete', 'head', 'options']

    def get_queryset(self):
        return self.queryset.filter(school=self.request.user.school)

    def _save(self, serializer, **extra):
        try:
            with transaction.atomic():
                return serializer.save(**extra)
        except (DjangoValidationError, IntegrityError) as exc:
            raise _as_api_error(exc)

    def perform_create(self, serializer):
        return self._save(serializer, school=self.request.user.school)

    def perform_update(self, serializer):
        return self._save(serializer)

    def perform_destroy(self, instance):
        try:
            with transaction.atomic():
                instance.delete()
        except IntegrityError as exc:
            raise _as_api_error(exc)
        except Exception as exc:  # ProtectedError: still referenced
            if exc.__class__.__name__ == 'ProtectedError':
                raise serializers.ValidationError({'detail': 'This is still used by other records.'})
            raise


class OrganizationalUnitViewSet(SchoolScopedViewSet):
    queryset = OrganizationalUnit.objects.select_related('parent')
    serializer_class = OrganizationalUnitSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        unit_type = self.request.query_params.get('unit_type')
        return qs.filter(unit_type=unit_type) if unit_type else qs


class ProgrammeViewSet(SchoolScopedViewSet):
    queryset = Programme.objects.select_related('department').prefetch_related('years')
    serializer_class = ProgrammeSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        department = self.request.query_params.get('department')
        return qs.filter(department_id=department) if department else qs

    def perform_create(self, serializer):
        programme = super().perform_create(serializer)
        api.ensure_programme_years(programme)

    def perform_update(self, serializer):
        programme = super().perform_update(serializer)
        api.ensure_programme_years(programme)


class ProgrammeYearViewSet(SchoolScopedViewSet):
    queryset = ProgrammeYear.objects.select_related('programme')
    serializer_class = ProgrammeYearSerializer

    def get_queryset(self):
        qs = self.queryset.filter(programme__school=self.request.user.school)
        programme = self.request.query_params.get('programme')
        return qs.filter(programme_id=programme) if programme else qs

    def perform_create(self, serializer):
        return self._save(serializer)


class AcademicYearViewSet(SchoolScopedViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer


class AcademicPeriodViewSet(SchoolScopedViewSet):
    queryset = AcademicPeriod.objects.select_related('academic_year')
    serializer_class = AcademicPeriodSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        year = self.request.query_params.get('academic_year')
        return qs.filter(academic_year_id=year) if year else qs


class GradingPresetsView(APIView):
    """The shipped presets an institution can pick from."""

    permission_classes = [IsHigherEdInstitution]

    def get(self, request):
        return Response([grading_presets.get_preset(key) for key in grading_presets.preset_keys()])


class GradingPolicyView(APIView):
    """The institution's grading policy: GET it, PUT/PATCH to pick a preset or edit thresholds."""

    permission_classes = [IsHigherEdInstitution]

    def _policy(self, request):
        from .models import GradingPolicy

        return GradingPolicy.objects.filter(school=request.user.school).first()

    def get(self, request):
        policy = self._policy(request)
        return Response(GradingPolicySerializer(policy).data if policy else None)

    def put(self, request):
        policy = self._policy(request)
        serializer = GradingPolicySerializer(policy, data=request.data, partial=policy is not None,
                                             context={'request': request})
        serializer.is_valid(raise_exception=True)
        try:
            saved = api.set_grading_policy(
                request.user.school,
                serializer.validated_data['preset_key'],
                serializer.validated_data['thresholds'],
            )
        except DjangoValidationError as exc:
            raise _as_api_error(exc)
        return Response(GradingPolicySerializer(saved).data, status=status.HTTP_200_OK)

    patch = put


class SetupStatusView(APIView):
    permission_classes = [IsHigherEdInstitution]

    def get(self, request):
        return Response(api.setup_status(request.user.school))

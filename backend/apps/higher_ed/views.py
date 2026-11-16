"""Higher Education endpoints, mounted at /api/v1/higher-ed/.

Every query is filtered by the caller's institution (``user.school``) and every
view requires ``IsHigherEdInstitution`` (403 for non-higher schools; writes only
for the institution administrator).
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, models, transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import api, grading_presets, results as result_logic
from .models import (
    AcademicPeriod,
    AcademicYear,
    CourseOffering,
    CourseResult,
    CourseUnit,
    CurriculumEntry,
    DepartmentHead,
    Enrolment,
    OrganizationalUnit,
    Programme,
    ProgrammeYear,
)
from .permissions import IsHigherEdInstitution, IsHigherMember
from .serializers import (
    AcademicPeriodSerializer,
    AcademicYearSerializer,
    CourseOfferingSerializer,
    CourseUnitSerializer,
    CurriculumEntrySerializer,
    DepartmentHeadSerializer,
    EnrolmentSerializer,
    LecturerSerializer,
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


class CourseUnitViewSet(SchoolScopedViewSet):
    queryset = CourseUnit.objects.select_related('department')
    serializer_class = CourseUnitSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        department = self.request.query_params.get('department')
        return qs.filter(department_id=department) if department else qs


class CurriculumEntryViewSet(SchoolScopedViewSet):
    queryset = CurriculumEntry.objects.select_related('programme', 'programme_year', 'course_unit')
    serializer_class = CurriculumEntrySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        programme = self.request.query_params.get('programme')
        return qs.filter(programme_id=programme) if programme else qs

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """Credit totals per semester for ?programme=<id>, with warnings (never blocking)."""
        programme = None
        wanted = request.query_params.get('programme')
        if wanted:
            try:
                programme = Programme.objects.filter(school=request.user.school, id=wanted).first()
            except (DjangoValidationError, ValueError):
                programme = None
        if programme is None:
            raise serializers.ValidationError({'programme': 'Choose one of your programmes.'})
        return Response({
            'programme': programme.id,
            'required_credits': programme.required_credits,
            'periods': api.semester_credit_summary(programme),
        })


class CourseOfferingViewSet(SchoolScopedViewSet):
    queryset = CourseOffering.objects.select_related('course_unit', 'academic_period').prefetch_related('lecturers')
    serializer_class = CourseOfferingSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        period = self.request.query_params.get('academic_period')
        return qs.filter(academic_period_id=period) if period else qs


class DepartmentHeadViewSet(SchoolScopedViewSet):
    queryset = DepartmentHead.objects.select_related('unit', 'user')
    serializer_class = DepartmentHeadSerializer


class LecturerViewSet(viewsets.ViewSet):
    """Lecturer accounts of the institution: the TEACHER users, created through the platform's staff path."""

    permission_classes = [IsHigherEdInstitution]

    def _queryset(self, request):
        return api.lecturers_of(request.user.school).prefetch_related('he_headed_units').order_by('name')

    def list(self, request):
        return Response(LecturerSerializer(self._queryset(request), many=True, context={'request': request}).data)

    def retrieve(self, request, pk=None):
        user = self._queryset(request).filter(pk=pk).first()
        if user is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(LecturerSerializer(user, context={'request': request}).data)

    def create(self, request):
        user = api.create_lecturer(request, request.data)
        return Response(LecturerSerializer(user, context={'request': request}).data, status=status.HTTP_201_CREATED)


STUDENT_READERS = {'SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR'}


class EnrolmentViewSet(viewsets.GenericViewSet):
    """Students of the institution: admit a new student into a programme, list, filter, promote or change status.

    The institution administrator writes. Staff who work with students read. A student sees only themselves.
    """

    permission_classes = [IsHigherEdInstitution]
    serializer_class = EnrolmentSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        queryset = Enrolment.objects.filter(school=user.school).select_related(
            'student', 'student__user', 'programme', 'programme_year', 'academic_year')
        if user.role == 'STUDENT':
            return queryset.filter(student__user=user)
        if user.role not in STUDENT_READERS:
            return queryset.none()
        params = self.request.query_params
        for field in ('programme', 'programme_year', 'academic_year', 'status'):
            if params.get(field):
                queryset = queryset.filter(**{field: params[field]})
        term = (params.get('q') or '').strip()
        if term:
            queryset = queryset.filter(
                models.Q(student__user__name__icontains=term) | models.Q(student__name__icontains=term)
                | models.Q(student__user__matricule__icontains=term) | models.Q(student__matricule__icontains=term)
                | models.Q(student__admission_number__icontains=term))
        return queryset

    def list(self, request):
        return Response(self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data)

    def retrieve(self, request, pk=None):
        enrolment = self.get_queryset().filter(pk=pk).first()
        if enrolment is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(enrolment).data)

    def create(self, request):
        enrolment = api.enrol_new_student(request, request.data)
        enrolment = self.get_queryset().get(pk=enrolment.pk) if request.user.role != 'STUDENT' else enrolment
        return Response(self.get_serializer(enrolment).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        enrolment = self.get_queryset().filter(pk=pk).first()
        if enrolment is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(enrolment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                serializer.save()
        except (DjangoValidationError, IntegrityError) as exc:
            raise _as_api_error(exc)
        return Response(serializer.data)


ADMIN_ROLES = {'SCHOOL_ADMIN', 'SUB_ADMIN'}


class ResultsViewSet(viewsets.ViewSet):
    """Entering, submitting and publishing course results, and reading them.

    Lecturers work on the offerings they teach; the administrator works on all of them and publishes. A student
    only reads their own published results.
    """

    permission_classes = [IsHigherMember]

    def _offering(self, request, offering_id, *, admin_only=False):
        from rest_framework.exceptions import NotFound, PermissionDenied

        offering = (CourseOffering.objects.filter(school=request.user.school, pk=offering_id)
                    .select_related('course_unit', 'academic_period', 'academic_period__academic_year').first()
                    if offering_id else None)
        if offering is None:
            raise NotFound('Course offering not found.')
        is_admin = request.user.role in ADMIN_ROLES
        if admin_only and not is_admin:
            raise PermissionDenied('Only the administration can do this.')
        if not is_admin and not offering.lecturers.filter(pk=request.user.pk).exists():
            raise PermissionDenied('You can only work on the courses you teach.')
        return offering

    @action(detail=False, methods=['get'])
    def offerings(self, request):
        """The courses this person enters results for (all of them for the administration)."""
        user = request.user
        if user.role not in ADMIN_ROLES and user.role != 'TEACHER':
            return Response([])
        queryset = CourseOffering.objects.filter(school=user.school).select_related(
            'course_unit', 'academic_period', 'academic_period__academic_year')
        if user.role == 'TEACHER':
            queryset = queryset.filter(lecturers=user)
        if request.query_params.get('academic_period'):
            queryset = queryset.filter(academic_period=request.query_params['academic_period'])
        rows = []
        for offering in queryset.order_by('academic_period__academic_year__start_date', 'academic_period__order', 'course_unit__code'):
            counts = {s: CourseResult.objects.filter(offering=offering, status=s).count() for s in ('draft', 'submitted', 'published')}
            rows.append({
                'id': str(offering.id), 'course_code': offering.course_unit.code, 'course_title': offering.course_unit.title,
                'credits': offering.course_unit.credits, 'academic_period': str(offering.academic_period_id),
                'period_name': offering.academic_period.name, 'academic_year': offering.academic_period.academic_year.label,
                'enrolled': len(result_logic.roster(offering)), **counts,
            })
        return Response(rows)

    @action(detail=False, methods=['get'])
    def roster(self, request):
        return Response(result_logic.roster_rows(self._offering(request, request.query_params.get('offering'))))

    @action(detail=False, methods=['post'])
    def save(self, request):
        offering = self._offering(request, request.data.get('offering'))
        rows = request.data.get('rows')
        if not isinstance(rows, list):
            raise serializers.ValidationError({'rows': 'Send the list of scores.'})
        saved = result_logic.save_scores(offering, rows, request.user)
        return Response({'saved': saved, **result_logic.roster_rows(offering)})

    @action(detail=False, methods=['post'])
    def submit(self, request):
        offering = self._offering(request, request.data.get('offering'))
        return Response({**result_logic.submit(offering, request.user), **result_logic.roster_rows(offering)})

    @action(detail=False, methods=['post'])
    def publish(self, request):
        offering = self._offering(request, request.data.get('offering'), admin_only=True)
        return Response({**result_logic.publish(offering), **result_logic.roster_rows(offering)})

    @action(detail=False, methods=['post'])
    def unpublish(self, request):
        offering = self._offering(request, request.data.get('offering'), admin_only=True)
        return Response({**result_logic.unpublish(offering), **result_logic.roster_rows(offering)})

    @action(detail=False, methods=['get'])
    def mine(self, request):
        """A student's own published results, by semester, with GPA and credits."""
        from apps.students import api as students_api

        student = students_api.get_student_for_user(request.user)
        if request.user.role != 'STUDENT' or student is None:
            return Response({'detail': 'Only students have personal results.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(result_logic.transcript(student, request.user.school))

    @action(detail=False, methods=['get'])
    def transcript(self, request):
        """The administration reads any student's published transcript."""
        from apps.students import api as students_api

        if request.user.role not in ADMIN_ROLES:
            return Response({'detail': 'Only the administration can do this.'}, status=status.HTTP_403_FORBIDDEN)
        student = students_api.get_student(request.query_params.get('student'))
        if student is None or student.school_id != request.user.school_id:
            return Response({'detail': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(result_logic.transcript(student, request.user.school))


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

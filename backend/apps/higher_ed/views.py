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

from . import api, finance, grading_presets, results as result_logic
from .models import (
    AcademicPeriod,
    AcademicYear,
    CourseOffering,
    CourseResult,
    CourseUnit,
    CurriculumEntry,
    DepartmentHead,
    Enrolment,
    FeePayment,
    OrganizationalUnit,
    Programme,
    ProgrammeYear,
    TuitionFee,
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

    permission_classes = [IsHigherMember]
    serializer_class = EnrolmentSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def check_permissions(self, request):
        super().check_permissions(request)
        # Admitting and changing students is for the administration (administrator and sub-administrator).
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and request.user.role not in ADMIN_ROLES:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the administration can admit or change students.')

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
            counts = {s: CourseResult.objects.filter(offering=offering, status=s).count() for s in ('submitted', 'published')}
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
        student = api.viewed_student(request)
        if student is None:
            return Response({'detail': 'Only students and their parents have personal results.'}, status=status.HTTP_403_FORBIDDEN)
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


FINANCE_ROLES = {'SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR'}


def _finance_staff(request):
    from rest_framework.exceptions import PermissionDenied
    if request.user.role not in FINANCE_ROLES:
        raise PermissionDenied('Only the administration and the bursar can do this.')


def _year_of(request):
    from rest_framework.exceptions import NotFound
    year_id = request.query_params.get('academic_year')
    year = (AcademicYear.objects.filter(school=request.user.school, pk=year_id).first() if year_id
            else api.current_academic_year(request.user.school))
    if year is None:
        raise NotFound('No academic year is set up yet.')
    return year


def _fee_data(fee):
    return {'id': str(fee.pk), 'programme_year': str(fee.programme_year_id),
            'programme': fee.programme_year.programme.name, 'level': fee.programme_year.number,
            'academic_year': str(fee.academic_year_id), 'name': fee.name, 'amount': fee.amount}


class FeesViewSet(viewsets.ViewSet):
    """Fee lines per programme level and academic year. Read by finance staff; written by them too."""

    permission_classes = [IsHigherMember]

    def _fees(self, request):
        return TuitionFee.objects.filter(school=request.user.school).select_related(
            'programme_year', 'programme_year__programme')

    def list(self, request):
        _finance_staff(request)
        year = _year_of(request)
        return Response([_fee_data(f) for f in self._fees(request).filter(academic_year=year)])

    def create(self, request):
        _finance_staff(request)
        from rest_framework.exceptions import NotFound
        school = request.user.school
        level = ProgrammeYear.objects.filter(
            programme__school=school, pk=request.data.get('programme_year')).select_related('programme').first()
        year = AcademicYear.objects.filter(school=school, pk=request.data.get('academic_year')).first()
        if level is None or year is None:
            raise NotFound('Programme level or academic year not found.')
        try:
            amount = int(request.data.get('amount'))
        except (TypeError, ValueError):
            raise serializers.ValidationError({'amount': 'Enter the amount in CFA francs.'})
        if amount <= 0:
            raise serializers.ValidationError({'amount': 'The amount must be above zero.'})
        name = (request.data.get('name') or 'Tuition').strip()[:80] or 'Tuition'
        fee, created = TuitionFee.objects.get_or_create(
            school=school, programme_year=level, academic_year=year, name=name, defaults={'amount': amount})
        if not created:
            fee.amount = amount
            fee.save()
        return Response(_fee_data(fee), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        _finance_staff(request)
        fee = self._fees(request).filter(pk=pk).first()
        if fee is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        fee.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FinanceViewSet(viewsets.ViewSet):
    """Balances, payments and receipts. A student sees only their own statement."""

    permission_classes = [IsHigherMember]

    @action(detail=False, methods=['get'])
    def balances(self, request):
        _finance_staff(request)
        year = _year_of(request)
        rows = finance.balances(request.user.school, year, **{k: request.query_params.get(k) for k in (
            'programme', 'programme_year', 'q', 'status')})
        return Response({'academic_year': {'id': str(year.pk), 'name': year.label},
                         'summary': finance.summary(rows), 'rows': rows})

    @action(detail=False, methods=['get', 'post'])
    def payments(self, request):
        _finance_staff(request)
        school = request.user.school
        if request.method == 'POST':
            enrolment = Enrolment.objects.filter(school=school, pk=request.data.get('enrolment')).select_related(
                'student', 'student__user', 'programme', 'programme_year', 'academic_year').first()
            if enrolment is None:
                return Response({'enrolment': ['Student not found.']}, status=status.HTTP_400_BAD_REQUEST)
            from django.utils.dateparse import parse_date
            from django.utils import timezone
            paid_on = parse_date(str(request.data.get('paid_on') or '')) or timezone.localdate()
            try:
                amount = int(request.data.get('amount'))
            except (TypeError, ValueError):
                raise serializers.ValidationError({'amount': 'Enter the amount in CFA francs.'})
            payment = finance.record_payment(
                request.user, enrolment, amount=amount, method=request.data.get('method') or 'cash',
                paid_on=paid_on, reference=request.data.get('reference') or '', note=request.data.get('note') or '')
            return Response(finance.payment_data(payment), status=status.HTTP_201_CREATED)
        queryset = FeePayment.objects.filter(school=school).select_related(
            'enrolment', 'enrolment__student', 'enrolment__student__user', 'enrolment__programme',
            'enrolment__programme_year', 'enrolment__academic_year', 'received_by')
        if request.query_params.get('enrolment'):
            queryset = queryset.filter(enrolment=request.query_params['enrolment'])
        else:
            queryset = queryset.filter(enrolment__academic_year=_year_of(request))
        return Response([finance.payment_data(p) for p in queryset[:500]])

    @action(detail=False, methods=['post'], url_path=r'payments/(?P<payment_id>[^/.]+)/void')
    def void(self, request, payment_id=None):
        _finance_staff(request)
        payment = FeePayment.objects.filter(school=request.user.school, pk=payment_id).select_related(
            'enrolment', 'enrolment__student', 'enrolment__student__user', 'enrolment__programme',
            'enrolment__programme_year', 'enrolment__academic_year', 'received_by').first()
        if payment is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        finance.void_payment(payment, request.data.get('reason'))
        return Response(finance.payment_data(payment))

    @action(detail=False, methods=['get'])
    def mine(self, request):
        """The signed-in student's statement for every academic year they were enrolled."""
        from rest_framework.exceptions import PermissionDenied
        student = api.viewed_student(request)
        if student is None:
            raise PermissionDenied('This is the student statement.')
        out = []
        enrolments = Enrolment.objects.filter(school=request.user.school, student=student).select_related(
            'student', 'student__user', 'programme', 'programme_year', 'academic_year').order_by('-academic_year__start_date')
        for enrolment in enrolments:
            row = finance.balance_row(enrolment)
            row['fees'] = [{'name': f.name, 'amount': f.amount} for f in finance.fees_for(enrolment)]
            row['payments'] = [finance.payment_data(p) for p in FeePayment.objects.filter(
                enrolment=enrolment, is_void=False).select_related(
                'enrolment', 'enrolment__student', 'enrolment__student__user', 'enrolment__programme',
                'enrolment__programme_year', 'enrolment__academic_year', 'received_by')]
            out.append(row)
        return Response(out)


class OverviewView(APIView):
    """Numbers for the administration dashboard: people, programmes, results progress and fees."""

    permission_classes = [IsHigherMember]

    def get(self, request):
        from rest_framework.exceptions import PermissionDenied
        if request.user.role not in FINANCE_ROLES:
            raise PermissionDenied('Only the administration and the bursar can see this.')
        school = request.user.school
        year = api.current_academic_year(school)
        active = Enrolment.objects.filter(school=school).exclude(status__in=[Enrolment.WITHDRAWN, Enrolment.GRADUATED])
        if year is not None:
            active = active.filter(academic_year=year)
        by_programme = [
            {'name': row['programme__name'], 'count': row['n']}
            for row in active.values('programme__name').annotate(n=models.Count('id')).order_by('-n')[:8]]
        results = {key: CourseResult.objects.filter(school=school, status=key).count()
                   for key in ('submitted', 'published')}
        finance = None
        if year is not None:
            finance = finance_module_summary(school, year)
        return Response({
            'academic_year': year.label if year else None,
            'students': active.count(),
            'programmes': Programme.objects.filter(school=school, is_active=True).count(),
            'departments': OrganizationalUnit.objects.filter(school=school).count(),
            'lecturers': api.lecturers_of(school).count(),
            'course_units': CourseUnit.objects.filter(school=school).count(),
            'students_by_programme': by_programme,
            'results': results,
            'finance': finance,
        })


def finance_module_summary(school, year):
    return finance.summary(finance.balances(school, year))


class MyCoursesView(APIView):
    """The course units of a student's programme level for their academic year, with lecturers and published grades."""

    permission_classes = [IsHigherMember]

    def get(self, request):
        from rest_framework.exceptions import PermissionDenied
        student = api.viewed_student(request)
        if student is None:
            raise PermissionDenied('This is the student course list.')
        enrolment = (Enrolment.objects.filter(school=request.user.school, student=student)
                     .select_related('programme', 'programme_year', 'academic_year')
                     .order_by('-academic_year__start_date').first())
        if enrolment is None:
            return Response({'enrolment': None, 'courses': []})
        entries = CurriculumEntry.objects.filter(
            school=request.user.school, programme=enrolment.programme, programme_year=enrolment.programme_year,
        ).select_related('course_unit').order_by('period_number', 'course_unit__code')
        offerings = {}
        for offering in CourseOffering.objects.filter(
                school=request.user.school, academic_period__academic_year=enrolment.academic_year,
        ).select_related('academic_period').prefetch_related('lecturers'):
            offerings[(offering.course_unit_id, offering.academic_period.order)] = offering
        published = {r.offering_id: r for r in CourseResult.objects.filter(
            student=enrolment.student, status=CourseResult.PUBLISHED)}
        courses = []
        for entry in entries:
            offering = offerings.get((entry.course_unit_id, entry.period_number))
            result = published.get(offering.pk) if offering else None
            courses.append({
                'code': entry.course_unit.code, 'title': entry.course_unit.title,
                'credits': entry.credits_override or entry.course_unit.credits,
                'category': entry.category, 'semester': entry.period_number,
                'period_name': offering.academic_period.name if offering else '',
                'lecturers': [u.name for u in offering.lecturers.all()] if offering else [],
                'grade': result.grade if result else '', 'total_score': result.total_score if result else None,
                'passed': result.passed if result else None,
            })
        return Response({
            'enrolment': {'programme': enrolment.programme.name, 'level': enrolment.programme_year.label,
                          'academic_year': enrolment.academic_year.label},
            'courses': courses,
        })


class ChildrenView(APIView):
    """The signed-in parent's children enrolled at this institution."""

    permission_classes = [IsHigherMember]

    def get(self, request):
        out = []
        for student in api.children_of(request.user):
            enrolment = (Enrolment.objects.filter(student=student).select_related('programme', 'programme_year', 'academic_year')
                         .order_by('-academic_year__start_date').first())
            out.append({
                'student': str(student.pk), 'name': getattr(student.user, 'name', '') or student.name,
                'matricule': getattr(student.user, 'matricule', '') if student.user_id else '',
                'programme': enrolment.programme.name if enrolment else '',
                'level': enrolment.programme_year.label if enrolment else '',
            })
        return Response(out)


class ProgressionViewSet(viewsets.ViewSet):
    """End-of-year progression: promote to the next level, repeat a level, or graduate the final level. Administration only."""

    permission_classes = [IsHigherMember]

    def _check(self, request):
        from rest_framework.exceptions import PermissionDenied
        if request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only the administration can move students up.')

    def _year(self, request, value):
        year = AcademicYear.objects.filter(school=request.user.school, pk=value).first() if value else None
        if year is None:
            raise serializers.ValidationError({'academic_year': 'Choose an academic year of your institution.'})
        return year

    def list(self, request):
        from . import progression

        self._check(request)
        year = self._year(request, request.query_params.get('academic_year'))
        rows = progression.list_rows(request.user.school, year, programme=request.query_params.get('programme') or None,
                                     programme_year=request.query_params.get('level') or None, q=request.query_params.get('q', ''))
        return Response({'academic_year': str(year.pk), 'rows': rows})

    def _ids(self, request, state=None):
        """Chosen students, or (``all: true``) everyone in the filtered list who is in ``state``."""
        if request.data.get('all') is True and state:
            from . import progression
            year = self._year(request, request.data.get('academic_year'))
            rows = progression.list_rows(request.user.school, year, programme=request.data.get('programme') or None,
                                         programme_year=request.data.get('level') or None)
            ids = [r['enrolment'] for r in rows if r['state'] == state]
            if not ids:
                raise serializers.ValidationError({'enrolment_ids': 'Nobody in this list is ready.'})
            return ids
        ids = request.data.get('enrolment_ids')
        if not isinstance(ids, list) or not ids:
            raise serializers.ValidationError({'enrolment_ids': 'Select at least one student.'})
        return ids

    def _move(self, request, repeat, state='to_decide'):
        from . import progression

        self._check(request)
        ids = self._ids(request, state if not repeat else None)
        frm = self._year(request, request.data.get('academic_year'))
        to = self._year(request, request.data.get('target_academic_year'))
        try:
            result = progression.move(request.user.school, frm, to, ids, repeat=repeat)
        except ValueError as exc:
            raise serializers.ValidationError({'target_academic_year': str(exc)})
        return Response(result)

    @action(detail=False, methods=['post'])
    def promote(self, request):
        return self._move(request, repeat=False)

    @action(detail=False, methods=['post'])
    def repeat(self, request):
        return self._move(request, repeat=True)

    @action(detail=False, methods=['post'])
    def graduate(self, request):
        from . import progression

        self._check(request)
        return Response(progression.graduate(request.user.school, self._year(request, request.data.get('academic_year')), self._ids(request, 'ready_to_graduate')))

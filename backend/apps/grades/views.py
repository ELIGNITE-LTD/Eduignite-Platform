import base64
import binascii
import logging

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from core import verification
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Avg, Count, Q
from decimal import Decimal, ROUND_HALF_UP
from django_filters.rest_framework import DjangoFilterBackend

from .models import Subject, Sequence, Grade, TermResult, AnnualResult, SubjectMaterial, StudentSubjectEnrollment, ClassSubject, ReportCardPublication
from .serializers import (
    SubjectSerializer, SubjectMaterialSerializer, SequenceSerializer, GradeSerializer, GradeBulkCreateSerializer,
    TermResultSerializer, AnnualResultSerializer, ReportCardSerializer, StudentSubjectEnrollmentSerializer,
    ReportCardPublicationSerializer
)
from . import card_verification
from .utils import (
    calculate_sequence_average, calculate_term_average, calculate_annual_average,
    calculate_period_average, compute_rank, compute_period_rank, generate_report_card_data, generate_term_report_card_data,
    build_report_card_verification
)
from .relationships import sync_student_subject_enrollments
from .assessment_config import get_assessment_config
from .sequence_defaults import (
    configure_cameroon_calendar_for_school,
    ensure_cameroon_sequences_for_school,
)
from apps.students import api as students_api
from apps.platform.access import (
    filter_student_related_by_platform_access,
    filter_students_by_platform_access,
    student_platform_charge_is_paid,
)
from apps.students import api as students_api
from apps.registry.permissions import RequiresApp

SCHOOL_ADMIN_ROLES = ['SCHOOL_ADMIN', 'SUB_ADMIN']
SCHOOL_STAFF_ROLES = ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN']
logger = logging.getLogger(__name__)
User = get_user_model()


def _truthy_query_param(request, name):
    return str(request.query_params.get(name, '')).lower() in {'1', 'true', 'yes', 'on'}


def _current_academic_year_for_school(school):
    try:
        return school.settings.academic_year or ''
    except Exception:
        return ''


def _student_current_academic_year_q(students):
    query = Q()
    for student in students:
        academic_year = _current_academic_year_for_school(student.school)
        if academic_year:
            query |= Q(student_id=student.id, sequence__academic_year=academic_year)
        else:
            query |= Q(student_id=student.id)
    return query


def _related_school_ids_for_parent(user):
    return students_api.list_school_ids_for_guardian(user)


def _student_subject_ids(student):
    sync_student_subject_enrollments(student)
    enrollment_subjects = StudentSubjectEnrollment.objects.filter(
        student=student,
        is_active=True,
    ).values_list('class_subject__subject_id', flat=True)
    class_subjects = Subject.objects.filter(
        class_links__school_class=student.school_class,
        is_active=True,
    ).values_list('id', flat=True)
    legacy_subjects = Subject.objects.none()
    if not student.school_class_id and student.student_class:
        legacy_subjects = Subject.objects.filter(
            school=student.school,
            is_active=True,
        ).filter(
            Q(level__icontains=student.student_class)
            | Q(level__icontains=student.class_level)
            | Q(level__icontains='All')
        ).values_list('id', flat=True)
    return set(enrollment_subjects).union(set(class_subjects)).union(set(legacy_subjects))


def _student_current_class_grade_q(student):
    class_filter = Q()
    if getattr(student, 'school_class_id', None):
        class_filter |= Q(school_class_id=student.school_class_id)
    class_name = (
        student.school_class.name
        if getattr(student, 'school_class_id', None) and getattr(student, 'school_class', None)
        else getattr(student, 'student_class', '') or ''
    )
    if class_name:
        class_filter |= Q(class_name_snapshot=class_name)
    if not class_filter:
        subject_ids = _student_subject_ids(student)
        if subject_ids:
            class_filter |= Q(subject_id__in=subject_ids)
    return class_filter


def _grade_matches_student_current_class(grade, student):
    if getattr(student, 'school_class_id', None) and grade.school_class_id == student.school_class_id:
        return True
    class_name = (
        student.school_class.name
        if getattr(student, 'school_class_id', None) and getattr(student, 'school_class', None)
        else getattr(student, 'student_class', '') or ''
    )
    return bool(class_name and grade.class_name_snapshot == class_name)


def _student_platform_charge_is_paid(student):
    return student_platform_charge_is_paid(student)


def _ensure_student_platform_charge_paid(student):
    if not _student_platform_charge_is_paid(student):
        raise PermissionDenied(
            'This student has not paid the platform charges. Student data, marks, and report cards remain locked until the charge is cleared.'
        )


def _teacher_taught_class_ids(user):
    if not getattr(user, 'school_id', None):
        return set()
    from apps.schools.models import SchoolClass
    from apps.schools.class_teaching import basic_class_ids_for_teacher

    ids = set(
        SchoolClass.objects.filter(
            Q(class_subjects__teacher=user) | Q(class_master=user),
            school_id=user.school_id,
        ).values_list('id', flat=True)
    )
    return ids | basic_class_ids_for_teacher(user)


def _teacher_taught_class_names(user):
    if not getattr(user, 'school_id', None):
        return set()
    from apps.schools.models import SchoolClass
    from apps.schools.class_teaching import basic_class_ids_for_teacher

    names = set(
        SchoolClass.objects.filter(
            Q(class_subjects__teacher=user) | Q(class_master=user),
            school_id=user.school_id,
        ).values_list('name', flat=True)
    )
    basic_ids = basic_class_ids_for_teacher(user)
    if basic_ids:
        names |= set(SchoolClass.objects.filter(id__in=basic_ids).values_list('name', flat=True))
    return names


def _teacher_subject_ids_for_class(user, class_name=None):
    links = user.class_subject_links.filter(school_class__school_id=user.school_id).select_related('school_class')
    if class_name:
        links = links.filter(school_class__name=class_name)
    subject_ids = set(links.values_list('subject_id', flat=True))
    # Basic Education: a class teacher covers every configured subject of the class.
    from apps.schools.class_teaching import basic_class_ids_for_teacher

    basic_ids = basic_class_ids_for_teacher(user)
    if basic_ids:
        extra = ClassSubject.objects.filter(school_class_id__in=basic_ids)
        if class_name:
            extra = extra.filter(school_class__name=class_name)
        subject_ids |= set(extra.values_list('subject_id', flat=True))
    return subject_ids


def _teacher_class_subject_links(user):
    if not getattr(user, 'school_id', None):
        return ClassSubject.objects.none()
    from apps.schools.class_teaching import basic_class_ids_for_teacher

    # Basic Education: every configured subject of an assigned class is the
    # teacher's, with no per-subject ClassSubject.teacher needed. The set is
    # empty for non-basic schools, leaving the original subject-specific rule.
    link_scope = Q(teacher=user) | Q(subject__teacher=user)
    basic_class_ids = basic_class_ids_for_teacher(user)
    if basic_class_ids:
        link_scope |= Q(school_class_id__in=basic_class_ids)
    return ClassSubject.objects.select_related(
        'school_class',
        'school_class__sub_school',
        'subject',
        'teacher',
    ).filter(
        school_class__school_id=user.school_id,
    ).filter(
        link_scope,
    ).order_by(
        'school_class__sub_school__name',
        'school_class__name',
        'subject__name',
    ).distinct()


def _teacher_grade_queryset(user):
    links = list(_teacher_class_subject_links(user))
    if not links:
        return Grade.objects.none()
    exact_scope = Q()
    for link in links:
        exact_scope |= Q(subject_id=link.subject_id) & (
            Q(student__school_class_id=link.school_class_id)
            | Q(student__student_class=link.school_class.name)
        ) & (
            Q(school_class_id=link.school_class_id)
            | Q(class_name_snapshot=link.school_class.name)
        )
    return Grade.objects.select_related(
        'student',
        'student__user',
        'student__school_class',
        'student__school_class__sub_school',
        'subject',
        'sequence',
        'school_class',
        'teacher',
    ).filter(
        school_id=user.school_id,
    ).filter(exact_scope)


def _scale_label_number(school):
    value = get_assessment_config(school).max_score
    return int(value) if value == int(value) else float(value)


def _pass_mark_number(school):
    value = get_assessment_config(school).pass_mark
    return int(value) if value == int(value) else float(value)


def _scale_label(value, default=20):
    """'20' for 20.0 / 20, '100' for 100, '10.5' for 10.5 (no trailing .0)."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = float(default)
    return str(int(number)) if number == int(number) else str(number)


def _filter_report_card_for_teacher(data, user, student):
    # Basic Education: the class teacher owns the whole class, so the full card
    # (every subject, average and rank per show_rank) is shown, not just the
    # subjects a ClassSubject.teacher row names. Secondary schools, and teachers
    # not assigned to the pupil's class, keep the subject-limited view.
    from apps.schools.class_teaching import basic_class_ids_for_teacher

    if getattr(student, 'school_class_id', None) and student.school_class_id in basic_class_ids_for_teacher(user):
        return data
    class_name = student.school_class.name if getattr(student, 'school_class_id', None) and getattr(student, 'school_class', None) else student.student_class
    allowed_subject_ids = {str(subject_id) for subject_id in _teacher_subject_ids_for_class(user, class_name)}
    filtered_grades = [
        grade for grade in data.get('grades', [])
        if str(grade.get('subject_id') or grade.get('subject') or '') in allowed_subject_ids
    ]

    weighted_total = Decimal('0.00')
    coefficient_total = Decimal('0.00')
    for grade in filtered_grades:
        score = Decimal(str(grade.get('score') or 0))
        coefficient = Decimal(str(grade.get('coefficient') or 1))
        weighted_total += score * coefficient
        coefficient_total += coefficient

    average = Decimal('0.00')
    if coefficient_total > 0:
        average = (weighted_total / coefficient_total).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    data = dict(data)
    data['grades'] = filtered_grades
    data['average'] = float(average)
    data['rank'] = None
    data['promotion_status'] = 'Subject marks view'
    data['teacher_limited'] = True
    return data


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.select_related('teacher')
    serializer_class = SubjectSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]

    def get_queryset(self):
        user = self.request.user
        queryset = Subject.objects.select_related('teacher')

        if user.role in SCHOOL_ADMIN_ROLES:
            queryset = queryset.filter(school=user.school)
        elif user.role == 'TEACHER':
            queryset = queryset.filter(school=user.school)
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can create subjects.")
        if not request.user.school_id:
            raise ValidationError({"school": "No school context available for this account."})

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(school=request.user.school)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can update subjects.")
        return super().update(request, *args, **kwargs)


class StudentSubjectEnrollmentViewSet(viewsets.ModelViewSet):
    queryset = StudentSubjectEnrollment.objects.select_related(
        'student__user',
        'student__school_class',
        'class_subject__subject',
        'class_subject__teacher',
        'class_subject__school_class',
    )
    serializer_class = StudentSubjectEnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]
    http_method_names = ['get', 'patch', 'head', 'options']
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['is_active', 'class_subject__type', 'class_subject__school_class']
    ordering_fields = ['class_subject__subject__name', 'class_subject__type', 'created']
    ordering = ['class_subject__type', 'class_subject__subject__name']

    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset

        if user.role == 'STUDENT':
            student = students_api.get_student_for_user(user)
            if not student:
                return queryset.none()
            sync_student_subject_enrollments(student)
            return queryset.filter(student=student)

        if user.role == 'PARENT':
            linked_students = students_api.list_student_ids_for_guardian(user)
            return queryset.filter(student_id__in=linked_students)

        if user.role == 'TEACHER':
            from apps.schools.class_teaching import basic_class_ids_for_teacher

            teacher_scope = Q(class_subject__teacher=user)
            basic_class_ids = basic_class_ids_for_teacher(user)
            if basic_class_ids:
                teacher_scope |= Q(class_subject__school_class_id__in=basic_class_ids)
            return queryset.filter(
                teacher_scope,
                student__school_id=user.school_id,
            )

        if user.role in SCHOOL_ADMIN_ROLES:
            return queryset.filter(student__school=user.school)

        return queryset.none()

    def partial_update(self, request, *args, **kwargs):
        enrollment = self.get_object()
        if request.user.role == 'STUDENT' and enrollment.student.user_id != request.user.id:
            raise PermissionDenied("You can only update your own subject selections.")
        if request.user.role == 'STUDENT' and enrollment.class_subject.type == enrollment.class_subject.SubjectType.MANDATORY:
            raise PermissionDenied("Mandatory subjects cannot be removed.")
        if request.user.role not in ['STUDENT', *SCHOOL_ADMIN_ROLES]:
            raise PermissionDenied("You do not have permission to update this subject enrollment.")
        return super().partial_update(request, *args, **kwargs)


class SubjectMaterialViewSet(viewsets.ModelViewSet):
    queryset = SubjectMaterial.objects.select_related('subject', 'uploaded_by', 'school')
    serializer_class = SubjectMaterialSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['subject', 'material_type']
    search_fields = ['title', 'description', 'subject__name']
    ordering_fields = ['created', 'title', 'material_type']
    ordering = ['-created']

    def get_queryset(self):
        user = self.request.user
        queryset = SubjectMaterial.objects.select_related('subject', 'uploaded_by', 'school')

        if user.role in SCHOOL_STAFF_ROLES and user.school_id:
            return queryset.filter(school=user.school)
        if user.role == 'STUDENT' and user.school_id:
            student = students_api.get_student_for_user(user)
            if not student:
                return queryset.none()
            subject_ids = _student_subject_ids(student)
            if not subject_ids:
                return queryset.none()
            return queryset.filter(school=student.school, subject_id__in=subject_ids)
        if user.role == 'PARENT':
            students = students_api.list_students().filter(
                id__in=students_api.list_student_ids_for_guardian(user)
            )
            subject_ids = set()
            for student in students:
                subject_ids.update(_student_subject_ids(student))
            if not subject_ids:
                return queryset.none()
            return queryset.filter(school_id__in=_related_school_ids_for_parent(user), subject_id__in=subject_ids)
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied("Only school staff can publish subject materials.")

        subject = serializer.validated_data['subject']
        if subject.school_id != user.school_id:
            raise PermissionDenied("You can only publish materials inside your own school.")

        if user.role == 'TEACHER':
            teaches_subject = (
                subject.teacher_id == user.id
                or subject.class_links.filter(teacher=user).exists()
            )
            if not teaches_subject:
                raise PermissionDenied("Teachers can only publish materials for subjects they teach.")

        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        material = self.get_object()
        if material.school_id != user.school_id:
            raise PermissionDenied("You can only manage materials inside your own school.")
        if user.role == 'TEACHER':
            teaches_subject = (
                material.subject.teacher_id == user.id
                or material.subject.class_links.filter(teacher=user).exists()
            )
            if not teaches_subject:
                raise PermissionDenied("Teachers can only edit materials for subjects they teach.")
        elif user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Only school staff can edit subject materials.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        material = self.get_object()
        user = request.user
        if material.school_id != user.school_id:
            raise PermissionDenied("You can only delete materials inside your own school.")
        if user.role == 'TEACHER':
            teaches_subject = (
                material.subject.teacher_id == user.id
                or material.subject.class_links.filter(teacher=user).exists()
            )
            if not teaches_subject:
                raise PermissionDenied("Teachers can only delete materials for subjects they teach.")
        elif user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Only school staff can delete subject materials.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download a stored material through authenticated API permissions."""
        material = self.get_object()
        if material.external_url:
            return redirect(material.external_url)
        if not material.file_data:
            raise ValidationError({'detail': 'This material does not have a downloadable file.'})

        try:
            _header, encoded = material.file_data.split(',', 1)
            content = base64.b64decode(encoded)
        except (ValueError, TypeError, binascii.Error):
            raise ValidationError({'detail': 'This material file is corrupted and cannot be downloaded.'})

        response = HttpResponse(content, content_type=material.mime_type or 'application/octet-stream')
        filename = material.file_name or f'{material.title}.{material.material_type}'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class SequenceViewSet(viewsets.ModelViewSet):
    queryset = Sequence.objects.all()
    serializer_class = SequenceSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]

    def get_queryset(self):
        user = self.request.user
        queryset = Sequence.objects.all()

        if user.role in SCHOOL_STAFF_ROLES and user.school_id:
            ensure_cameroon_sequences_for_school(user.school)
            queryset = queryset.filter(school=user.school)
        elif user.role == 'STUDENT' and user.school_id:
            ensure_cameroon_sequences_for_school(user.school)
            queryset = queryset.filter(school=user.school)
            if not _truthy_query_param(self.request, 'include_history'):
                academic_year = _current_academic_year_for_school(user.school)
                if academic_year:
                    queryset = queryset.filter(academic_year=academic_year)
        elif user.role == 'PARENT':
            school_ids = students_api.list_school_ids_for_guardian(user)
            queryset = queryset.filter(school_id__in=school_ids)
            if not _truthy_query_param(self.request, 'include_history'):
                school_year_filter = Q()
                for school_id in school_ids:
                    school = getattr(user, 'school', None)
                    if school and str(school.id) == str(school_id):
                        academic_year = _current_academic_year_for_school(school)
                    else:
                        from apps.schools.models import School

                        academic_year = _current_academic_year_for_school(School.objects.filter(id=school_id).first())
                    if academic_year:
                        school_year_filter |= Q(school_id=school_id, academic_year=academic_year)
                queryset = queryset.filter(school_year_filter) if school_year_filter else queryset.none()
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can create sequences.")

        data = request.data.copy()
        data['school'] = request.user.school.id
        request._full_data = data
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can update sequences.")
        return super().update(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='configure-cameroon-calendar')
    def configure_cameroon_calendar(self, request):
        """Create or update the six-sequence Cameroon secondary school calendar."""
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can configure the academic calendar.")
        if not request.user.school_id:
            raise PermissionDenied("Your account is not linked to a school.")

        result = configure_cameroon_calendar_for_school(request.user.school, request.data)
        serialized = self.get_serializer(result['sequences'], many=True)
        return Response({
            'academic_year': result['academic_year'],
            'current_term': result['current_term'],
            'sequences': serialized.data,
        })


class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.select_related('student', 'subject', 'sequence', 'teacher', 'school_class')
    serializer_class = GradeSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]

    def get_queryset(self):
        user = self.request.user
        queryset = Grade.objects.select_related('student', 'student__school_class', 'subject', 'sequence', 'teacher', 'school_class')

        if user.role == 'TEACHER':
            queryset = _teacher_grade_queryset(user)
        elif user.role in SCHOOL_ADMIN_ROLES:
            queryset = queryset.filter(school=user.school)
        elif user.role == 'STUDENT':
            queryset = queryset.filter(student__user=user)
            if not _truthy_query_param(self.request, 'include_history'):
                academic_year = _current_academic_year_for_school(user.school)
                if academic_year:
                    queryset = queryset.filter(sequence__academic_year=academic_year)
                student = students_api.get_student_for_user(user)
                if student:
                    class_filter = _student_current_class_grade_q(student)
                    queryset = queryset.filter(class_filter) if class_filter else queryset.none()
        elif user.role == 'PARENT':
            linked_students = students_api.list_student_ids_for_guardian(user)
            paid_linked_students = filter_students_by_platform_access(
                students_api.list_students().filter(id__in=linked_students)
            ).values_list('id', flat=True)
            queryset = queryset.filter(student_id__in=paid_linked_students)
            if not _truthy_query_param(self.request, 'include_history'):
                students = students_api.list_students().select_related('school__settings').filter(id__in=paid_linked_students)
                current_year_query = _student_current_academic_year_q(students)
                queryset = queryset.filter(current_year_query) if current_year_query else queryset.none()
                class_query = Q()
                for student in students:
                    current_class_filter = _student_current_class_grade_q(student)
                    if current_class_filter:
                        class_query |= Q(student_id=student.id) & current_class_filter
                queryset = queryset.filter(class_query) if class_query else queryset.none()
        else:
            queryset = queryset.none()

        student_param = self.request.query_params.get('student') or self.request.query_params.get('student_id')
        if student_param:
            queryset = queryset.filter(student_id=student_param)
        sequence_param = self.request.query_params.get('sequence') or self.request.query_params.get('sequence_id')
        if sequence_param:
            queryset = queryset.filter(sequence_id=sequence_param)
        subject_param = self.request.query_params.get('subject') or self.request.query_params.get('subject_id')
        if subject_param:
            queryset = queryset.filter(subject_id=subject_param)

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role != 'TEACHER':
            raise PermissionDenied("Only teachers can create grades.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _ensure_student_platform_charge_paid(serializer.validated_data['student'])
        existing_grade = Grade.objects.filter(
            student=serializer.validated_data['student'],
            subject=serializer.validated_data['subject'],
            sequence=serializer.validated_data['sequence'],
        ).first()
        if existing_grade:
            if not _teacher_grade_queryset(request.user).filter(id=existing_grade.id).exists():
                raise PermissionDenied("You can only update marks for subjects and classes assigned to you.")
            update_serializer = self.get_serializer(existing_grade, data=request.data, partial=True)
            update_serializer.is_valid(raise_exception=True)
            update_serializer.save(teacher=request.user, school=request.user.school)
            return Response(update_serializer.data, status=status.HTTP_200_OK)

        serializer.save(teacher=request.user, school=request.user.school)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        student = serializer.validated_data.get('student')
        if not self.request.user.school_id:
            raise PermissionDenied("Your teacher account is not linked to a school.")
        if student and student.school_id != self.request.user.school_id:
            raise PermissionDenied("You can only record grades for students in your school.")
        if student:
            _ensure_student_platform_charge_paid(student)
        serializer.save(teacher=self.request.user, school=self.request.user.school)

    def perform_update(self, serializer):
        if self.request.user.role == 'TEACHER':
            serializer.save(teacher=self.request.user, school=self.request.user.school)
            return
        serializer.save()

    def update(self, request, *args, **kwargs):
        if request.user.role not in ['TEACHER', *SCHOOL_ADMIN_ROLES]:
            raise PermissionDenied("Only teachers and administrators can update grades.")
        return super().update(request, *args, **kwargs)

    def _active_or_latest_sequence(self, school, sequence_id=None):
        queryset = Sequence.objects.filter(school=school)
        if sequence_id:
            sequence = queryset.filter(id=sequence_id).first()
            if not sequence:
                raise ValidationError({'sequence_id': 'Selected sequence was not found in your school.'})
            return sequence

        active_sequence = queryset.filter(is_active=True).order_by('-academic_year', 'term', 'name').first()
        if active_sequence and Grade.objects.filter(school=school, sequence=active_sequence).exists():
            return active_sequence
        latest_with_grades = queryset.filter(grades__isnull=False).distinct().order_by('-academic_year', '-term', '-name').first()
        if latest_with_grades:
            return latest_with_grades
        if active_sequence:
            return active_sequence
        return queryset.order_by('-academic_year', '-term', '-name').first()

    def _class_student_average(self, grades):
        weighted_total = Decimal('0.00')
        coefficient_total = Decimal('0.00')
        config = get_assessment_config(grades[0].school_id) if grades else None
        for grade in grades:
            coefficient = (
                Decimal(str(grade.subject.coefficient or 1))
                if config is None or config.use_coefficients else Decimal('1.00')
            )
            weighted_total += Decimal(str(grade.score)) * coefficient
            coefficient_total += coefficient
        if coefficient_total <= 0:
            return None
        return (weighted_total / coefficient_total).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def _school_honour_roll_threshold(self, school=None):
        if school:
            try:
                return Decimal(str(school.settings.honour_roll_threshold))
            except Exception:
                pass
        try:
            from apps.platform.models import PlatformSettings

            return Decimal(str(PlatformSettings.load().honour_roll_threshold))
        except Exception:
            return Decimal('12.00')

    def _students_for_class(self, school, class_name, class_id=None):
        students = students_api.list_students(school=school).select_related(
            'school_class__sub_school'
        )

        filters = Q(student_class=class_name) | Q(school_class__name=class_name)
        if class_id and not str(class_id).startswith('legacy:'):
            filters |= Q(school_class_id=class_id)
        return students.filter(filters).distinct().order_by('user__name', 'admission_number')

    def _period_from_request(self, school, data):
        scope = str(data.get('scope') or data.get('report_scope') or 'sequence').upper()
        if scope not in [ReportCardPublication.Scope.SEQUENCE, ReportCardPublication.Scope.TERM]:
            raise ValidationError({'scope': 'Scope must be SEQUENCE or TERM.'})

        sequence = None
        sequences = []
        term = None
        academic_year = None

        if scope == ReportCardPublication.Scope.SEQUENCE:
            sequence_id = data.get('sequence_id') or data.get('sequence')
            if not sequence_id:
                raise ValidationError({'sequence_id': 'Select the academic sequence to publish.'})
            sequence = Sequence.objects.filter(id=sequence_id, school=school).first()
            if not sequence:
                raise ValidationError({'sequence_id': 'Selected sequence was not found in your school.'})
            sequences = [sequence]
            term = sequence.term
            academic_year = sequence.academic_year
        else:
            try:
                term = int(data.get('term'))
            except (TypeError, ValueError):
                raise ValidationError({'term': 'Select a valid Cameroon term.'})
            if term not in [1, 2, 3]:
                raise ValidationError({'term': 'Term must be 1, 2, or 3.'})
            academic_year = str(data.get('academic_year') or '').strip()
            if not academic_year:
                raise ValidationError({'academic_year': 'Academic year is required for term report cards.'})
            sequences = list(Sequence.objects.filter(
                school=school,
                academic_year=academic_year,
                term=term,
            ).order_by('name'))
            if not sequences:
                raise ValidationError({'term': 'No sequences have been configured for this term and academic year.'})

        return scope, sequence, sequences, term, academic_year

    def _report_card_is_published(self, student, scope, sequence=None, term=None, academic_year=None):
        class_name = student.school_class.name if student.school_class_id else student.student_class
        publications = ReportCardPublication.objects.filter(
            school=student.school,
            class_name=class_name,
            scope=scope,
            is_published=True,
        )
        if student.school_class_id:
            publications = publications.filter(Q(school_class_id=student.school_class_id) | Q(school_class__isnull=True))
        if scope == ReportCardPublication.Scope.SEQUENCE:
            return publications.filter(sequence=sequence).exists()
        return publications.filter(term=term, academic_year=academic_year).exists()

    def _rank_average_rows(self, rows):
        ranked = sorted(rows, key=lambda item: item['average'], reverse=True)
        last_average = None
        last_rank = 0
        for index, row in enumerate(ranked, start=1):
            if last_average is None or row['average'] != last_average:
                last_rank = index
                last_average = row['average']
            row['rank'] = last_rank
        return ranked

    def _refresh_term_and_annual_results(self, school, class_students, term, academic_year):
        sequences = list(Sequence.objects.filter(
            school=school,
            academic_year=academic_year,
            term=term,
        ).order_by('name'))
        sequence_ids = [sequence.id for sequence in sequences]
        if not sequence_ids:
            return {'term_results': 0, 'annual_results': 0}

        pass_mark = get_assessment_config(school).pass_mark
        term_rows = []
        for student in class_students:
            grade_exists = Grade.objects.filter(student=student, sequence_id__in=sequence_ids)
            grade_exists = grade_exists.filter(_student_current_class_grade_q(student))
            if not grade_exists.exists():
                continue
            average = calculate_period_average(student, sequences)
            term_rows.append({'student': student, 'average': average, 'rank': None})

        ranked_term_rows = self._rank_average_rows(term_rows)
        total_students = len(ranked_term_rows)
        for row in ranked_term_rows:
            TermResult.objects.update_or_create(
                student=row['student'],
                academic_year=academic_year,
                term=term,
                defaults={
                    'school': school,
                    'average': row['average'],
                    'rank': row['rank'],
                    'total_students': total_students,
                    'is_promoted': row['average'] >= pass_mark,
                },
            )

        threshold = self._school_honour_roll_threshold(school)
        annual_rows = []
        for student in class_students:
            annual_average = calculate_annual_average(student, academic_year)
            if annual_average <= Decimal('0.00'):
                continue
            annual_rows.append({'student': student, 'average': annual_average, 'rank': None})

        ranked_annual_rows = self._rank_average_rows(annual_rows)
        for row in ranked_annual_rows:
            is_on_honour_roll = row['average'] >= threshold
            AnnualResult.objects.update_or_create(
                student=row['student'],
                academic_year=academic_year,
                defaults={
                    'school': school,
                    'annual_average': row['average'],
                    'rank': row['rank'],
                    'is_on_honour_roll': is_on_honour_roll,
                    'is_promoted': row['average'] >= pass_mark,
                },
            )
            students_api.set_academic_standing(
                row['student'],
                annual_average=row['average'],
                is_on_honour_roll=is_on_honour_roll,
            )

        return {
            'term_results': len(ranked_term_rows),
            'annual_results': len(ranked_annual_rows),
        }

    def _award_label_for_average(self, average):
        average = Decimal(str(average))
        if average >= Decimal('18.00'):
            return 'Principal Excellence List'
        if average >= Decimal('16.00'):
            return 'High Distinction'
        if average >= Decimal('15.00'):
            return 'Honour Roll'
        if average >= Decimal('14.00'):
            return 'Merit List'
        return 'Academic Recognition'

    def _serialize_teacher_link(self, link):
        sub_school = link.school_class.sub_school
        return {
            'id': str(link.id),
            'class_id': str(link.school_class_id),
            'class_name': link.school_class.name,
            'sub_school_id': str(sub_school.id) if sub_school else None,
            'sub_school_name': sub_school.name if sub_school else 'Main School',
            'subject_id': str(link.subject_id),
            'subject_name': link.subject.name,
            'subject_code': link.subject.code,
            'coefficient': float(link.subject.coefficient),
            'type': link.type,
        }

    def _term_label(self, term):
        return {
            1: 'First Term',
            2: 'Second Term',
            3: 'Third Term',
        }.get(term, f'Term {term}')

    def _serialize_teacher_sequences(self, school):
        return [
            {
                'id': str(sequence.id),
                'name': sequence.name,
                'academic_year': sequence.academic_year,
                'term': sequence.term,
                'term_label': self._term_label(sequence.term),
                'start_date': sequence.start_date,
                'end_date': sequence.end_date,
                'is_active': sequence.is_active,
                'marks_deadline': sequence.marks_deadline,
            }
            for sequence in Sequence.objects.filter(school=school).order_by('-academic_year', 'term', 'name')
        ]

    def _serialize_teacher_terms(self, sequences):
        terms = {}
        for sequence in sequences:
            term_number = sequence['term']
            term_data = terms.setdefault(term_number, {
                'term': term_number,
                'label': sequence['term_label'],
                'sequence_count': 0,
                'academic_years': set(),
                'is_active': False,
            })
            term_data['sequence_count'] += 1
            term_data['academic_years'].add(sequence['academic_year'])
            term_data['is_active'] = term_data['is_active'] or sequence['is_active']

        serialized = []
        for term_number in sorted(terms):
            term_data = terms[term_number]
            serialized.append({
                'term': term_data['term'],
                'label': term_data['label'],
                'sequence_count': term_data['sequence_count'],
                'academic_years': sorted(term_data['academic_years'], reverse=True),
                'is_active': term_data['is_active'],
            })
        return serialized

    def _teacher_sheet_students(self, link, sequence=None):
        enrolled_student_ids = StudentSubjectEnrollment.objects.filter(
            class_subject=link,
            is_active=True,
        ).values_list('student_id', flat=True)
        has_enrollments = StudentSubjectEnrollment.objects.filter(class_subject=link).exists()
        students = students_api.list_students(
            school=link.school_class.school
        ).select_related('school_class__sub_school').filter(
            Q(school_class=link.school_class) | Q(student_class=link.school_class.name)
        ).distinct()
        if has_enrollments and link.type == ClassSubject.SubjectType.OPTIONAL:
            students = students.filter(id__in=enrolled_student_ids)

        grades = {}
        if sequence:
            grades = {
                grade.student_id: grade
                for grade in Grade.objects.select_related('teacher', 'school_class').filter(
                    student__in=students,
                    subject=link.subject,
                    sequence=sequence,
                    school=link.school_class.school,
                ).filter(
                    Q(school_class=link.school_class) | Q(class_name_snapshot=link.school_class.name)
                )
            }

        rows = []
        assessment = get_assessment_config(link.school_class.school)
        for index, student in enumerate(students.order_by('user__name', 'admission_number'), start=1):
            grade = grades.get(student.id)
            score = float(grade.score) if grade else None
            rows.append({
                'index': index,
                'id': str(student.id),
                'name': student.display_name,
                'matricule': student.display_matricule,
                'admission_number': student.admission_number,
                'class_name': student.school_class.name if student.school_class_id else student.student_class,
                'sub_school_name': (
                    student.school_class.sub_school.name
                    if student.school_class_id and student.school_class.sub_school_id
                    else 'Main School'
                ),
                'grade': {
                    'id': str(grade.id),
                    'score': score,
                    'comment': '',
                    'grade_letter': grade.get_grade_letter(config=assessment),
                    'modified': grade.modified,
                } if grade else None,
                'status': 'entered' if grade else 'pending',
            })
        return rows

    @action(detail=False, methods=['get'])
    def teacher_grade_sheet(self, request):
        """Teacher-scoped mark entry data for Cameroon secondary sequences."""
        if request.user.role != 'TEACHER':
            raise PermissionDenied("Only teachers can access the mark entry sheet.")
        if not request.user.school_id:
            raise PermissionDenied("Your teacher account is not linked to a school.")

        links = list(_teacher_class_subject_links(request.user))
        ensure_cameroon_sequences_for_school(request.user.school)
        sequences = self._serialize_teacher_sequences(request.user.school)
        terms = self._serialize_teacher_terms(sequences)
        grouped_classes = []
        class_map = {}
        for link in links:
            class_key = str(link.school_class_id)
            if class_key not in class_map:
                sub_school = link.school_class.sub_school
                class_map[class_key] = {
                    'id': class_key,
                    'name': link.school_class.name,
                    'sub_school_id': str(sub_school.id) if sub_school else None,
                    'sub_school_name': sub_school.name if sub_school else 'Main School',
                    'subjects': [],
                }
                grouped_classes.append(class_map[class_key])
            class_map[class_key]['subjects'].append(self._serialize_teacher_link(link))

        selected_link = None
        requested_link_id = request.query_params.get('class_subject_id')
        if requested_link_id:
            selected_link = next((link for link in links if str(link.id) == str(requested_link_id)), None)
            if not selected_link:
                raise PermissionDenied("You can only enter marks for assigned class subjects.")
        elif links:
            selected_link = links[0]

        selected_sequence = None
        selected_term = None
        requested_term = request.query_params.get('term')
        if requested_term:
            try:
                selected_term = int(requested_term)
            except (TypeError, ValueError):
                raise ValidationError({'term': 'Selected term must be 1, 2, or 3.'})
            if selected_term not in [1, 2, 3]:
                raise ValidationError({'term': 'Selected term must be 1, 2, or 3.'})

        term_sequences = [
            item for item in sequences
            if selected_term is None or item['term'] == selected_term
        ]
        requested_sequence_id = request.query_params.get('sequence_id')
        if requested_sequence_id:
            candidate_sequence = Sequence.objects.filter(id=requested_sequence_id, school=request.user.school).first()
            if not candidate_sequence:
                raise ValidationError({'sequence_id': 'Selected sequence was not found in your school.'})
            if selected_term is None or candidate_sequence.term == selected_term:
                selected_sequence = candidate_sequence

        if not selected_sequence and term_sequences:
            active_sequence_id = next((item['id'] for item in term_sequences if item['is_active']), None)
            selected_sequence = Sequence.objects.filter(
                id=active_sequence_id or term_sequences[0]['id'],
                school=request.user.school,
            ).first()

        if selected_sequence:
            selected_term = selected_sequence.term
        elif selected_term is None and terms:
            active_term = next((item['term'] for item in terms if item['is_active']), None)
            selected_term = active_term or terms[0]['term']

        students = []
        if selected_link:
            students = self._teacher_sheet_students(selected_link, selected_sequence)

        return Response({
            'classes': grouped_classes,
            'terms': terms,
            'sequences': sequences,
            'selected_class_subject_id': str(selected_link.id) if selected_link else None,
            'selected_term': selected_term,
            'selected_sequence_id': str(selected_sequence.id) if selected_sequence else None,
            'selected': self._serialize_teacher_link(selected_link) if selected_link else None,
            'students': students,
            'summary': {
                'total_students': len(students),
                'entered': sum(1 for student in students if student['status'] == 'entered'),
                'pending': sum(1 for student in students if student['status'] == 'pending'),
            },
            'scale': {
                'min': 0,
                'max': _scale_label_number(request.user.school),
                'pass_mark': _pass_mark_number(request.user.school),
                'system': 'Cameroon secondary education',
                'grading_style': get_assessment_config(request.user.school).grading_style,
            },
        })

    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """Batch entry of grades for entire class"""
        if request.user.role != 'TEACHER':
            raise PermissionDenied("Only teachers can create grades.")

        serializer = GradeBulkCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        locked_students = [
            row['student'].user.get_full_name()
            for row in serializer.validated_data.get('cleaned_grades', [])
            if not _student_platform_charge_is_paid(row['student'])
        ]
        if locked_students:
            raise PermissionDenied(
                f"Marks cannot be submitted because these students have unpaid platform charges: {', '.join(locked_students[:5])}."
            )
        grades = serializer.save()
        max_label = _scale_label(get_assessment_config(request.user.school).max_score)

        # Tell each learner — and their parents, by the child's name — that a
        # mark just landed on the record.
        try:
            from apps.notifications.utils import notify_users
            for grade in grades:
                subject_name = grade.subject.name if grade.subject_id else 'A subject'
                sequence_name = grade.sequence.name if grade.sequence_id else 'the current sequence'
                student_user = getattr(grade.student, 'user', None)
                if student_user:
                    notify_users(
                        [student_user],
                        'New mark recorded',
                        f"{subject_name}: {grade.score}/{max_label} was entered for {sequence_name}.",
                        notification_type='grade_published',
                        sender=request.user,
                    )
                # Parents receive the same news addressed by the child's name,
                # so a parent with several children always knows which one.
                student_name = student_user.name if student_user else 'Your child'
                first_name = (student_name or 'Your child').split(' ')[0]
                parent_users = students_api.get_guardian_users(grade.student)
                if parent_users:
                    notify_users(
                        parent_users,
                        f"New mark for {first_name}",
                        f"{student_name} — {subject_name}: {grade.score}/{max_label} was entered for {sequence_name}.",
                        notification_type='grade_published',
                        sender=request.user,
                    )
        except Exception:  # noqa: BLE001
            pass

        return Response(
            GradeSerializer(grades, many=True).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['get'])
    def class_statistics(self, request):
        """Live class performance statistics calculated from real grade records."""
        if request.user.role not in [*SCHOOL_ADMIN_ROLES, 'TEACHER']:
            raise PermissionDenied("Only school staff can view class statistics.")
        if not request.user.school_id:
            raise PermissionDenied("Your account is not linked to a school.")

        from apps.schools.models import SchoolClass
        school = request.user.school
        sequence = self._active_or_latest_sequence(school, request.query_params.get('sequence_id'))
        classes_queryset = SchoolClass.objects.select_related(
            'sub_school',
            'class_master',
        ).prefetch_related(
            'class_subjects',
            'class_subjects__subject',
            'class_subjects__teacher',
        ).filter(school=school)

        if request.user.role == 'TEACHER':
            classes_queryset = classes_queryset.filter(id__in=_teacher_taught_class_ids(request.user))

        registered_classes = list(classes_queryset.order_by('sub_school__name', 'name'))
        class_entries = []
        class_by_id = {}
        class_by_name = {}
        for school_class in registered_classes:
            entry = {
                'key': f'class:{school_class.id}',
                'id': str(school_class.id),
                'name': school_class.name,
                'sub_school_id': str(school_class.sub_school_id) if school_class.sub_school_id else None,
                'sub_school_name': school_class.sub_school.name if school_class.sub_school_id else 'Main School',
                'school_class': school_class,
                'class_subjects': list(school_class.class_subjects.all()),
            }
            class_entries.append(entry)
            class_by_id[school_class.id] = entry
            class_by_name[school_class.name] = entry

        students_by_class = {entry['key']: [] for entry in class_entries}
        students = students_api.list_students(school=school)
        if request.user.role == 'TEACHER':
            students = students.filter(
                Q(school_class_id__in=[school_class.id for school_class in registered_classes])
                | Q(student_class__in=[school_class.name for school_class in registered_classes])
            )

        student_ids = []
        for student in students:
            entry = class_by_id.get(student.school_class_id)
            if not entry and student.student_class:
                entry = class_by_name.get(student.student_class)
            if not entry and student.student_class and request.user.role in SCHOOL_ADMIN_ROLES:
                legacy_key = f'legacy:{student.student_class}'
                entry = {
                    'key': legacy_key,
                    'id': legacy_key,
                    'name': student.student_class,
                    'sub_school_id': None,
                    'sub_school_name': 'Main School',
                    'school_class': None,
                    'class_subjects': [],
                }
                class_entries.append(entry)
                class_by_name[student.student_class] = entry
                students_by_class[legacy_key] = []
            if entry:
                students_by_class[entry['key']].append(student)
                student_ids.append(student.id)

        students_by_id = {student.id: student for student in students}
        grades_by_student = {}
        if sequence and student_ids:
            grade_queryset = Grade.objects.select_related('subject', 'teacher', 'school_class').filter(
                school=school,
                sequence=sequence,
                student_id__in=student_ids,
            )
            if request.user.role == 'TEACHER':
                grade_queryset = grade_queryset.filter(
                    Q(teacher=request.user)
                    | Q(subject__teacher=request.user)
                    | Q(subject__class_links__teacher=request.user)
                ).distinct()
            for grade in grade_queryset:
                student = students_by_id.get(grade.student_id)
                if student and not _grade_matches_student_current_class(grade, student):
                    continue
                grades_by_student.setdefault(grade.student_id, []).append(grade)

        rows = []
        for entry in class_entries:
            school_class = entry['school_class']
            class_students = students_by_class.get(entry['key'], [])
            class_subjects = entry['class_subjects']
            teacher_ids = {
                str(class_subject.teacher_id)
                for class_subject in class_subjects
                if class_subject.teacher_id
            }
            teacher_ids.update(
                str(class_subject.subject.teacher_id)
                for class_subject in class_subjects
                if getattr(class_subject.subject, 'teacher_id', None)
            )
            if school_class and school_class.class_master_id:
                teacher_ids.add(str(school_class.class_master_id))

            student_averages = []
            marks_entered = 0
            subject_ids_from_grades = set()
            for student in class_students:
                student_grades = grades_by_student.get(student.id, [])
                marks_entered += len(student_grades)
                for grade in student_grades:
                    subject_ids_from_grades.add(str(grade.subject_id))
                    if grade.teacher_id:
                        teacher_ids.add(str(grade.teacher_id))
                average = self._class_student_average(student_grades)
                if average is not None:
                    student_averages.append(average)

            class_average = Decimal('0.00')
            if student_averages:
                class_average = (
                    sum(student_averages, Decimal('0.00')) / Decimal(len(student_averages))
                ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            stats_config = get_assessment_config(school)
            performance = int((class_average / stats_config.max_score * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
            pass_count = sum(1 for average in student_averages if average >= stats_config.pass_mark)
            pass_rate = int((Decimal(pass_count) / Decimal(len(student_averages)) * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if student_averages else 0
            subject_count = len(class_subjects) or len(subject_ids_from_grades)
            expected_entries = len(class_students) * max(subject_count, 1)
            completion_rate = int((Decimal(marks_entered) / Decimal(expected_entries) * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if expected_entries else 0

            rows.append({
                'id': entry['id'],
                'name': entry['name'],
                'sub_school_id': entry['sub_school_id'],
                'sub_school_name': entry['sub_school_name'],
                'students': len(class_students),
                'student_count': len(class_students),
                'teachers': len(teacher_ids),
                'teacher_count': len(teacher_ids),
                'average_mark': float(class_average),
                'averageMark': float(class_average),
                'performance': performance,
                'pass_rate': pass_rate,
                'passRate': pass_rate,
                'completion_rate': completion_rate,
                'completionRate': completion_rate,
                'marks_entered': marks_entered,
                'marksEntered': marks_entered,
                'graded_students': len(student_averages),
                'subjects': subject_count,
            })

        sequence_payload = None
        if sequence:
            sequence_payload = {
                'id': str(sequence.id),
                'name': sequence.name,
                'academic_year': sequence.academic_year,
                'term': sequence.term,
                'is_active': sequence.is_active,
            }

        totals = {
            'students': sum(row['students'] for row in rows),
            'teachers': sum(row['teachers'] for row in rows),
            'marks_entered': sum(row['marks_entered'] for row in rows),
            'average_mark': (
                round(sum(row['average_mark'] for row in rows if row['graded_students']) / len([row for row in rows if row['graded_students']]), 2)
                if any(row['graded_students'] for row in rows)
                else 0
            ),
        }
        return Response({
            'sequence': sequence_payload,
            'classes': rows,
            'totals': totals,
            'scale': {'min': 0, 'max': _scale_label_number(school), 'pass_mark': _pass_mark_number(school), 'system': 'Cameroon secondary education'},
        })

    @action(detail=False, methods=['get'], url_path='period-statistics')
    def period_statistics(self, request):
        """Principal/vice-principal term analytics from real Cameroon grade records."""
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only the principal and delegated school administrators can view term statistics.")
        if not request.user.school_id:
            raise PermissionDenied("Your account is not linked to a school.")

        from apps.schools.models import SchoolClass
        school = request.user.school
        sequence = None
        sequences = []
        term = None
        academic_year = None

        if request.query_params.get('sequence_id'):
            scope, sequence, sequences, term, academic_year = self._period_from_request(
                school,
                {'scope': ReportCardPublication.Scope.SEQUENCE, 'sequence_id': request.query_params.get('sequence_id')},
            )
        elif request.query_params.get('term') and request.query_params.get('academic_year'):
            scope, sequence, sequences, term, academic_year = self._period_from_request(
                school,
                {
                    'scope': ReportCardPublication.Scope.TERM,
                    'term': request.query_params.get('term'),
                    'academic_year': request.query_params.get('academic_year'),
                },
            )
        else:
            scope = ReportCardPublication.Scope.SEQUENCE
            sequence = self._active_or_latest_sequence(school)
            sequences = [sequence] if sequence else []
            term = sequence.term if sequence else None
            academic_year = sequence.academic_year if sequence else _current_academic_year_for_school(school)

        sequence_ids = [item.id for item in sequences if item]
        class_id = request.query_params.get('class_id') or request.query_params.get('school_class')
        sub_school_id = request.query_params.get('sub_school_id')
        selected_class = None
        if class_id:
            selected_class = SchoolClass.objects.filter(id=class_id, school=school).first()
            if not selected_class:
                raise ValidationError({'class_id': 'Selected class was not found in this school.'})

        students = filter_students_by_platform_access(
            students_api.list_students(school=school).select_related(
                'school_class__sub_school'
            )
        )
        if selected_class:
            students = students.filter(Q(school_class=selected_class) | Q(student_class=selected_class.name))
        elif sub_school_id:
            students = students.filter(school_class__sub_school_id=sub_school_id)

        students = list(students.order_by('school_class__name', 'user__name', 'admission_number'))
        if not sequence_ids:
            return Response({
                'period': {
                    'scope': scope,
                    'academic_year': academic_year,
                    'term': term,
                    'sequence': None,
                    'sequences': [],
                },
                'summary': {
                    'total_students': len(students),
                    'ranked_students': 0,
                    'school_average': 0,
                    'pass_rate': 0,
                    'pass_count': 0,
                    'fail_count': 0,
                    'scale': f'0-{_scale_label_number(school)}',
                },
                'top_students': [],
                'bottom_students': [],
                'classes': [],
                'sub_schools': [],
            })

        grade_queryset = Grade.objects.select_related(
            'student',
            'student__user',
            'student__school_class',
            'student__school_class__sub_school',
            'subject',
            'sequence',
            'school_class',
        ).filter(
            school=school,
            sequence_id__in=sequence_ids,
            student__in=students,
        )

        students_by_id = {student.id: student for student in students}
        grades_by_student = {}
        for grade in grade_queryset:
            student = students_by_id.get(grade.student_id)
            if not student or not _grade_matches_student_current_class(grade, student):
                continue
            grades_by_student.setdefault(grade.student_id, []).append(grade)

        rows = []
        class_groups = {}
        sub_school_groups = {}
        period_pass_mark = get_assessment_config(school).pass_mark
        for student in students:
            student_grades = grades_by_student.get(student.id, [])
            average = self._class_student_average(student_grades)
            if average is None:
                continue
            school_class = student.school_class
            class_name = school_class.name if school_class else (student.student_class or 'Unassigned')
            sub_school = school_class.sub_school if school_class and school_class.sub_school_id else None
            sub_school_name = sub_school.name if sub_school else 'Main School'
            row = {
                'student_id': str(student.id),
                'student_name': student.display_name,
                'matricule': student.display_matricule,
                'admission_number': student.admission_number,
                'class_id': str(school_class.id) if school_class else None,
                'class_name': class_name,
                'sub_school_id': str(sub_school.id) if sub_school else None,
                'sub_school_name': sub_school_name,
                'average': average,
                'marks_entered': len(student_grades),
                'status': 'PASSED' if average >= period_pass_mark else 'FAILED',
            }
            rows.append(row)
            class_groups.setdefault(row['class_id'] or class_name, {'name': class_name, 'averages': [], 'students': 0, 'passes': 0})
            class_groups[row['class_id'] or class_name]['averages'].append(average)
            class_groups[row['class_id'] or class_name]['students'] += 1
            class_groups[row['class_id'] or class_name]['passes'] += 1 if average >= period_pass_mark else 0
            sub_school_groups.setdefault(row['sub_school_id'] or sub_school_name, {'name': sub_school_name, 'averages': [], 'students': 0, 'passes': 0})
            sub_school_groups[row['sub_school_id'] or sub_school_name]['averages'].append(average)
            sub_school_groups[row['sub_school_id'] or sub_school_name]['students'] += 1
            sub_school_groups[row['sub_school_id'] or sub_school_name]['passes'] += 1 if average >= period_pass_mark else 0

        ranked_rows = self._rank_average_rows(rows)
        for row in ranked_rows:
            row['average'] = float(row['average'])

        ranked_count = len(ranked_rows)
        pass_count = sum(1 for row in ranked_rows if Decimal(str(row['average'])) >= period_pass_mark)
        school_average = Decimal('0.00')
        if rows:
            school_average = (
                sum((Decimal(str(row['average'])) for row in rows), Decimal('0.00')) / Decimal(len(rows))
            ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        def summarize_group(group):
            averages = group['averages']
            average = Decimal('0.00')
            if averages:
                average = (sum(averages, Decimal('0.00')) / Decimal(len(averages))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            return {
                'name': group['name'],
                'students': group['students'],
                'ranked_students': len(averages),
                'average': float(average),
                'pass_rate': int((Decimal(group['passes']) / Decimal(len(averages)) * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if averages else 0,
            }

        sequence_payloads = [
            {
                'id': str(item.id),
                'name': item.name,
                'term': item.term,
                'academic_year': item.academic_year,
                'is_active': item.is_active,
            }
            for item in sequences
        ]
        return Response({
            'period': {
                'scope': scope,
                'academic_year': academic_year,
                'term': term,
                'sequence': sequence_payloads[0] if scope == ReportCardPublication.Scope.SEQUENCE and sequence_payloads else None,
                'sequences': sequence_payloads,
            },
            'summary': {
                'total_students': len(students),
                'ranked_students': ranked_count,
                'school_average': float(school_average),
                'pass_rate': int((Decimal(pass_count) / Decimal(ranked_count) * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if ranked_count else 0,
                'pass_count': pass_count,
                'fail_count': ranked_count - pass_count,
                'scale': f'0-{_scale_label_number(school)}',
            },
            'top_students': ranked_rows[:10],
            'bottom_students': list(reversed(ranked_rows[-10:])) if ranked_rows else [],
            'classes': sorted((summarize_group(group) for group in class_groups.values()), key=lambda item: item['average'], reverse=True),
            'sub_schools': sorted((summarize_group(group) for group in sub_school_groups.values()), key=lambda item: item['average'], reverse=True),
        })

    def _publish_one_class(self, request, school, class_name, class_id, scope, sequence, sequences, term, academic_year):
        """Publish one class for a period. Returns a result dict; never raises for
        the ordinary 'nothing to publish' cases so bulk publishing can skip them."""
        class_students = list(self._students_for_class(school, class_name, class_id))
        if not class_students:
            return {'class_name': class_name, 'published': False, 'reason': 'no_students'}

        locked_students = [student.display_name for student in class_students if not _student_platform_charge_is_paid(student)]
        students = [student for student in class_students if _student_platform_charge_is_paid(student)]
        if not students:
            return {'class_name': class_name, 'published': False, 'reason': 'all_unpaid', 'locked_students': locked_students}

        period_sequence_ids = [item.id for item in sequences]
        students_with_marks = []
        for student in students:
            grade_query = Grade.objects.filter(student=student, sequence_id__in=period_sequence_ids)
            grade_query = grade_query.filter(_student_current_class_grade_q(student))
            if grade_query.exists():
                students_with_marks.append(student)
        if not students_with_marks:
            return {'class_name': class_name, 'published': False, 'reason': 'no_marks', 'locked_students': locked_students}

        school_class = None
        if class_id and not str(class_id).startswith('legacy:'):
            from apps.schools.models import SchoolClass

            school_class = SchoolClass.objects.filter(id=class_id, school=school).first()

        recalculation = {'term_results': 0, 'annual_results': 0}
        if scope == ReportCardPublication.Scope.TERM:
            recalculation = self._refresh_term_and_annual_results(school, students, term, academic_year)

        publication_filter = {
            'school': school,
            'school_class': school_class,
            'class_name': class_name,
            'scope': scope,
            'sequence': sequence if scope == ReportCardPublication.Scope.SEQUENCE else None,
            'academic_year': academic_year,
            'term': term if scope == ReportCardPublication.Scope.TERM else None,
        }
        publication = ReportCardPublication.objects.filter(**publication_filter).first()
        if not publication:
            publication = ReportCardPublication(**publication_filter)
        publication.school_class = school_class
        publication.is_published = True
        publication.published_by = request.user
        publication.published_at = timezone.now()
        publication.save()

        try:
            from apps.notifications.models import NotificationPriority, NotificationType
            from apps.notifications.services import create_notifications

            period_label = sequence.name if scope == ReportCardPublication.Scope.SEQUENCE and sequence else f'Term {term} {academic_year}'

            # Students receive the class-level announcement.
            student_recipients = User.objects.filter(
                id__in={student.user_id for student in students_with_marks if student.user_id},
                is_active=True,
            )
            create_notifications(
                recipients=student_recipients,
                sender=request.user,
                title='Report cards published',
                message=f'{class_name} report cards for {period_label} have been published by {school.name}.',
                notification_type=NotificationType.GRADE_PUBLISHED,
                priority=NotificationPriority.HIGH,
                icon='file-check',
                url='/dashboard/grades',
            )

            # Parents and guardians are addressed by their child's name, so a
            # parent with several children always knows whose card is ready.
            parents_by_student = students_api.get_guardian_users_by_student(
                students_with_marks
            )
            student_names = {
                student.id: (student.display_name or 'Your child')
                for student in students_with_marks
            }
            for student_id, parent_list in parents_by_student.items():
                student_name = student_names.get(student_id, 'Your child')
                first_name = (student_name or 'Your child').split(' ')[0]
                active_parents = [parent for parent in parent_list if getattr(parent, 'is_active', True)]
                if not active_parents:
                    continue
                create_notifications(
                    recipients=active_parents,
                    sender=request.user,
                    title=f"{first_name}'s report card is ready",
                    message=f"{student_name}'s {period_label} report card has been published by {school.name}.",
                    notification_type=NotificationType.GRADE_PUBLISHED,
                    priority=NotificationPriority.HIGH,
                    icon='file-check',
                    url='/dashboard/children',
                )
        except Exception:
            logger.exception("Failed to notify students and parents after publishing report cards.")

        return {
            'class_name': class_name,
            'published': True,
            'publication': publication,
            'students_count': len(students),
            'locked_students': locked_students,
            'students_with_marks': len(students_with_marks),
            'recalculation': recalculation,
        }

    def _publish_report_cards_response(self, request):
        """Release one class's report cards to students and parents for a sequence or term."""
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can publish report cards.")
        if not request.user.school_id:
            raise PermissionDenied("Your account is not linked to a school.")

        school = request.user.school
        class_name = str(request.data.get('class_name') or '').strip()
        class_id = request.data.get('class_id') or request.data.get('school_class')
        if not class_name:
            raise ValidationError({'class_name': 'Select the class whose report cards should be published.'})

        scope, sequence, sequences, term, academic_year = self._period_from_request(school, request.data)
        result = self._publish_one_class(request, school, class_name, class_id, scope, sequence, sequences, term, academic_year)

        if not result['published']:
            reason = result.get('reason')
            if reason == 'no_students':
                raise ValidationError({'class_name': 'No students were found in this class.'})
            if reason == 'all_unpaid':
                raise PermissionDenied(
                    f"Report cards cannot be published because all students in this class have unpaid platform charges: {', '.join(result.get('locked_students', [])[:5])}."
                )
            raise ValidationError({'grades': 'No marks have been entered for this class and academic period yet.'})

        serializer = ReportCardPublicationSerializer(result['publication'], context={'request': request})
        return Response({
            'publication': serializer.data,
            'students_count': result['students_count'],
            'locked_students_count': len(result['locked_students']),
            'locked_students': result['locked_students'][:10],
            'students_with_marks': result['students_with_marks'],
            'recalculation': result['recalculation'],
            'message': 'Report cards are now published for eligible students and parents.',
        })

    def _publish_all_report_cards_response(self, request):
        """Publish every class in the school for a sequence or term in one action."""
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can publish report cards.")
        if not request.user.school_id:
            raise PermissionDenied("Your account is not linked to a school.")

        school = request.user.school
        scope, sequence, sequences, term, academic_year = self._period_from_request(school, request.data)

        # Every distinct class currently holding students (real + legacy names).
        class_map = {}
        for student in students_api.list_students(school=school):
            cname = student.school_class.name if student.school_class_id else (student.student_class or '')
            cname = (cname or '').strip()
            if not cname:
                continue
            cid = str(student.school_class_id) if student.school_class_id else None
            class_map.setdefault(cname, cid)

        if not class_map:
            raise ValidationError({'detail': 'No classes with students were found in this school.'})

        published_classes = []
        skipped_classes = []
        total_students = 0
        for cname, cid in class_map.items():
            try:
                # Per-class savepoint: a failure rolls back only that class so the
                # rest still publish and the DB connection stays usable.
                with transaction.atomic():
                    result = self._publish_one_class(request, school, cname, cid, scope, sequence, sequences, term, academic_year)
            except Exception:  # noqa: BLE001 — one bad class must not abort the whole run
                logger.exception("Failed to publish report cards for class %s", cname)
                skipped_classes.append({'class_name': cname, 'reason': 'error'})
                continue
            if result.get('published'):
                published_classes.append({'class_name': cname, 'students_with_marks': result['students_with_marks']})
                total_students += result['students_with_marks']
            else:
                skipped_classes.append({'class_name': cname, 'reason': result.get('reason', 'skipped')})

        if not published_classes:
            raise ValidationError({
                'detail': 'No report cards could be published yet — no marks have been entered for the selected period in any class.'
            })

        period_label = sequence.name if scope == ReportCardPublication.Scope.SEQUENCE and sequence else f'Term {term} {academic_year}'
        return Response({
            'message': f'Published report cards for {len(published_classes)} class(es) ({total_students} students) for {period_label}.',
            'period_label': period_label,
            'published_classes': published_classes,
            'published_count': len(published_classes),
            'skipped_classes': skipped_classes,
            'students_with_marks': total_students,
        })

    @action(detail=False, methods=['post'], url_path='report_cards/publish')
    @transaction.atomic
    def publish_report_cards(self, request):
        return self._publish_report_cards_response(request)

    @action(detail=False, methods=['post'], url_path='report-cards/publish')
    @transaction.atomic
    def publish_report_cards_hyphen(self, request):
        return self._publish_report_cards_response(request)

    @action(detail=False, methods=['post'], url_path='publish-report-cards')
    @transaction.atomic
    def publish_report_cards_action(self, request):
        return self._publish_report_cards_response(request)

    @action(detail=False, methods=['post'], url_path='report-cards/publish-all')
    def publish_all_report_cards(self, request):
        return self._publish_all_report_cards_response(request)

    @action(detail=False, methods=['post'], url_path='publish-all-report-cards')
    def publish_all_report_cards_action(self, request):
        return self._publish_all_report_cards_response(request)

    @action(detail=False, methods=['get'], url_path='honour-roll')
    def honour_roll(self, request):
        """Calculate a real Cameroon-period honour roll from recorded marks."""
        if request.user.role not in [*SCHOOL_STAFF_ROLES, 'STUDENT', 'PARENT']:
            raise PermissionDenied("You do not have permission to view the honour roll.")

        if request.user.role == 'PARENT':
            school_ids = _related_school_ids_for_parent(request.user)
            school = None
            if len(school_ids) == 1:
                from apps.schools.models import School

                school = School.objects.filter(id=next(iter(school_ids))).first()
            if not school:
                raise ValidationError({'school': 'Select a child school before viewing rewards.'})
        else:
            school = request.user.school
        if not school:
            raise PermissionDenied("Your account is not linked to a school.")

        threshold = request.query_params.get('threshold')
        try:
            threshold = Decimal(str(threshold)) if threshold not in [None, ''] else self._school_honour_roll_threshold(school)
        except Exception:
            raise ValidationError({'threshold': 'Threshold must be a valid number on the 0-20 scale.'})
        threshold_max = get_assessment_config(school).max_score
        if threshold < Decimal('0.00') or threshold > threshold_max:
            raise ValidationError({'threshold': f'Threshold must be between 0 and {_scale_label(threshold_max)}.'})

        scope_param = str(request.query_params.get('scope') or '').lower()
        sequence_id = request.query_params.get('sequence_id')
        term_param = request.query_params.get('term')
        academic_year = request.query_params.get('academic_year')
        if sequence_id:
            period_data = {'scope': ReportCardPublication.Scope.SEQUENCE, 'sequence_id': sequence_id}
        elif scope_param == 'term' or term_param:
            period_data = {
                'scope': ReportCardPublication.Scope.TERM,
                'term': term_param,
                'academic_year': academic_year,
            }
        else:
            active_sequence = self._active_or_latest_sequence(school)
            if not active_sequence:
                return Response({
                    'period': None,
                    'threshold': float(threshold),
                    'published': False,
                    'status': 'NO_RESULTS_PUBLISHED',
                    'message': 'No academic period has been configured or published yet.',
                    'results': [],
                    'summary': {'eligible': 0, 'total_ranked': 0, 'class_average': 0, 'pass_rate': 0},
                })
            period_data = {'scope': ReportCardPublication.Scope.SEQUENCE, 'sequence_id': str(active_sequence.id)}

        scope, sequence, sequences, term, academic_year = self._period_from_request(school, period_data)
        sequence_ids = [item.id for item in sequences]
        publication_queryset = ReportCardPublication.objects.filter(
            school=school,
            scope=scope,
            is_published=True,
        )
        if sequence:
            publication_queryset = publication_queryset.filter(sequence=sequence)
        else:
            publication_queryset = publication_queryset.filter(term=term, academic_year=academic_year)
        is_period_published = publication_queryset.exists()
        period_payload = {
            'scope': scope,
            'sequence_id': str(sequence.id) if sequence else None,
            'sequence_name': sequence.name if sequence else None,
            'term': term,
            'term_label': self._term_label(term) if term else None,
            'academic_year': academic_year,
            'sequences': [
                {
                    'id': str(item.id),
                    'name': item.name,
                    'term': item.term,
                    'academic_year': item.academic_year,
                }
                for item in sequences
            ],
        }
        if not is_period_published:
            return Response({
                'period': period_payload,
                'threshold': float(threshold),
                'published': False,
                'status': 'NO_RESULTS_PUBLISHED',
                'message': 'No results have been published yet for this academic period.',
                'results': [],
                'summary': {'eligible': 0, 'total_ranked': 0, 'class_average': 0, 'pass_rate': 0},
            })

        students = filter_students_by_platform_access(
            students_api.list_students(school=school).select_related(
                'school_class__sub_school'
            )
        )
        if request.user.role == 'TEACHER':
            taught_class_ids = _teacher_taught_class_ids(request.user)
            taught_class_names = _teacher_taught_class_names(request.user)
            students = students.filter(Q(school_class_id__in=taught_class_ids) | Q(student_class__in=taught_class_names))
        elif request.user.role == 'STUDENT':
            students = students.filter(user=request.user)
        elif request.user.role == 'PARENT':
            students = students.filter(
                id__in=students_api.list_student_ids_for_guardian(request.user)
            )

        rows = []
        for student in students.distinct():
            grade_query = Grade.objects.filter(student=student, sequence_id__in=sequence_ids)
            grade_query = grade_query.filter(_student_current_class_grade_q(student))
            if not grade_query.exists():
                continue
            average = calculate_sequence_average(student, sequence) if sequence else calculate_period_average(student, sequences)
            if average <= Decimal('0.00'):
                continue
            rows.append({'student': student, 'average': average, 'rank': None})

        ranked = self._rank_average_rows(rows)
        pass_count = sum(1 for row in ranked if row['average'] >= get_assessment_config(school).pass_mark)
        eligible = []
        for row in ranked:
            if row['average'] < threshold:
                continue
            student = row['student']
            class_name = student.school_class.name if student.school_class_id else student.student_class
            sub_school_name = (
                student.school_class.sub_school.name
                if student.school_class_id and student.school_class.sub_school_id
                else 'Main School'
            )
            eligible.append({
                'id': str(student.id),
                'student_id': str(student.id),
                'name': student.display_name,
                'matricule': student.display_matricule,
                'admission_number': student.admission_number,
                'class': class_name,
                'class_name': class_name,
                'section': student.section,
                'sub_school_name': sub_school_name,
                'average': float(row['average']),
                'rank': row['rank'],
                'total_students': len(ranked),
                'award': self._award_label_for_average(row['average']),
                'period_label': sequence.name if sequence else f'{self._term_label(term)} {academic_year}',
                'academic_year': academic_year,
                'term': term,
                'scope': scope,
                'school': {
                    'id': school.id,
                    'name': school.name,
                    'motto': school.motto,
                    'logo': school.logo,
                    'matricule': school.matricule,
                },
            })

        class_average = Decimal('0.00')
        if ranked:
            class_average = (
                sum((row['average'] for row in ranked), Decimal('0.00')) / Decimal(len(ranked))
            ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        pass_rate = int((Decimal(pass_count) / Decimal(len(ranked)) * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if ranked else 0

        return Response({
            'period': period_payload,
            'threshold': float(threshold),
            'published': True,
            'status': 'PUBLISHED',
            'message': '',
            'results': eligible,
            'summary': {
                'eligible': len(eligible),
                'total_ranked': len(ranked),
                'class_average': float(class_average),
                'pass_rate': pass_rate,
            },
        })

    def _resolve_history_student(self, request):
        """Resolve which student a history/transcript request refers to, with
        the same access rules as report cards: students see themselves, parents
        their linked children, and school staff any student of their school."""
        student_id = request.query_params.get('student_id')
        if request.user.role == 'STUDENT':
            student = students_api.get_student_for_user(request.user)
        elif student_id:
            student = students_api.get_student(student_id)
        else:
            student = None
        if not student:
            return None, Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role == 'PARENT':
            if not students_api.is_guardian_of(request.user, student):
                raise PermissionDenied('You can only view records for your linked children.')
        elif request.user.role == 'STUDENT':
            pass
        elif getattr(request.user, 'school_id', None) != student.school_id:
            raise PermissionDenied('You can only view records for students in your school.')
        return student, None

    def _class_name_for_year(self, student, academic_year):
        """The class the student was in during an academic year, from the class
        snapshot stored on their marks; falls back to the current class."""
        snapshot = (
            Grade.objects.filter(student=student, sequence__academic_year=academic_year)
            .exclude(class_name_snapshot='')
            .values_list('class_name_snapshot', flat=True)
            .first()
        )
        if snapshot:
            return snapshot
        return student.school_class.name if student.school_class_id else (student.student_class or '')

    @action(detail=False, methods=['get'], url_path='honour-roll/history')
    def honour_roll_history(self, request):
        """Every honour roll a student has ever earned: each term (across every
        academic year) whose average met the school's honour-roll threshold."""
        student, error = self._resolve_history_student(request)
        if error:
            return error

        threshold = self._school_honour_roll_threshold(student.school)
        entries = []
        for result in TermResult.objects.filter(student=student).order_by('-academic_year', '-term'):
            average = Decimal(str(result.average))
            if average >= threshold:
                entries.append({
                    'academic_year': result.academic_year,
                    'term': result.term,
                    'term_label': self._term_label(result.term),
                    'average': float(average),
                    'rank': getattr(result, 'rank', None),
                    'total_students': result.total_students,
                    'class_name': self._class_name_for_year(student, result.academic_year),
                })

        from .utils import _student_payload, _school_payload
        return Response({
            'threshold': float(threshold),
            'student': _student_payload(student),
            'school': _school_payload(student.school),
            'results': entries,
        })

    @action(detail=False, methods=['get'])
    def transcript(self, request):
        """Official multi-year transcript: for every class level the student has
        passed through, each subject's Term 1/2/3 averages and annual average,
        plus the coefficient-weighted annual average per level — split into the
        First Cycle and Second Cycle exactly as on the official document."""
        student, error = self._resolve_history_student(request)
        if error:
            return error

        FIRST_ORDER = ['form 1', 'form 2', 'form 3', 'form 4', 'form 5',
                       '6e', '6eme', '5e', '5eme', '4e', '4eme', '3e', '3eme']
        SECOND_ORDER = ['lower sixth', 'upper sixth', '2nde', 'seconde', '1ere', 'premiere', 'tle', 'terminale']

        def level_key(name):
            text = str(name or '').lower()
            for token in SECOND_ORDER:
                if token in text:
                    return token, 'second'
            for token in FIRST_ORDER:
                if token in text:
                    return token, 'first'
            return None, None

        def level_label(token):
            labels = {
                'form 1': 'Form 1', 'form 2': 'Form 2', 'form 3': 'Form 3', 'form 4': 'Form 4', 'form 5': 'Form 5',
                '6e': '6e', '6eme': '6e', '5e': '5e', '5eme': '5e', '4e': '4e', '4eme': '4e', '3e': '3e', '3eme': '3e',
                'lower sixth': 'Lower Sixth', 'upper sixth': 'Upper Sixth',
                '2nde': '2nde', 'seconde': '2nde', '1ere': '1ère', 'premiere': '1ère', 'tle': 'Tle', 'terminale': 'Tle',
            }
            return labels.get(token, token.title())

        grades = (
            Grade.objects.filter(student=student)
            .select_related('subject', 'sequence', 'school_class')
            .order_by('sequence__academic_year', 'sequence__term')
        )

        # scores[cycle][level_token][subject_name][term] -> [scores]; coefficient per subject
        data = {'first': {}, 'second': {}}
        coefficients = {}
        current_class = student.school_class.name if student.school_class_id else (student.student_class or '')
        for grade in grades:
            class_name = grade.class_name_snapshot or (grade.school_class.name if grade.school_class_id else '') or current_class
            token, cycle = level_key(class_name)
            if not token:
                continue
            level = data[cycle].setdefault(token, {})
            subject_name = grade.subject.name
            coefficients[subject_name] = float(grade.subject.coefficient)
            terms = level.setdefault(subject_name, {1: [], 2: [], 3: []})
            term = int(grade.sequence.term or 0)
            if term in (1, 2, 3):
                terms[term].append(float(grade.score))

        def mean(values):
            return round(sum(values) / len(values), 2) if values else None

        def build_cycle(cycle, order):
            present = [t for t in order if t in data[cycle]]
            # deduplicate labels (6e/6eme) while keeping order
            levels, seen = [], set()
            for t in present:
                label = level_label(t)
                if label not in seen:
                    levels.append({'token': t, 'label': label})
                    seen.add(label)
            subjects = sorted({s for t in present for s in data[cycle][t].keys()})
            rows = []
            for subject in subjects:
                cells = {}
                for lvl in levels:
                    terms = data[cycle].get(lvl['token'], {}).get(subject)
                    if not terms:
                        cells[lvl['label']] = None
                        continue
                    t1, t2, t3 = mean(terms[1]), mean(terms[2]), mean(terms[3])
                    anns = [v for v in (t1, t2, t3) if v is not None]
                    cells[lvl['label']] = {'t1': t1, 't2': t2, 't3': t3, 'ann': mean(anns)}
                rows.append({'subject': subject, 'coefficient': coefficients.get(subject, 1), 'cells': cells})
            annual = {}
            for lvl in levels:
                total, coef_total = 0.0, 0.0
                for row in rows:
                    cell = row['cells'].get(lvl['label'])
                    if cell and cell['ann'] is not None:
                        coef = float(row['coefficient'] or 1)
                        total += cell['ann'] * coef
                        coef_total += coef
                annual[lvl['label']] = round(total / coef_total, 2) if coef_total else None
            return {'levels': [lvl['label'] for lvl in levels], 'rows': rows, 'annual': annual}

        from .utils import _school_payload
        return Response({
            'student': {
                'name': student.display_name,
                'matricule': student.display_matricule,
                'admission_number': student.admission_number,
                'date_of_birth': str(getattr(student, 'date_of_birth', '') or ''),
                'sex': str(getattr(student, 'sex', '') or getattr(student, 'gender', '') or ''),
                'photo': (student.user.avatar if student.user_id else '') or '',
                'class_name': current_class,
            },
            'school': _school_payload(student.school),
            'first_cycle': build_cycle('first', FIRST_ORDER),
            'second_cycle': build_cycle('second', SECOND_ORDER),
        })

    @action(detail=False, methods=['get'])
    def report_card(self, request):
        """Full report card for a student in a sequence or Cameroon term."""
        student_id = request.query_params.get('student_id')
        sequence_id = request.query_params.get('sequence_id')
        term = request.query_params.get('term')
        academic_year = request.query_params.get('academic_year')

        if not student_id or (not sequence_id and not (term and academic_year)):
            return Response(
                {'error': 'Provide student_id with either sequence_id, or term and academic_year.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        student = students_api.get_student(student_id)
        if student is None:
            return Response(
                {'error': 'Student not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        _ensure_student_platform_charge_paid(student)

        sequence = None
        if sequence_id:
            try:
                sequence = Sequence.objects.get(id=sequence_id)
            except Sequence.DoesNotExist:
                return Response(
                    {'error': 'Sequence not found.'},
                    status=status.HTTP_404_NOT_FOUND
                )
            if sequence.school_id != student.school_id:
                raise PermissionDenied("You can only view report cards in the student's school.")
        else:
            try:
                term = int(term)
            except (TypeError, ValueError):
                raise ValidationError({'term': 'Term must be 1, 2, or 3.'})
            if term not in [1, 2, 3]:
                raise ValidationError({'term': 'Term must be 1, 2, or 3.'})
            if not Sequence.objects.filter(school=student.school, term=term, academic_year=academic_year).exists():
                return Response(
                    {'error': 'No sequences found for this term and academic year.'},
                    status=status.HTTP_404_NOT_FOUND
                )

        # Check permissions
        if request.user.role == 'STUDENT':
            if student.user != request.user:
                raise PermissionDenied("You can only view your own report card.")
        elif request.user.role == 'PARENT':
            if not students_api.is_guardian_of(request.user, student):
                raise PermissionDenied("You can only view report cards for your linked children.")
        elif request.user.role == 'TEACHER':
            if student.school_id != request.user.school_id or (sequence and sequence.school_id != request.user.school_id):
                raise PermissionDenied("You can only view report cards in your school.")
            taught_class_ids = _teacher_taught_class_ids(request.user)
            taught_class_names = _teacher_taught_class_names(request.user)
            if student.school_class_id not in taught_class_ids and student.student_class not in taught_class_names:
                raise PermissionDenied("You can only view report cards for students in classes you teach.")
        elif request.user.role in SCHOOL_ADMIN_ROLES:
            if student.school_id != request.user.school_id or (sequence and sequence.school_id != request.user.school_id):
                raise PermissionDenied("You can only view report cards in your school.")
        else:
            raise PermissionDenied("Insufficient permissions to view report card.")

        if request.user.role in ['STUDENT', 'PARENT']:
            scope = ReportCardPublication.Scope.SEQUENCE if sequence else ReportCardPublication.Scope.TERM
            if not self._report_card_is_published(
                student,
                scope,
                sequence=sequence,
                term=term,
                academic_year=academic_year,
            ):
                raise PermissionDenied("This report card has not been published by the school admin yet.")

        data = generate_report_card_data(student, sequence) if sequence else generate_term_report_card_data(student, term, academic_year)
        token = ''
        try:
            # Remember what is being printed (idempotent) so the QR can carry a
            # signed credential for the full details. A failure here must never
            # block the card: it falls back to the header-only QR.
            issue = card_verification.issue_report_card(
                student, data, sequence=sequence, term=term, academic_year=academic_year, issued_by=request.user,
            )
            token = card_verification.issue_token(issue)
        except Exception:  # noqa: BLE001
            logger.exception('Could not record report card issue')
        data.update(build_report_card_verification(student, academic_year, term=term, sequence=sequence, token=token))
        if request.user.role == 'TEACHER':
            data = _filter_report_card_for_teacher(data, request.user, student)
        return Response(data)

    def _resolve_verify_year(self, school, academic_year):
        """QR links slug the academic year (2025-2026) because a raw slash
        breaks the URL path. Resolve the slug back to the school's real
        academic-year string, accepting both forms."""
        raw = str(academic_year or '')
        candidates = [raw]
        if '-' in raw:
            candidates.append(raw.replace('-', '/'))
        if '/' in raw:
            candidates.append(raw.replace('/', '-'))
        match = (
            Sequence.objects.filter(school=school, academic_year__in=candidates)
            .values_list('academic_year', flat=True)
            .first()
        )
        return match or raw

    def _public_report_card_facts(self, request, admission_number, academic_year, key):  # -> (facts, ctx, error)
        """Resolve a scanned report-card QR to (facts, None) or (None, error response).

        ``facts`` is only what is printed in the card header; ``ctx`` carries the
        resolved student and card data for the token-gated detail view. A student
        of a draft school is never confirmed.
        """
        doc = verification.DOC_REPORT_CARD
        student = students_api.resolve_public_student(admission_number, request.query_params.get('school'))
        if student is students_api.AMBIGUOUS:
            return None, None, Response(
                verification.verification_response(
                    verification.RESULT_NOT_VALID, doc,
                    detail='This report card number is used by more than one school. Please ask the school for a re-printed card.',
                ),
                status=status.HTTP_409_CONFLICT,
            )
        if not student:
            return None, None, Response(
                verification.verification_response(
                    verification.RESULT_NOT_VALID, doc, detail='No student found for this report card.',
                ),
                status=status.HTTP_404_NOT_FOUND,
            )

        academic_year = self._resolve_verify_year(student.school, academic_year)
        sequence = None
        term = None
        if key and key.startswith('seq-'):
            sequence = Sequence.objects.filter(id=key[4:], school=student.school).first()
        elif key and key.startswith('term-'):
            try:
                term = int(key[5:])
            except (TypeError, ValueError):
                term = None
        if sequence is None and term not in (1, 2, 3):
            return None, None, Response(
                verification.verification_response(
                    verification.RESULT_NOT_VALID, doc, detail='This report card link is not recognised.',
                ),
                status=status.HTTP_404_NOT_FOUND,
            )

        # A scanned QR is on a physical card that was already issued, so the
        # public check resolves as long as the card exists - it does not require
        # the card to still be published.
        try:
            data = generate_report_card_data(student, sequence) if sequence else generate_term_report_card_data(student, term, academic_year)
        except Exception:  # noqa: BLE001
            data = None
        if not data or not (
            data.get('grades') or data.get('subjects') or any(a.get('level') for a in (data.get('areas') or []))
        ):
            return None, None, Response(
                verification.verification_response(
                    verification.RESULT_NOT_VALID, doc, detail='This report card has not been generated yet.',
                ),
                status=status.HTTP_404_NOT_FOUND,
            )
        if sequence is not None:
            period = f'{sequence.name} - Term {sequence.term}'
            academic_year = sequence.academic_year
            term = sequence.term
        else:
            period = f'Term {term}'
        facts = dict(
            school_name=student.school.name,
            student_name=student.display_name,
            matricule=student.display_matricule,
            class_name=student.student_class,
            period=period,
            term=term,
            academic_year=academic_year,
        )
        ctx = {'student': student, 'data': data, 'sequence': sequence, 'term': term, 'academic_year': academic_year, 'key': key}
        return facts, ctx, None

    @action(
        detail=False,
        methods=['get'],
        url_path=r'verify-report-card/(?P<admission_number>[^/]+)/(?P<academic_year>[^/]+(?:/[^/]+)?)/(?P<key>[^/.]+)',
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
        throttle_classes=[verification.PublicVerifyThrottle],
    )
    def verify_report_card(self, request, admission_number=None, academic_year=None, key=None):
        """Public QR-scan verification of a printed report card (no login).

        Without a token (``?t=``) only the header facts are returned. With the
        signed token printed in the card's QR, the exact card is returned too.
        """
        token = request.query_params.get('t')
        facts, ctx, error = self._public_report_card_facts(request, admission_number, academic_year, key)
        if token:
            return self._detailed_response(token, facts, ctx, error)
        if error is not None:
            return error
        user = getattr(ctx['student'], 'user', None)
        if user is not None and not user.is_active:
            return Response(verification.verification_response(
                verification.RESULT_REVOKED, verification.DOC_REPORT_CARD,
                detail='This report card is no longer valid.', **facts,
            ))
        response = Response(verification.verification_response(
            verification.RESULT_VALID, verification.DOC_REPORT_CARD,
            detail_level='header',
            hint='Scan the QR code printed on the report card itself to see its full details.',
            **facts,
        ))
        response['X-Robots-Tag'] = 'noindex, nofollow'
        return response

    def _detailed_response(self, token, facts, ctx, error):
        """Answer for a scan that carries a token. Every failure is the same 404."""
        doc = verification.DOC_REPORT_CARD

        def not_recognised():
            return verification.private_response_headers(Response(
                verification.verification_response(
                    verification.RESULT_NOT_VALID, doc, detail='This report card link is not recognised.',
                ),
                status=status.HTTP_404_NOT_FOUND,
            ))

        issue = card_verification.resolve_issue(token)
        if issue is None or error is not None or ctx is None:
            return not_recognised()
        student = ctx['student']
        same_card = (
            issue.student_id == student.id
            and issue.scope_key == card_verification.scope_key(ctx['sequence'], ctx['term'])
            and card_verification.year_slug(issue.academic_year) == card_verification.year_slug(ctx['academic_year'])
        )
        if not same_card:
            return not_recognised()

        user = getattr(student, 'user', None)
        if issue.is_revoked or (user is not None and not user.is_active) or self._withdrawn(student, ctx):
            return verification.private_response_headers(Response(verification.verification_response(
                verification.RESULT_REVOKED, doc, detail='This report card is no longer valid.', **facts,
            )))

        current = card_verification.public_card_summary(ctx['data'])
        integrity = card_verification.integrity_report(issue, current)
        return verification.private_response_headers(Response(verification.verification_response(
            verification.RESULT_VALID, doc,
            detail_level='full',
            details=issue.snapshot,
            integrity=integrity,
            **facts,
        )))

    def _withdrawn(self, student, ctx):
        """True when the school published this card and then withdrew every release."""
        qs = ReportCardPublication.objects.filter(school=student.school, class_name=(
            student.school_class.name if student.school_class_id else student.student_class
        ))
        if ctx['sequence'] is not None:
            qs = qs.filter(scope=ReportCardPublication.Scope.SEQUENCE, sequence=ctx['sequence'])
        else:
            qs = qs.filter(scope=ReportCardPublication.Scope.TERM, term=ctx['term'], academic_year=ctx['academic_year'])
        return qs.exists() and not qs.filter(is_published=True).exists()

    @action(
        detail=False,
        methods=['get'],
        url_path=r'verify-report-card-page/(?P<admission_number>[^/]+)/(?P<academic_year>[^/]+(?:/[^/]+)?)/(?P<key>[^/.]+)',
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
        throttle_classes=[verification.PublicVerifyThrottle],
    )
    def verify_report_card_page(self, request, admission_number=None, academic_year=None, key=None):
        """Plain server-rendered verification page (kept for old links).

        It used to render the whole report card to anyone; it now shows the same
        minimal verification result as the website page.
        """
        from django.utils.html import escape

        facts, _ctx, error = self._public_report_card_facts(request, admission_number, academic_year, key)
        if error is not None:
            code = error.status_code
            title, ok = 'Report card not verified', False
            lines = [escape(str(error.data.get('detail', '')))]
        else:
            code = 200
            title, ok = 'Report card verified', True
            lines = [
                f"<b>{escape(str(facts['student_name']))}</b>",
                escape(str(facts['school_name'])),
                f"{escape(str(facts['class_name']))} &middot; {escape(str(facts['period']))} &middot; {escape(str(facts['academic_year']))}",
            ]
        colour = '#0f7a3f' if ok else '#b42318'
        html = (
            "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            f"<title>{escape(title)}</title></head>"
            "<body style='font-family:Arial,sans-serif;background:#eef1f7;margin:0;padding:24px'>"
            "<div style='max-width:520px;margin:48px auto;background:#fff;border-radius:14px;padding:32px;text-align:center'>"
            f"<h1 style='color:{colour};font-size:22px'>{escape(title)}</h1>"
            + ''.join(f'<p>{line}</p>' for line in lines)
            + '</div></body></html>'
        )
        return HttpResponse(html, content_type='text/html; charset=utf-8', status=code)

    @action(detail=False, methods=['get'], url_path='report-card-pdf')
    def report_card_pdf(self, request):
        """Downloadable PDF of the report card — same data and permission
        rules as `report_card`, rendered server-side so web and mobile share
        one document source. Reuses the AI export PDF engine."""
        # Reuse the JSON action for validation, permission checks and data.
        json_response = self.report_card(request)
        if json_response.status_code != 200:
            return json_response
        data = json_response.data

        school = data.get('school') or {}
        student = data.get('student') or {}
        from django.utils.html import escape

        sequence = data.get('sequence') or {}
        grades = data.get('grades') or []
        rows = ''.join(
            f"<tr><td>{g.get('subject_name', '')}</td>"
            f"<td class='c'>{g.get('coefficient', '')}</td>"
            f"<td class='c'>{g.get('score', '')}</td>"
            f"<td class='c'>{g.get('grade_letter', '')}</td>"
            f"<td class='c'>{g.get('total', '')}</td>"
            f"<td>{g.get('teacher_name', '')}</td>"
            f"<td>{escape(str(g.get('remark') or ''))}</td></tr>"
            for g in grades
        )
        period = (
            f"{sequence.get('name', '')} · Term {sequence.get('term', '')} · {sequence.get('academic_year', '')}"
            if sequence else
            f"Term {request.query_params.get('term', '')} · {request.query_params.get('academic_year', '')}"
        )
        average = data.get('average')
        rank = data.get('rank')
        total_students = data.get('total_students')
        html = f"""<!doctype html><html><head><meta charset='utf-8'><style>
        body{{font-family:'Helvetica','Arial',sans-serif;color:#1d1b33;margin:28px;}}
        .head{{text-align:center;border-bottom:3px solid #6C4CE0;padding-bottom:10px;margin-bottom:16px;}}
        .head h1{{margin:0;font-size:20px;color:#4B2FD1;}}
        .head p{{margin:2px 0;font-size:11px;color:#555;}}
        .meta{{display:flex;justify-content:space-between;font-size:12px;margin-bottom:14px;}}
        .meta b{{color:#4B2FD1;}}
        table{{width:100%;border-collapse:collapse;font-size:11.5px;}}
        th,td{{border:1px solid #d8d0f0;padding:6px 8px;text-align:left;}}
        th{{background:#EDE9FB;color:#4B2FD1;}}
        td.c,th.c{{text-align:center;}}
        .summary{{margin-top:16px;font-size:13px;}}
        .summary span{{display:inline-block;margin-right:24px;}}
        .summary b{{color:#4B2FD1;font-size:16px;}}
        .foot{{margin-top:26px;font-size:10px;color:#888;text-align:center;}}
        </style></head><body>
        <div class='head'>
          <h1>{school.get('name', 'EduIgnite School')}</h1>
          <p>{school.get('motto', '') or ''}</p>
          <p>Report Card — {period}</p>
        </div>
        <div class='meta'>
          <div><b>Student:</b> {student.get('name', '')}<br/><b>Class:</b> {student.get('class_name', student.get('class', ''))}</div>
          <div style='text-align:right'><b>Admission №:</b> {student.get('admission_number', '')}<br/><b>Matricule:</b> {student.get('matricule', '')}</div>
        </div>
        <table>
          <tr><th>Subject</th><th class='c'>Coef</th><th class='c'>Score/{_scale_label(data.get('max_score', 20))}</th><th class='c'>Grade</th><th class='c'>Total</th><th>Teacher</th><th>Remark</th></tr>
          {rows}
        </table>
        <div class='summary'>
          <span>Average: <b>{average if average is not None else '—'}/{_scale_label(data.get('max_score', 20))}</b></span>
          <span>Rank: <b>{rank if rank is not None else '—'}{f' / {total_students}' if total_students else ''}</b></span>
          <span>Status: <b>{data.get('promotion_status', '')}</b></span>
        </div>
        <div class='foot'>Generated by EduIgnite · This report card reflects officially published marks.</div>
        </body></html>"""

        try:
            from apps.ai_features.pdf_utils import render_html_to_pdf
            pdf = render_html_to_pdf(html)
        except Exception:
            return Response(
                {'error': 'PDF generation is unavailable on the server right now.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        filename = f"report-card-{student.get('name', 'student').replace(' ', '_')}.pdf"
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=['get'])
    def class_results(self, request):
        """All student results for a class in a sequence"""
        class_name = request.query_params.get('class_name')
        sequence_id = request.query_params.get('sequence_id')
        term = request.query_params.get('term')
        academic_year = request.query_params.get('academic_year')
        subject_id = request.query_params.get('subject_id')

        if not class_name or (not sequence_id and not (term and academic_year)):
            return Response(
                {'error': 'Provide class_name with either sequence_id, or term and academic_year.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if request.user.role not in [*SCHOOL_ADMIN_ROLES, 'TEACHER']:
            raise PermissionDenied("Only school staff can view class results.")

        sequence = None
        sequences = []
        if sequence_id:
            try:
                sequence = Sequence.objects.get(id=sequence_id)
            except Sequence.DoesNotExist:
                return Response(
                    {'error': 'Sequence not found.'},
                    status=status.HTTP_404_NOT_FOUND
                )
            if sequence.school_id != request.user.school_id:
                raise PermissionDenied("You can only view class results in your school.")
            sequences = [sequence]
        else:
            try:
                term = int(term)
            except (TypeError, ValueError):
                raise ValidationError({'term': 'Term must be 1, 2, or 3.'})
            if term not in [1, 2, 3]:
                raise ValidationError({'term': 'Term must be 1, 2, or 3.'})
            sequences = list(Sequence.objects.filter(
                school=request.user.school,
                term=term,
                academic_year=academic_year,
            ).order_by('name'))
            if not sequences:
                return Response(
                    {'error': 'No sequences found for this term and academic year.'},
                    status=status.HTTP_404_NOT_FOUND
                )

        if request.user.role == 'TEACHER':
            from apps.schools.models import SchoolClass

            allowed = SchoolClass.objects.filter(
                id__in=_teacher_taught_class_ids(request.user),
            ).filter(Q(name=class_name)).exists()
            if not allowed:
                raise PermissionDenied("You can only view class results for classes you teach.")
            teacher_subject_ids = _teacher_subject_ids_for_class(request.user, class_name)
            if subject_id:
                teacher_subject_ids = {value for value in teacher_subject_ids if str(value) == str(subject_id)}
            if not teacher_subject_ids:
                return Response([])

        students = filter_students_by_platform_access(
            students_api.list_students(school=request.user.school)
        ).filter(
            Q(student_class=class_name) | Q(school_class__name=class_name)
        ).distinct().order_by('user__name')

        results = []
        for student in students:
            if request.user.role == 'TEACHER':
                subject_grades = Grade.objects.filter(
                    student=student,
                    sequence__in=sequences,
                    teacher=request.user,
                    subject_id__in=teacher_subject_ids,
                ).filter(
                    _student_current_class_grade_q(student)
                ).select_related('subject')
                if not subject_grades.exists():
                    continue
                weighted_total = Decimal('0.00')
                coefficient_total = Decimal('0.00')
                for grade in subject_grades:
                    coefficient = Decimal(str(grade.subject.coefficient))
                    weighted_total += Decimal(str(grade.score)) * coefficient
                    coefficient_total += coefficient
                avg = (weighted_total / coefficient_total).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if coefficient_total else Decimal('0.00')
                rank = None
            else:
                if sequence:
                    avg = calculate_sequence_average(student, sequence)
                    rank = compute_rank(student, sequence)
                else:
                    avg = calculate_term_average(student, term, academic_year)
                    rank = compute_period_rank(student, sequences)
            results.append({
                'student_id': str(student.id),
                'student_name': student.display_name,
                'admission_number': student.admission_number,
                'class_name': student.school_class.name if student.school_class_id else student.student_class,
                'average': float(avg),
                'rank': rank,
                'teacher_limited': request.user.role == 'TEACHER',
            })

        return Response(results)

    @action(detail=False, methods=['get'])
    def subject_performance(self, request):
        """Analytics per subject"""
        sequence_id = request.query_params.get('sequence_id')

        if not sequence_id:
            return Response(
                {'error': 'sequence_id query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if request.user.role not in [*SCHOOL_ADMIN_ROLES, 'TEACHER']:
            raise PermissionDenied("Only school staff can view subject analytics.")

        try:
            sequence = Sequence.objects.get(id=sequence_id)
        except Sequence.DoesNotExist:
            return Response(
                {'error': 'Sequence not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        if sequence.school_id != request.user.school_id:
            raise PermissionDenied("You can only view subject analytics in your school.")

        from apps.grades.models import Subject
        subjects = Subject.objects.filter(school=request.user.school).prefetch_related('grades')

        analytics = []
        for subject in subjects:
            grades = subject.grades.filter(sequence=sequence)
            if grades.exists():
                avg = grades.aggregate(Avg('score'))['score__avg']
                analytics.append({
                    'subject_name': subject.name,
                    'subject_code': subject.code,
                    'average': float(avg) if avg else 0,
                    'student_count': grades.values('student').distinct().count(),
                })

        return Response(analytics)


class TermResultViewSet(viewsets.ModelViewSet):
    queryset = TermResult.objects.select_related('student', 'school')
    serializer_class = TermResultSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]

    def get_queryset(self):
        user = self.request.user
        queryset = filter_student_related_by_platform_access(
            TermResult.objects.select_related('student', 'school')
        )

        if user.role in SCHOOL_ADMIN_ROLES:
            queryset = queryset.filter(school=user.school)
        elif user.role == 'TEACHER':
            queryset = queryset.filter(school=user.school)
        elif user.role == 'STUDENT':
            queryset = queryset.filter(student__user=user)
            if not _truthy_query_param(self.request, 'include_history'):
                academic_year = _current_academic_year_for_school(user.school)
                if academic_year:
                    queryset = queryset.filter(academic_year=academic_year)
        elif user.role == 'PARENT':
            linked_students = students_api.list_student_ids_for_guardian(user)
            queryset = queryset.filter(student_id__in=linked_students)
            if not _truthy_query_param(self.request, 'include_history'):
                year_query = Q()
                for student in students_api.list_students().select_related('school__settings').filter(id__in=linked_students):
                    academic_year = _current_academic_year_for_school(student.school)
                    if academic_year:
                        year_query |= Q(student_id=student.id, academic_year=academic_year)
                queryset = queryset.filter(year_query) if year_query else queryset.none()
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can create term results.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can update term results.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can update term results.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can delete term results.")
        return super().destroy(request, *args, **kwargs)


class AnnualResultViewSet(viewsets.ModelViewSet):
    queryset = AnnualResult.objects.select_related('student', 'school')
    serializer_class = AnnualResultSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]

    def get_queryset(self):
        user = self.request.user
        queryset = filter_student_related_by_platform_access(
            AnnualResult.objects.select_related('student', 'school')
        )

        if user.role in SCHOOL_ADMIN_ROLES:
            queryset = queryset.filter(school=user.school)
        elif user.role == 'TEACHER':
            queryset = queryset.filter(school=user.school)
        elif user.role == 'STUDENT':
            queryset = queryset.filter(student__user=user)
            if not _truthy_query_param(self.request, 'include_history'):
                academic_year = _current_academic_year_for_school(user.school)
                if academic_year:
                    queryset = queryset.filter(academic_year=academic_year)
        elif user.role == 'PARENT':
            linked_students = students_api.list_student_ids_for_guardian(user)
            queryset = queryset.filter(student_id__in=linked_students)
            if not _truthy_query_param(self.request, 'include_history'):
                year_query = Q()
                for student in students_api.list_students().select_related('school__settings').filter(id__in=linked_students):
                    academic_year = _current_academic_year_for_school(student.school)
                    if academic_year:
                        year_query |= Q(student_id=student.id, academic_year=academic_year)
                queryset = queryset.filter(year_query) if year_query else queryset.none()
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can create annual results.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can update annual results.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can update annual results.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.role not in SCHOOL_ADMIN_ROLES:
            raise PermissionDenied("Only school administrators can delete annual results.")
        return super().destroy(request, *args, **kwargs)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
@transaction.atomic
def publish_report_cards_api(request):
    """Stable POST endpoint for publishing report cards outside DRF router matching."""
    view = GradeViewSet()
    return view._publish_report_cards_response(request)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def publish_all_report_cards_api(request):
    """Stable POST endpoint for publishing every class's report cards at once."""
    view = GradeViewSet()
    return view._publish_all_report_cards_response(request)

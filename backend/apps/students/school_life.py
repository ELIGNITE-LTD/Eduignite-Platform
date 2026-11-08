"""Basic Education "school life": pupil health records and certificates.

Access rules (health data is sensitive):
- School administrators (SCHOOL_ADMIN) read and write for every pupil of their school;
  a SUB_ADMIN (vice principal) only for the sub-school(s) they manage.
- A class teacher (``basic_class_ids_for_teacher``) reads and writes for the pupils of
  their own class(es) only.
- A parent reads (never writes) the records of the pupils linked to them.
- Every other role gets 403, and nothing is available outside a school whose
  ``education_category`` is ``basic``. Isolation is enforced here, in the queryset,
  not in the UI. Pupils may have no login: names come from ``display_name``.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import (
    ParentStudentLink,
    Student,
    StudentCertificate,
    StudentGuardian,
    StudentHealthEntry,
    StudentHealthProfile,
)

ADMIN_ROLES = ('SCHOOL_ADMIN', 'SUB_ADMIN')
ALLOWED_ROLES = (*ADMIN_ROLES, 'TEACHER', 'PARENT')


class SchoolLifePermission(permissions.BasePermission):
    """Only school admins, class teachers and parents may reach these endpoints."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'role', None) in ALLOWED_ROLES)


def can_write(user):
    return user.role in (*ADMIN_ROLES, 'TEACHER')


def scoped_students(user):
    """Pupils of basic schools this user may see health records / certificates for."""
    base = Student.objects.select_related('user', 'school', 'school_class').filter(
        school__education_category='basic',
    ).filter(Q(user__isnull=True) | Q(user__is_drafted=False), school__is_drafted=False)

    if user.role in ADMIN_ROLES:
        if not user.school_id:
            return base.none()
        queryset = base.filter(school_id=user.school_id)
        from apps.schools.scoping import managed_sub_school_ids

        sub_ids = managed_sub_school_ids(user)
        if sub_ids is not None:
            queryset = queryset.filter(school_class__sub_school_id__in=sub_ids)
        return queryset
    if user.role == 'TEACHER':
        from apps.schools.class_teaching import basic_class_ids_for_teacher

        class_ids = basic_class_ids_for_teacher(user)
        if not class_ids:
            return base.none()
        return base.filter(school_id=user.school_id, school_class_id__in=class_ids)
    if user.role == 'PARENT':
        from apps.platform.access import filter_students_by_platform_access

        linked = ParentStudentLink.objects.filter(parent=user).values_list('student_id', flat=True)
        guardian_linked = StudentGuardian.objects.filter(guardian__user=user).values_list('student_id', flat=True)
        return filter_students_by_platform_access(
            base.filter(Q(id__in=linked) | Q(id__in=guardian_linked))
        ).distinct()
    return base.none()


def _student_or_404(request, student_id):
    try:
        student = scoped_students(request.user).filter(id=student_id).first()
    except (ValueError, TypeError, DjangoValidationError):  # missing / malformed uuid
        student = None
    if student is None:
        raise NotFound('Pupil not found.')
    return student


def _writable_student(request, student_id):
    if not can_write(request.user):
        raise PermissionDenied('Only school staff can change these records.')
    return _student_or_404(request, student_id)


def _pupil_fields(student):
    return {
        'student': str(student.id),
        'student_name': student.display_name,
        'student_matricule': student.display_matricule,
        'school_class': str(student.school_class_id) if student.school_class_id else None,
        'class_name': student.school_class.name if student.school_class_id else student.student_class,
    }


# --------------------------------------------------------------------------- health

HEALTH_FIELDS = [
    'blood_group', 'allergies', 'conditions', 'emergency_contact_name',
    'emergency_contact_phone', 'doctor_name', 'doctor_phone', 'notes',
]


class HealthProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentHealthProfile
        fields = HEALTH_FIELDS


def _profile_row(student, profile):
    row = _pupil_fields(student)
    row['has_record'] = profile is not None
    for field in HEALTH_FIELDS:
        row[field] = getattr(profile, field, '') if profile else ''
    row['updated_at'] = profile.modified if profile else None
    return row


class HealthProfileViewSet(viewsets.ViewSet):
    """Health sheet per pupil. ``list`` gives one row per accessible pupil
    (filter ``?school_class=<id>``); ``retrieve``/``update`` use the pupil id."""

    permission_classes = [permissions.IsAuthenticated, SchoolLifePermission]

    def list(self, request):
        students = scoped_students(request.user)
        class_id = request.query_params.get('school_class')
        if class_id:
            students = students.filter(school_class_id=class_id)
        students = list(students.order_by('student_class', 'name', 'user__name')[:1000])
        profiles = {
            p.student_id: p
            for p in StudentHealthProfile.objects.filter(student_id__in=[s.id for s in students])
        }
        return Response([_profile_row(s, profiles.get(s.id)) for s in students])

    def retrieve(self, request, pk=None):
        student = _student_or_404(request, pk)
        profile = StudentHealthProfile.objects.filter(student=student).first()
        return Response(_profile_row(student, profile))

    def update(self, request, pk=None, partial=False):
        student = _writable_student(request, pk)
        profile = StudentHealthProfile.objects.filter(student=student).first()
        serializer = HealthProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(student=student, school=student.school, updated_by=request.user)
        profile = StudentHealthProfile.objects.get(student=student)
        return Response(_profile_row(student, profile))

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk, partial=True)


class HealthEntrySerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StudentHealthEntry
        fields = ['id', 'student', 'student_name', 'entry_date', 'kind', 'note', 'recorded_by_name', 'created']
        read_only_fields = ['id', 'student', 'student_name', 'recorded_by_name', 'created']

    def get_student_name(self, obj):
        return obj.student.display_name

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() if obj.recorded_by_id else ''


class HealthEntryViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet,
):
    serializer_class = HealthEntrySerializer
    permission_classes = [permissions.IsAuthenticated, SchoolLifePermission]
    pagination_class = None

    def get_queryset(self):
        queryset = StudentHealthEntry.objects.select_related('student', 'student__user', 'recorded_by').filter(
            student__in=scoped_students(self.request.user).values('id'),
        )
        student_id = self.request.query_params.get('student')
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        return queryset

    def create(self, request, *args, **kwargs):
        student = _writable_student(request, request.data.get('student'))
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save(student=student, school=student.school, recorded_by=request.user)
        return Response(self.get_serializer(entry).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        if not can_write(self.request.user):
            raise PermissionDenied('Only school staff can change these records.')
        instance.delete()


# ------------------------------------------------------------------------ certificates

class CertificateSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_matricule = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()
    issued_by_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = StudentCertificate
        fields = [
            'id', 'student', 'student_name', 'student_matricule', 'class_name', 'number', 'kind',
            'kind_label', 'issued_on', 'academic_year', 'remark', 'issued_by_name', 'created',
        ]
        read_only_fields = ['id', 'student', 'student_name', 'student_matricule', 'class_name',
                            'number', 'issued_by_name', 'created']
        extra_kwargs = {'issued_on': {'required': False}}

    def get_student_name(self, obj):
        return obj.student.display_name

    def get_student_matricule(self, obj):
        return obj.student.display_matricule

    def get_class_name(self, obj):
        s = obj.student
        return s.school_class.name if s.school_class_id else s.student_class

    def get_issued_by_name(self, obj):
        return obj.issued_by.get_full_name() if obj.issued_by_id else ''


def _next_certificate_number(school, year):
    prefix = f'CERT-{year}-'
    last = (
        StudentCertificate.objects.filter(school=school, number__startswith=prefix)
        .order_by('-number').values_list('number', flat=True).first()
    )
    seq = int(last.rsplit('-', 1)[1]) + 1 if last else 1
    return f'{prefix}{seq:05d}'


class CertificateViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.DestroyModelMixin, viewsets.GenericViewSet,
):
    serializer_class = CertificateSerializer
    permission_classes = [permissions.IsAuthenticated, SchoolLifePermission]
    pagination_class = None

    def get_queryset(self):
        queryset = StudentCertificate.objects.select_related(
            'student', 'student__user', 'student__school_class', 'issued_by',
        ).filter(student__in=scoped_students(self.request.user).values('id'))
        params = self.request.query_params
        if params.get('student'):
            queryset = queryset.filter(student_id=params['student'])
        if params.get('school_class'):
            queryset = queryset.filter(student__school_class_id=params['school_class'])
        return queryset

    def create(self, request, *args, **kwargs):
        student = _writable_student(request, request.data.get('student'))
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        issued_on = serializer.validated_data.get('issued_on') or timezone.localdate()
        for _ in range(5):
            try:
                with transaction.atomic():
                    certificate = serializer.save(
                        student=student, school=student.school, issued_by=request.user,
                        issued_on=issued_on,
                        number=_next_certificate_number(student.school, issued_on.year),
                    )
                break
            except IntegrityError:
                continue
        else:
            raise ValidationError({'detail': 'Could not allocate a certificate number, please retry.'})
        return Response(self.get_serializer(certificate).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        if not can_write(self.request.user):
            raise PermissionDenied('Only school staff can delete certificates.')
        instance.delete()

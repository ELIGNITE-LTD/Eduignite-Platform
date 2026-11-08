"""Conduct log (Basic Education): late / warning / praise / note per pupil.

A class teacher records entries for the pupils of their class(es); school admins
see and record for the whole school. Pupils need no login. The term's totals feed
the report card's conduct line (see ``conduct_summary_line``).
"""
from collections import Counter

from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.registry.permissions import RequiresApp
from apps.students import api as students_api

from .models import ConductEntry

ADMIN_ROLES = ('SCHOOL_ADMIN', 'SUB_ADMIN')
KINDS = [k for k, _ in ConductEntry.KIND_CHOICES]

_WORDS = {
    'en': {'late': ('late arrival', 'late arrivals'), 'warning': ('warning', 'warnings'), 'praise': ('praise', 'praises')},
    'fr': {'late': ('retard', 'retards'), 'warning': ('avertissement', 'avertissements'),
           'praise': ('félicitation', 'félicitations')},
}


def conduct_summary_line(student, start=None, end=None, lang='en'):
    """One line such as "2 late arrivals, 1 warning, 3 praises"; '' when nothing is logged."""
    entries = ConductEntry.objects.filter(student=student)
    if start:
        entries = entries.filter(date__gte=start)
    if end:
        entries = entries.filter(date__lte=end)
    counts = Counter(entries.values_list('kind', flat=True))
    words = _WORDS['fr' if str(lang).lower().startswith('fr') else 'en']
    parts = []
    for kind in ('late', 'warning', 'praise'):
        n = counts.get(kind, 0)
        if n:
            parts.append(f'{n} {words[kind][0 if n == 1 else 1]}')
    return ', '.join(parts)


def _is_basic(school):
    return getattr(school, 'education_category', None) == 'basic'


def _teacher_class_ids(user):
    from apps.schools.class_teaching import basic_class_ids_for_teacher

    return basic_class_ids_for_teacher(user)


def _can_access_student(user, student):
    if student.school_id != user.school_id:
        return False
    if user.role in ADMIN_ROLES:
        return True
    return user.role == 'TEACHER' and student.school_class_id in _teacher_class_ids(user)


class ConductEntrySerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = ConductEntry
        fields = ['id', 'student', 'student_name', 'school_class', 'kind', 'note', 'date',
                  'recorded_by', 'recorded_by_name', 'is_mine', 'created']
        read_only_fields = ['id', 'school_class', 'recorded_by', 'created']
        extra_kwargs = {'student': {'read_only': True}, 'date': {'required': False}}

    def get_student_name(self, obj):
        return obj.student.display_name

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() if obj.recorded_by_id else ''

    def get_is_mine(self, obj):
        request = self.context.get('request')
        return bool(request and obj.recorded_by_id == request.user.id)

    def validate_note(self, value):
        return (value or '').strip()[:200]

    def validate(self, attrs):
        if attrs.get('kind') == 'note' and not attrs.get('note'):
            raise serializers.ValidationError({'note': 'Write the note.'})
        return attrs


class ConductEntryViewSet(viewsets.ModelViewSet):
    serializer_class = ConductEntrySerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]
    pagination_class = None
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        if not user.school_id or not _is_basic(user.school) or user.role not in (*ADMIN_ROLES, 'TEACHER'):
            return ConductEntry.objects.none()
        queryset = ConductEntry.objects.filter(school=user.school).select_related('student', 'recorded_by')
        if user.role == 'TEACHER':
            queryset = queryset.filter(student__school_class_id__in=_teacher_class_ids(user))
        params = self.request.query_params
        for key, lookup in (('student', 'student_id'), ('class_id', 'student__school_class_id'), ('kind', 'kind'),
                            ('date_from', 'date__gte'), ('date_to', 'date__lte')):
            if params.get(key):
                queryset = queryset.filter(**{lookup: params[key]})
        return queryset

    def _student_or_error(self, student_id):
        user = self.request.user
        if not user.school_id or not _is_basic(user.school) or user.role not in (*ADMIN_ROLES, 'TEACHER'):
            raise PermissionDenied('Conduct is only available to staff of Basic Education schools.')
        try:
            student = students_api.get_student(student_id)
        except Exception:  # noqa: BLE001 - malformed id
            student = None
        if student is None or not _can_access_student(user, student):
            raise ValidationError({'student': 'This pupil is not in one of your classes.'})
        return student

    def create(self, request, *args, **kwargs):
        student = self._student_or_error(request.data.get('student'))
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            school=student.school, student=student, school_class=student.school_class,
            recorded_by=request.user,
            date=serializer.validated_data.get('date') or timezone.localdate(),
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        user = self.request.user
        if user.role not in ADMIN_ROLES and instance.recorded_by_id != user.id:
            raise PermissionDenied('You can only delete entries you recorded yourself.')
        instance.delete()

    @action(detail=False, methods=['post'], url_path='late-today')
    def late_today(self, request):
        """One tap: mark a pupil late today (no duplicate for the same day)."""
        student = self._student_or_error(request.data.get('student'))
        today = timezone.localdate()
        existing = ConductEntry.objects.filter(student=student, kind='late', date=today).first()
        if existing:
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)
        entry = ConductEntry.objects.create(
            school=student.school, student=student, school_class=student.school_class,
            kind='late', date=today, recorded_by=request.user,
        )
        return Response(self.get_serializer(entry).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def counts(self, request):
        """``?class_id`` -> {student_id: {late, warning, praise, note}} for the pupils the user may see."""
        result = {}
        for student_id, kind in self.get_queryset().values_list('student_id', 'kind'):
            row = result.setdefault(str(student_id), {k: 0 for k in KINDS})
            row[kind] += 1
        return Response(result)

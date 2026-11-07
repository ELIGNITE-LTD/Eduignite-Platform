"""Nursery developmental-area assessment (Basic Education).

School admins manage the areas; the class teachers of a basic school (and school
admins) rate their pupils per term on the school's configured scale
(``assessment_config['nursery_scale']``, 2-6 levels, lowest first). A null level
means "not assessed". There are no marks, averages or ranks here.
"""
from django.db import transaction
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.registry.permissions import RequiresApp
from apps.students import api as students_api

from .assessment_config import get_assessment_config
from .models import AssessmentArea, AssessmentRating

ADMIN_ROLES = ('SCHOOL_ADMIN', 'SUB_ADMIN')


def _require_basic(school):
    if getattr(school, 'education_category', None) != 'basic':
        raise ValidationError({'detail': 'Developmental areas are only available to Basic Education schools.'})


class AssessmentAreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentArea
        fields = ['id', 'name', 'name_fr', 'order_index', 'active']
        read_only_fields = ['id']

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Name is required.')
        school = self.context['request'].user.school
        clash = AssessmentArea.objects.filter(school=school, name__iexact=value)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('An area with this name already exists.')
        return value


class AssessmentAreaViewSet(viewsets.ModelViewSet):
    """Developmental areas of the user's school. Admins manage; school staff read."""

    serializer_class = AssessmentAreaSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        if not user.school_id or user.role not in (*ADMIN_ROLES, 'TEACHER'):
            return AssessmentArea.objects.none()
        queryset = AssessmentArea.objects.filter(school=user.school)
        if user.role == 'TEACHER' or self.request.query_params.get('active') == 'true':
            queryset = queryset.filter(active=True)
        return queryset

    def _require_admin(self):
        if self.request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only school administrators can manage developmental areas.')
        _require_basic(self.request.user.school)

    def perform_create(self, serializer):
        self._require_admin()
        serializer.save(school=self.request.user.school)

    def perform_update(self, serializer):
        self._require_admin()
        serializer.save()

    def perform_destroy(self, instance):
        self._require_admin()
        instance.delete()


class AssessmentRatingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentRating
        fields = ['id', 'student', 'area', 'academic_year', 'term', 'level']
        read_only_fields = fields


class AssessmentRatingViewSet(viewsets.ReadOnlyModelViewSet):
    """Ratings of a school's pupils; written through ``bulk``."""

    serializer_class = AssessmentRatingSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]
    pagination_class = None

    def _teacher_class_ids(self):
        from apps.schools.class_teaching import basic_class_ids_for_teacher

        return basic_class_ids_for_teacher(self.request.user)

    def get_queryset(self):
        user = self.request.user
        if not user.school_id or user.role not in (*ADMIN_ROLES, 'TEACHER'):
            return AssessmentRating.objects.none()
        queryset = AssessmentRating.objects.filter(school=user.school)
        if user.role == 'TEACHER':
            queryset = queryset.filter(student__school_class_id__in=self._teacher_class_ids())
        params = self.request.query_params
        for field, lookup in (
            ('student_id', 'student_id'), ('class_id', 'student__school_class_id'),
            ('academic_year', 'academic_year'), ('term', 'term'),
        ):
            if params.get(field):
                queryset = queryset.filter(**{lookup: params[field]})
        return queryset

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        """Upsert ratings: {academic_year, term, ratings: [{student, area, level|null}]}."""
        user = request.user
        if user.role not in (*ADMIN_ROLES, 'TEACHER') or not user.school_id:
            raise PermissionDenied('Only school staff can rate learners.')
        school = user.school
        _require_basic(school)

        academic_year = str(request.data.get('academic_year') or '').strip()
        try:
            term = int(request.data.get('term'))
        except (TypeError, ValueError):
            term = None
        if not academic_year or term not in (1, 2, 3):
            raise ValidationError({'detail': 'Provide academic_year and a term of 1, 2 or 3.'})
        rows = request.data.get('ratings')
        if not isinstance(rows, list) or not rows:
            raise ValidationError({'ratings': 'Provide at least one rating.'})

        scale_size = len(get_assessment_config(school).nursery_scale)
        areas = {str(a.id): a for a in AssessmentArea.objects.filter(school=school, active=True)}
        teacher_classes = self._teacher_class_ids() if user.role == 'TEACHER' else None
        students = {str(s.id): s for s in students_api.list_students(school=school).select_related('school_class')}

        cleaned = []
        for index, row in enumerate(rows, start=1):
            if not isinstance(row, dict):
                raise ValidationError({'ratings': f'Row {index}: must be an object.'})
            student = students.get(str(row.get('student')))
            area = areas.get(str(row.get('area')))
            if student is None:
                raise ValidationError({'ratings': f'Row {index}: pupil not found in your school.'})
            if area is None:
                raise ValidationError({'ratings': f'Row {index}: area not found or inactive.'})
            if teacher_classes is not None and student.school_class_id not in teacher_classes:
                raise PermissionDenied('You can only rate pupils of the classes you teach.')
            level = row.get('level')
            if level is not None:
                if isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= scale_size:
                    raise ValidationError({'ratings': f'Row {index}: level must be 1 to {scale_size} or null.'})
            cleaned.append((student, area, level))

        with transaction.atomic():
            saved = [
                AssessmentRating.objects.update_or_create(
                    student=student, area=area, academic_year=academic_year, term=term,
                    defaults={'school': school, 'level': level, 'rated_by': user},
                )[0]
                for student, area, level in cleaned
            ]
        return Response(AssessmentRatingSerializer(saved, many=True).data, status=status.HTTP_200_OK)

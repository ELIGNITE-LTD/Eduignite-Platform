from django.contrib.auth import get_user_model
from rest_framework import serializers

from . import api, grading_presets
from .models import (
    AcademicPeriod,
    AcademicYear,
    CourseOffering,
    CourseUnit,
    CurriculumEntry,
    DepartmentHead,
    GradingPolicy,
    OrganizationalUnit,
    Programme,
    ProgrammeYear,
)


User = get_user_model()


def _school(serializer):
    return serializer.context['request'].user.school


def _same_school(serializer, instance, field):
    if instance is not None and instance.school_id != _school(serializer).id:
        raise serializers.ValidationError('Not found.')
    return instance


class _Base(serializers.ModelSerializer):
    """Model rules (clean) are enforced on save and surfaced as 400s by the viewset."""


class OrganizationalUnitSerializer(_Base):
    parent_name = serializers.CharField(source='parent.name', read_only=True, default=None)

    class Meta:
        model = OrganizationalUnit
        fields = ['id', 'unit_type', 'name', 'code', 'parent', 'parent_name', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_parent(self, value):
        return _same_school(self, value, 'parent')


class ProgrammeYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProgrammeYear
        fields = ['id', 'programme', 'number', 'label']
        read_only_fields = ['id']

    def validate_programme(self, value):
        return _same_school(self, value, 'programme')


class ProgrammeSerializer(_Base):
    department_name = serializers.CharField(source='department.name', read_only=True)
    years = ProgrammeYearSerializer(many=True, read_only=True)

    class Meta:
        model = Programme
        fields = [
            'id', 'name', 'code', 'award_level', 'duration_years', 'required_credits',
            'department', 'department_name', 'is_active', 'years', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate_department(self, value):
        return _same_school(self, value, 'department')


class AcademicYearSerializer(_Base):
    class Meta:
        model = AcademicYear
        fields = ['id', 'label', 'start_date', 'end_date', 'is_current', 'created_at']
        read_only_fields = ['id', 'created_at']


class AcademicPeriodSerializer(_Base):
    class Meta:
        model = AcademicPeriod
        fields = ['id', 'academic_year', 'period_type', 'name', 'order', 'start_date', 'end_date']
        read_only_fields = ['id']

    def validate_academic_year(self, value):
        return _same_school(self, value, 'academic_year')


class GradingPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = GradingPolicy
        fields = ['id', 'preset_key', 'thresholds', 'updated_at']
        read_only_fields = ['id', 'updated_at']

    def validate(self, attrs):
        key = attrs.get('preset_key') or getattr(self.instance, 'preset_key', None)
        if key not in grading_presets.PRESETS:
            raise serializers.ValidationError({'preset_key': 'Choose one of: ' + ', '.join(grading_presets.preset_keys())})
        thresholds = attrs.get('thresholds') or grading_presets.get_preset(key)
        problems = grading_presets.validate_thresholds(key, thresholds)
        if problems:
            raise serializers.ValidationError({'thresholds': problems})
        attrs['thresholds'] = thresholds
        return attrs


class CourseUnitSerializer(_Base):
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = CourseUnit
        fields = ['id', 'code', 'title', 'description', 'credits', 'department', 'department_name',
                  'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_department(self, value):
        return _same_school(self, value, 'department')

    def validate_credits(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Credits must be greater than zero.')
        return value


class CurriculumEntrySerializer(_Base):
    course_code = serializers.CharField(source='course_unit.code', read_only=True)
    course_title = serializers.CharField(source='course_unit.title', read_only=True)
    programme_year_label = serializers.CharField(source='programme_year.label', read_only=True)
    credits = serializers.IntegerField(source='effective_credits', read_only=True)
    credit_warning = serializers.SerializerMethodField()

    class Meta:
        model = CurriculumEntry
        fields = [
            'id', 'programme', 'programme_year', 'programme_year_label', 'period_type', 'period_number',
            'course_unit', 'course_code', 'course_title', 'credits_override', 'credits', 'category',
            'credit_warning', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate_programme(self, value):
        return _same_school(self, value, 'programme')

    def validate_course_unit(self, value):
        return _same_school(self, value, 'course_unit')

    def validate_programme_year(self, value):
        if value is not None and value.programme.school_id != _school(self).id:
            raise serializers.ValidationError('Not found.')
        return value

    def validate_credits_override(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError('Credits must be greater than zero.')
        return value

    def get_credit_warning(self, obj):
        """Warning (not an error) when this semester's total is off the programme's target."""
        cache = self.context.setdefault('_credit_warnings', {})
        if obj.programme_id not in cache:
            cache[obj.programme_id] = {
                (row['year_number'], row['period_type'], row['period_number']): row['warning']
                for row in api.semester_credit_summary(obj.programme)
            }
        return cache[obj.programme_id].get((obj.programme_year.number, obj.period_type, obj.period_number))


class CourseOfferingSerializer(_Base):
    course_code = serializers.CharField(source='course_unit.code', read_only=True)
    course_title = serializers.CharField(source='course_unit.title', read_only=True)
    period_name = serializers.CharField(source='academic_period.name', read_only=True)
    lecturers = serializers.PrimaryKeyRelatedField(many=True, required=False, queryset=User.objects.all())
    lecturer_names = serializers.SerializerMethodField()

    class Meta:
        model = CourseOffering
        fields = ['id', 'course_unit', 'course_code', 'course_title', 'academic_period', 'period_name',
                  'lecturers', 'lecturer_names', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_course_unit(self, value):
        return _same_school(self, value, 'course_unit')

    def validate_academic_period(self, value):
        return _same_school(self, value, 'academic_period')

    def validate_lecturers(self, value):
        school = _school(self)
        for user in value:
            if user.role != api.LECTURER_ROLE or user.school_id != school.id:
                raise serializers.ValidationError('Only lecturers of this institution can be assigned.')
        return value

    def get_lecturer_names(self, obj):
        return [user.name for user in obj.lecturers.all()]


class DepartmentHeadSerializer(_Base):
    unit_name = serializers.CharField(source='unit.name', read_only=True)
    user_name = serializers.CharField(source='user.name', read_only=True)

    class Meta:
        model = DepartmentHead
        fields = ['id', 'unit', 'unit_name', 'user', 'user_name', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_unit(self, value):
        return _same_school(self, value, 'unit')

    def validate_user(self, value):
        if value.role != api.LECTURER_ROLE or value.school_id != _school(self).id:
            raise serializers.ValidationError('The head must be a lecturer of this institution.')
        return value


class LecturerSerializer(serializers.ModelSerializer):
    """Read shape for a lecturer. Contact details are shown to the administrator only."""

    headed_units = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'matricule', 'name', 'job_title', 'email', 'phone', 'is_active', 'headed_units']
        read_only_fields = fields

    def get_headed_units(self, obj):
        return [str(head.unit_id) for head in obj.he_headed_units.all()]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if getattr(self.context['request'].user, 'role', None) != 'SCHOOL_ADMIN':
            data.pop('email', None)
            data.pop('phone', None)
        return data

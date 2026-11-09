from rest_framework import serializers

from . import grading_presets
from .models import (
    AcademicPeriod,
    AcademicYear,
    GradingPolicy,
    OrganizationalUnit,
    Programme,
    ProgrammeYear,
)


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

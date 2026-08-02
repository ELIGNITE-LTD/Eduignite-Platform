from rest_framework import serializers

from apps.schools.models import SchoolClass
from apps.schools.relations import resolve_school_class

from .models import LiveClass, LiveClassEnrollment


class LiveClassSerializer(serializers.ModelSerializer):
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.none(), required=False, allow_null=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    teacher_avatar = serializers.URLField(source='teacher.avatar', read_only=True, allow_null=True)
    subject_display = serializers.SerializerMethodField()
    participants = serializers.SerializerMethodField()
    end_time = serializers.DateTimeField(read_only=True)
    is_live_now = serializers.BooleanField(read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = LiveClass
        fields = [
            'id', 'title', 'description', 'subject', 'subject_name',
            'subject_display', 'teacher', 'teacher_name', 'teacher_avatar',
            'school_class', 'school_class_name', 'target_class', 'meeting_url', 'meeting_id', 'meeting_password',
            'platform', 'start_time', 'end_time', 'duration_minutes', 'status',
            'is_live_now', 'max_participants', 'enrolled_count',
            'is_recorded', 'recording_url', 'participants', 'created', 'modified',
        ]
        read_only_fields = ['id', 'enrolled_count', 'created', 'modified', 'status']

    def get_subject_display(self, obj):
        return obj.subject_display

    def get_participants(self, obj):
        enrollments = obj.enrollments.select_related('student').all()
        return LiveClassEnrollmentSerializer(enrollments, many=True).data

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        if school:
            self.fields['school_class'].queryset = SchoolClass.objects.filter(school=school).order_by('name')

    def validate_start_time(self, value):
        from django.utils import timezone
        # Allow only future sessions (with 5 min grace)
        if value < timezone.now() - timezone.timedelta(minutes=5):
            raise serializers.ValidationError("Start time must be in the future.")
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        school_class = resolve_school_class(
            school,
            school_class=attrs.get('school_class') or getattr(self.instance, 'school_class', None),
            class_name=attrs.get('target_class') or getattr(self.instance, 'target_class', None),
        )
        if school_class:
            attrs['school_class'] = school_class
            attrs['target_class'] = school_class.name
        elif not (attrs.get('target_class') or getattr(self.instance, 'target_class', '')).strip():
            raise serializers.ValidationError({'target_class': 'Provide a target class or select a registered class.'})
        return attrs


class LiveClassCreateSerializer(serializers.ModelSerializer):
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.none(), required=False, allow_null=True)

    class Meta:
        model = LiveClass
        fields = [
            'title', 'description', 'subject', 'subject_name',
            'school_class', 'target_class', 'meeting_url', 'meeting_id', 'meeting_password',
            'platform', 'start_time', 'duration_minutes', 'max_participants',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        if school:
            self.fields['school_class'].queryset = SchoolClass.objects.filter(school=school).order_by('name')

    def validate_start_time(self, value):
        from django.utils import timezone
        if value < timezone.now() - timezone.timedelta(minutes=5):
            raise serializers.ValidationError("Start time must be in the future.")
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        school_class = resolve_school_class(
            school,
            school_class=attrs.get('school_class') or getattr(self.instance, 'school_class', None),
            class_name=attrs.get('target_class') or getattr(self.instance, 'target_class', None),
        )
        if school_class:
            attrs['school_class'] = school_class
            attrs['target_class'] = school_class.name
        elif not (attrs.get('target_class') or getattr(self.instance, 'target_class', '')).strip():
            raise serializers.ValidationError({'target_class': 'Provide a target class or select a registered class.'})
        return attrs

    def create(self, validated_data):
        request = self.context['request']
        validated_data['teacher'] = request.user
        validated_data['school'] = request.user.school
        return super().create(validated_data)


class LiveClassEnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    student_avatar = serializers.URLField(source='student.avatar', read_only=True, allow_null=True)

    class Meta:
        model = LiveClassEnrollment
        fields = [
            'id', 'live_class', 'student', 'student_name', 'student_avatar',
            'joined_at', 'left_at', 'duration_attended', 'created',
        ]
        read_only_fields = ['id', 'created']

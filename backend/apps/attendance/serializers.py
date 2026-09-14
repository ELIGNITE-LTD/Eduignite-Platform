from rest_framework import serializers

from apps.schools.models import SchoolClass
from apps.schools.relations import resolve_school_class

from .models import AttendanceSession, AttendanceRecord, TeacherAttendance


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    student_admission = serializers.CharField(source='student.admission_number', read_only=True)
    session_date = serializers.DateField(source='session.date', read_only=True)
    session_period = serializers.CharField(source='session.period', read_only=True)
    session_student_class = serializers.CharField(source='session.student_class', read_only=True)
    session_subject_name = serializers.CharField(source='session.subject.name', read_only=True)
    session_teacher_name = serializers.CharField(source='session.teacher.get_full_name', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            'id', 'session', 'student', 'student_name', 'student_admission',
            'session_date', 'session_period', 'session_student_class',
            'session_subject_name', 'session_teacher_name',
            'status', 'excuse_note', 'notified_parent', 'created', 'modified'
        ]
        read_only_fields = ['id', 'created', 'modified']


class AttendanceSessionSerializer(serializers.ModelSerializer):
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.none(), required=False, allow_null=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    records = AttendanceRecordSerializer(many=True, read_only=True)
    total_present = serializers.SerializerMethodField()
    total_absent = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceSession
        fields = [
            'id', 'school', 'teacher', 'teacher_name', 'subject', 'subject_name',
            'school_class', 'school_class_name', 'student_class', 'date', 'period', 'notes', 'records',
            'total_present', 'total_absent', 'created', 'modified'
        ]
        read_only_fields = ['id', 'created', 'modified']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        if school:
            self.fields['school_class'].queryset = SchoolClass.objects.filter(school=school).order_by('name')

    def validate(self, attrs):
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        school_class = resolve_school_class(
            school,
            school_class=attrs.get('school_class') or getattr(self.instance, 'school_class', None),
            class_name=attrs.get('student_class') or getattr(self.instance, 'student_class', None),
        )
        if school_class:
            attrs['school_class'] = school_class
            attrs['student_class'] = school_class.name
        elif not (attrs.get('student_class') or getattr(self.instance, 'student_class', '')).strip():
            raise serializers.ValidationError({'student_class': 'Provide a class name or select a registered class.'})
        return attrs

    def get_total_present(self, obj):
        # obj.records.all() reuses the prefetch cache set up by the viewset's
        # Prefetch('records', ...); .filter()/.count() would bypass it and
        # issue a fresh query per session instead.
        return sum(1 for record in obj.records.all() if record.status in ('present', 'late'))

    def get_total_absent(self, obj):
        return sum(1 for record in obj.records.all() if record.status == 'absent')


class BulkAttendanceSerializer(serializers.Serializer):
    session_data = AttendanceSessionSerializer()
    records = AttendanceRecordSerializer(many=True)

    def validate_records(self, value):
        if not value:
            raise serializers.ValidationError("At least one attendance record is required.")
        return value

    def create(self, validated_data):
        session_data = validated_data['session_data']
        records_data = validated_data['records']

        # Create session
        session = AttendanceSession.objects.create(**session_data)

        # Create records
        records = []
        for record_data in records_data:
            record = AttendanceRecord.objects.create(session=session, **record_data)
            records.append(record)

        return session, records


class AttendanceSummarySerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    student_name = serializers.CharField()
    student_admission = serializers.CharField()
    total_days = serializers.IntegerField()
    present_days = serializers.IntegerField()
    absent_days = serializers.IntegerField()
    late_days = serializers.IntegerField()
    excused_days = serializers.IntegerField()
    attendance_percentage = serializers.DecimalField(max_digits=5, decimal_places=2)


class ClassAttendanceReportSerializer(serializers.Serializer):
    date = serializers.DateField()
    period = serializers.CharField()
    student_name = serializers.CharField()
    admission_number = serializers.CharField()
    status = serializers.CharField()


class TeacherAttendanceSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    noted_by_name = serializers.CharField(source='noted_by.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = TeacherAttendance
        fields = [
            'id', 'school', 'teacher', 'teacher_name', 'date', 'status',
            'check_in_time', 'check_out_time', 'noted_by', 'noted_by_name',
            'created', 'modified'
        ]
        read_only_fields = ['id', 'created', 'modified']

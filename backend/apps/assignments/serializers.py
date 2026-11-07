from decimal import Decimal

import base64

from django.utils import timezone
from rest_framework import serializers

from apps.schools.models import SchoolClass
from apps.schools.relations import resolve_school_class
from .models import Assignment, AssignmentSubmission


class AssignmentSerializer(serializers.ModelSerializer):
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.none(), required=False, allow_null=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)

    class Meta:
        model = Assignment
        fields = [
            'id',
            'school',
            'subject',
            'subject_name',
            'subject_code',
            'teacher',
            'teacher_name',
            'school_class',
            'school_class_name',
            'title',
            'instructions',
            'attachment_name',
            'attachment_mime_type',
            'attachment_data',
            'target_class',
            'due_date',
            'max_marks',
            'submission_type',
            'status',
            'created',
            'modified',
        ]
        read_only_fields = ['id', 'created', 'modified', 'school']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        if school:
            self.fields['school_class'].queryset = SchoolClass.objects.filter(school=school).order_by('name')

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        school = getattr(user, 'school', None)
        subject = attrs.get('subject') or getattr(self.instance, 'subject', None)
        teacher = attrs.get('teacher') or getattr(self.instance, 'teacher', None)
        due_date = attrs.get('due_date') or getattr(self.instance, 'due_date', None)
        assignment_status = attrs.get('status') or getattr(self.instance, 'status', Assignment.Status.PUBLISHED)
        school_class = resolve_school_class(
            school,
            school_class=attrs.get('school_class') or getattr(self.instance, 'school_class', None),
            class_name=attrs.get('target_class') or getattr(self.instance, 'target_class', None),
        )

        if school and subject and subject.school_id != school.id:
            raise serializers.ValidationError({'subject': 'This subject does not belong to your school.'})

        if school and teacher and teacher.school_id != school.id:
            raise serializers.ValidationError({'teacher': 'Assigned teacher must belong to your school.'})

        if school_class:
            attrs['school_class'] = school_class
            attrs['target_class'] = school_class.name
        elif not (attrs.get('target_class') or getattr(self.instance, 'target_class', '')).strip():
            raise serializers.ValidationError({'target_class': 'Provide a target class or select a registered class.'})

        if assignment_status == Assignment.Status.PUBLISHED and due_date and due_date <= timezone.now():
            raise serializers.ValidationError({'due_date': 'The assignment deadline must be in the future.'})

        return attrs

    def validate_attachment_data(self, value):
        if not value:
            return value
        if not value.startswith('data:application/pdf;base64,'):
            raise serializers.ValidationError('Assignments accept PDF attachments only.')
        try:
            encoded = value.split(',', 1)[1]
            size_bytes = len(base64.b64decode(encoded, validate=True))
        except Exception as exc:
            raise serializers.ValidationError('The attached PDF is not a valid file.') from exc
        if size_bytes > 6 * 1024 * 1024:
            raise serializers.ValidationError('The attached PDF is larger than the 6MB limit.')
        return value


class AssignmentSubmissionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.display_name', read_only=True)
    student_admission = serializers.CharField(source='student.admission_number', read_only=True)
    assignment_title = serializers.CharField(source='assignment.title', read_only=True)
    assignment_max_marks = serializers.DecimalField(source='assignment.max_marks', max_digits=5, decimal_places=2, read_only=True)
    subject_name = serializers.CharField(source='assignment.subject.name', read_only=True)
    target_class = serializers.CharField(source='assignment.target_class', read_only=True)
    graded_by_name = serializers.CharField(source='graded_by.get_full_name', read_only=True)

    class Meta:
        model = AssignmentSubmission
        fields = [
            'id',
            'assignment',
            'assignment_title',
            'assignment_max_marks',
            'subject_name',
            'target_class',
            'student',
            'student_name',
            'student_admission',
            'content',
            'attachment_name',
            'attachment_data',
            'status',
            'score',
            'feedback',
            'graded_by',
            'graded_by_name',
            'graded_at',
            'created',
            'modified',
        ]
        read_only_fields = [
            'id',
            'student',
            'status',
            'graded_by',
            'graded_at',
            'created',
            'modified',
        ]

    def validate(self, attrs):
        assignment = attrs.get('assignment') or getattr(self.instance, 'assignment', None)
        content = attrs.get('content', getattr(self.instance, 'content', ''))
        attachment_data = attrs.get('attachment_data', getattr(self.instance, 'attachment_data', ''))

        if assignment:
            if assignment.submission_type == Assignment.SubmissionType.TEXT and not content:
                raise serializers.ValidationError({'content': 'A written response is required for this assignment.'})
            if assignment.submission_type == Assignment.SubmissionType.FILE and not attachment_data:
                raise serializers.ValidationError({'attachment_data': 'A file attachment is required for this assignment.'})
            if assignment.submission_type == Assignment.SubmissionType.BOTH and not content and not attachment_data:
                raise serializers.ValidationError('Submit written content or an attachment before sending.')

        return attrs


class AssignmentSubmissionGradeSerializer(serializers.Serializer):
    score = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal('0'),
        max_value=Decimal('100'),
    )
    feedback = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        submission = self.context['submission']
        if attrs['score'] > submission.assignment.max_marks:
            raise serializers.ValidationError({'score': 'The score cannot exceed the assignment maximum marks.'})
        return attrs

    def save(self, **kwargs):
        submission = self.context['submission']
        user = self.context['request'].user
        submission.score = self.validated_data['score']
        submission.feedback = self.validated_data.get('feedback', '')
        submission.status = AssignmentSubmission.Status.GRADED
        submission.graded_by = user
        submission.graded_at = timezone.now()
        submission.save(update_fields=['score', 'feedback', 'status', 'graded_by', 'graded_at', 'modified'])
        return submission

from rest_framework import serializers
from django.utils.translation import gettext_lazy as _
from .models import (
    AIExamDraft,
    AIExamQuestion,
    AIInsight,
    AIRequest,
    AcademicRoadmap,
    CareerOrientationReport,
    QuestionBank,
    SkillGapReport,
    StudentGuidanceReport,
)


class AIRequestSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    request_type_display = serializers.CharField(source='get_request_type_display', read_only=True)

    class Meta:
        model = AIRequest
        fields = [
            'id', 'user', 'user_name', 'school', 'request_type', 'request_type_display',
            'prompt', 'response', 'model_used', 'tokens_used', 'status', 'status_display',
            'error_message', 'processing_time_ms', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'response', 'tokens_used', 'status', 'error_message',
            'processing_time_ms', 'created_at', 'updated_at'
        ]


class AIRequestCreateSerializer(serializers.ModelSerializer):
    context_data = serializers.JSONField(required=False, allow_null=True)

    class Meta:
        model = AIRequest
        fields = ['request_type', 'prompt', 'context_data']

    def validate_prompt(self, value):
        if not value or len(value.strip()) < 10:
            raise serializers.ValidationError(
                _('Prompt must be at least 10 characters long.')
            )
        return value

    def create(self, validated_data):
        validated_data.pop('context_data', None)
        validated_data['status'] = 'pending'
        return super().create(validated_data)


def normalize_student_identifier(data):
    student_id = data.get('student_id') or data.get('student')
    if not student_id:
        raise serializers.ValidationError({'student_id': _('Student is required.')})
    data['student_id'] = student_id
    data.pop('student', None)
    return data


class StudyPlanRequestSerializer(serializers.Serializer):
    student_id = serializers.UUIDField(required=False)
    student = serializers.UUIDField(required=False, write_only=True)
    subjects = serializers.ListField(
        child=serializers.CharField(),
        required=True
    )
    weeks = serializers.IntegerField(min_value=1, max_value=52, default=4)

    def validate(self, data):
        return normalize_student_identifier(data)

    def validate_subjects(self, value):
        if not value or len(value) == 0:
            raise serializers.ValidationError(_('At least one subject is required.'))
        return value


class GradeAnalysisRequestSerializer(serializers.Serializer):
    student_id = serializers.UUIDField(required=False)
    student = serializers.UUIDField(required=False, write_only=True)
    sequence_id = serializers.UUIDField(required=False, allow_null=True)
    sequence = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    def validate(self, data):
        data = normalize_student_identifier(data)
        sequence_id = data.get('sequence_id') or data.get('sequence')
        if sequence_id:
            data['sequence_id'] = sequence_id
        data.pop('sequence', None)
        return data


class AttendanceInsightRequestSerializer(serializers.Serializer):
    student_id = serializers.UUIDField(required=False, allow_null=True)
    student = serializers.UUIDField(required=False, allow_null=True, write_only=True)
    class_name = serializers.CharField(required=False, allow_blank=True)
    days = serializers.IntegerField(min_value=1, max_value=365, default=30)

    def validate(self, data):
        student_id = data.get('student_id') or data.get('student')
        if student_id:
            data['student_id'] = student_id
            data.pop('student', None)
        if not data.get('student_id') and not data.get('class_name'):
            raise serializers.ValidationError(
                _('Either student_id or class_name must be provided.')
            )
        return data


class ExamPrepRequestSerializer(serializers.Serializer):
    student_id = serializers.UUIDField(required=False)
    student = serializers.UUIDField(required=False, write_only=True)
    subject_id = serializers.UUIDField(required=False)
    subject = serializers.UUIDField(required=False, write_only=True)
    exam_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, data):
        data = normalize_student_identifier(data)
        subject_id = data.get('subject_id') or data.get('subject')
        if not subject_id:
            raise serializers.ValidationError({'subject_id': _('Subject is required.')})
        data['subject_id'] = subject_id
        data.pop('subject', None)
        return data


class ParentReportRequestSerializer(serializers.Serializer):
    student_id = serializers.UUIDField(required=False)
    student = serializers.UUIDField(required=False, write_only=True)

    def validate(self, data):
        return normalize_student_identifier(data)


class AIInsightSerializer(serializers.ModelSerializer):
    insight_type_display = serializers.CharField(source='get_insight_type_display', read_only=True)
    is_expired = serializers.SerializerMethodField()
    target_roles = serializers.SerializerMethodField()

    class Meta:
        model = AIInsight
        fields = [
            'id', 'school', 'insight_type', 'insight_type_display', 'title',
            'description', 'data', 'target_role', 'target_roles', 'expires_at',
            'is_active', 'is_expired', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'is_expired', 'target_roles'
        ]

    def get_is_expired(self, obj):
        return obj.is_expired()

    def get_target_roles(self, obj):
        return obj.get_target_roles()


class RelatedUserSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(source='get_full_name', read_only=True)
    email = serializers.EmailField(read_only=True)
    role = serializers.CharField(read_only=True)


class RelatedSchoolSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    short_name = serializers.CharField(read_only=True)
    logo = serializers.CharField(read_only=True)
    primary_colour = serializers.SerializerMethodField()

    def get_primary_colour(self, obj):
        return getattr(obj, 'primary_colour', None) or '#1a3c6e'


class RelatedSubjectSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True)


class RelatedClassSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    sub_school_name = serializers.CharField(source='sub_school.name', read_only=True)


class AIExamQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIExamQuestion
        fields = [
            'id', 'draft', 'order', 'kind', 'text', 'options', 'correct_option',
            'expected_answer', 'marking_guide', 'marks', 'explanation', 'is_edited',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'draft', 'is_edited', 'created_at', 'updated_at']

    def validate(self, data):
        kind = data.get('kind', getattr(self.instance, 'kind', 'MCQ'))
        options = data.get('options', getattr(self.instance, 'options', []))
        correct_option = data.get('correct_option', getattr(self.instance, 'correct_option', 0))
        if kind == 'MCQ':
            if len(options or []) != 4:
                raise serializers.ValidationError({'options': _('MCQ questions must have exactly four options.')})
            if correct_option not in range(4):
                raise serializers.ValidationError({'correct_option': _('Correct option must be between 0 and 3.')})
        return data

    def update(self, instance, validated_data):
        validated_data['is_edited'] = True
        return super().update(instance, validated_data)


class AIExamDraftSerializer(serializers.ModelSerializer):
    school = RelatedSchoolSerializer(read_only=True)
    created_by = RelatedUserSerializer(read_only=True)
    reviewed_by = RelatedUserSerializer(read_only=True)
    subject = RelatedSubjectSerializer(read_only=True)
    school_class = RelatedClassSerializer(read_only=True)
    subject_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    school_class_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    questions = AIExamQuestionSerializer(many=True, read_only=True)
    question_count = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = AIExamDraft
        fields = [
            'id', 'school', 'created_by', 'exam', 'subject', 'subject_id',
            'school_class', 'school_class_id', 'assignment', 'title', 'topics', 'difficulty',
            'publish_target', 'exam_mode', 'question_type', 'num_mcq', 'num_structural',
            'start_time', 'assignment_due_date', 'duration_minutes', 'instructions', 'status', 'status_display',
            'generation_error', 'ai_request', 'reviewed_by', 'reviewed_at',
            'question_count', 'questions', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'school', 'created_by', 'exam', 'assignment', 'status', 'generation_error',
            'ai_request', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at',
        ]

    def validate(self, data):
        publish_target = data.get('publish_target', getattr(self.instance, 'publish_target', 'EXAM'))
        question_type = data.get('question_type', 'MCQ')
        exam_mode = data.get('exam_mode', 'ONLINE')
        num_mcq = data.get('num_mcq', 10)
        num_structural = data.get('num_structural', 0)
        start_time = data.get('start_time', getattr(self.instance, 'start_time', None))
        assignment_due_date = data.get('assignment_due_date', getattr(self.instance, 'assignment_due_date', None))
        duration_minutes = data.get('duration_minutes', getattr(self.instance, 'duration_minutes', 60))

        if publish_target == 'EXAM' and exam_mode == 'ONLINE' and question_type != 'MCQ':
            raise serializers.ValidationError({'question_type': _('Online exams can only be generated as MCQ drafts.')})
        if question_type == 'MCQ' and num_mcq < 1:
            raise serializers.ValidationError({'num_mcq': _('At least one MCQ question is required.')})
        if question_type == 'STRUCTURAL' and num_structural < 1:
            raise serializers.ValidationError({'num_structural': _('At least one structural question is required.')})
        if question_type == 'MIXED' and (num_mcq < 1 or num_structural < 1):
            raise serializers.ValidationError(_('Mixed exams require both MCQ and structural questions.'))
        if duration_minutes < 5:
            raise serializers.ValidationError({'duration_minutes': _('Duration must be at least five minutes.')})
        if start_time and assignment_due_date and assignment_due_date <= start_time:
            raise serializers.ValidationError({'assignment_due_date': _('The assignment deadline must be after the start time.')})
        return data

    def get_question_count(self, obj):
        return getattr(obj, 'question_count', None) or obj.questions.count()


class QuestionBankSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionBank
        fields = [
            'id', 'school', 'subject_name', 'class_level', 'topic', 'difficulty',
            'kind', 'text', 'options', 'correct_option', 'expected_answer',
            'marking_guide', 'marks', 'use_count', 'source_draft',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'school', 'use_count', 'source_draft', 'created_at', 'updated_at']


class CareerOrientationReportSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = CareerOrientationReport
        fields = [
            'id', 'student', 'student_name', 'user', 'user_name', 'desired_career',
            'education_level', 'country', 'favorite_subjects', 'strengths',
            'career_goals', 'preferred_university_country', 'preferred_study_style',
            'budget_level', 'response_language', 'report_data', 'status',
            'error_message', 'ai_request', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'report_data', 'status', 'error_message', 'ai_request', 'created_at', 'updated_at']


class AcademicRoadmapSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)

    class Meta:
        model = AcademicRoadmap
        fields = [
            'id', 'student', 'student_name', 'academic_year', 'target_grade',
            'target_career', 'roadmap_data', 'status', 'error_message',
            'ai_request', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'roadmap_data', 'status', 'error_message', 'ai_request', 'created_at', 'updated_at']


class SkillGapReportSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    sequence_name = serializers.CharField(source='sequence.name', read_only=True)

    class Meta:
        model = SkillGapReport
        fields = [
            'id', 'student', 'student_name', 'sequence', 'sequence_name',
            'analysis_data', 'status', 'error_message', 'ai_request',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'analysis_data', 'status', 'error_message', 'ai_request', 'created_at', 'updated_at']


class StudentGuidanceReportSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    generated_by_name = serializers.CharField(source='generated_by.get_full_name', read_only=True)
    audience_display = serializers.CharField(source='get_audience_display', read_only=True)

    class Meta:
        model = StudentGuidanceReport
        fields = [
            'id', 'student', 'student_name', 'generated_by', 'generated_by_name',
            'audience', 'audience_display', 'academic_year', 'term', 'report_data',
            'status', 'error_message', 'ai_request', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'generated_by', 'report_data', 'status', 'error_message',
            'ai_request', 'created_at', 'updated_at',
        ]

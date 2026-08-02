from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.schools.models import SchoolClass
from apps.schools.relations import resolve_school_class
from apps.students import api as students_api

from .models import Exam, ExamQuestion, ExamSubmission


class ExamQuestionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamQuestion
        fields = ['id', 'order', 'text', 'image_url', 'options', 'correct_option', 'marks', 'explanation']
        read_only_fields = ['id']


class ExamQuestionTakeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamQuestion
        fields = ['id', 'order', 'text', 'image_url', 'options', 'marks']


class ExamSerializer(serializers.ModelSerializer):
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.none(), required=False, allow_null=True)
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    sequence_name = serializers.CharField(source='sequence.name', read_only=True)
    questions = serializers.SerializerMethodField()
    total_questions = serializers.SerializerMethodField()
    end_time = serializers.DateTimeField(read_only=True)
    is_live_now = serializers.BooleanField(read_only=True)

    class Meta:
        model = Exam
        fields = [
            'id', 'school', 'subject', 'subject_name', 'sequence', 'sequence_name', 'teacher', 'teacher_name',
            'school_class', 'school_class_name',
            'title', 'exam_type', 'mode', 'target_class', 'instructions', 'venue', 'start_time',
            'duration_minutes', 'end_time', 'status', 'pass_mark', 'allow_review', 'is_live_now',
            'total_questions', 'questions', 'created', 'modified',
        ]
        read_only_fields = ['id', 'school', 'created', 'modified', 'end_time', 'is_live_now', 'total_questions']

    def get_questions(self, obj):
        request = self.context.get('request')
        if request and request.user.role == 'STUDENT':
            return ExamQuestionTakeSerializer(obj.questions.all(), many=True).data
        return ExamQuestionWriteSerializer(obj.questions.all(), many=True).data

    def get_total_questions(self, obj):
        return obj.questions.count()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        if school:
            self.fields['school_class'].queryset = SchoolClass.objects.filter(school=school).order_by('name')

    def validate(self, attrs):
        mode = attrs.get('mode', getattr(self.instance, 'mode', Exam.Mode.ONSITE))
        venue = attrs.get('venue', getattr(self.instance, 'venue', ''))
        start_time = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        duration_minutes = attrs.get('duration_minutes', getattr(self.instance, 'duration_minutes', 30))
        questions_payload = self.initial_data.get('questions')
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        school_class = resolve_school_class(
            school,
            school_class=attrs.get('school_class') or getattr(self.instance, 'school_class', None),
            class_name=attrs.get('target_class') or getattr(self.instance, 'target_class', None),
        )

        if mode == Exam.Mode.ONSITE and not str(venue or '').strip():
            raise serializers.ValidationError({'venue': 'Venue is required for onsite exams.'})
        if start_time and start_time <= timezone.now():
            raise serializers.ValidationError({'start_time': 'The exam start time must be in the future.'})
        if duration_minutes < 5:
            raise serializers.ValidationError({'duration_minutes': 'The exam end time must be at least five minutes after the start time.'})

        if mode == Exam.Mode.ONLINE:
            existing_questions = self.instance.questions.count() if self.instance else 0
            incoming_questions = len(questions_payload or [])
            if existing_questions == 0 and incoming_questions == 0:
                raise serializers.ValidationError({'questions': 'At least one question is required for an online exam.'})

        if school_class:
            attrs['school_class'] = school_class
            attrs['target_class'] = school_class.name
        elif not (attrs.get('target_class') or getattr(self.instance, 'target_class', '')).strip():
            raise serializers.ValidationError({'target_class': 'Provide a target class or select a registered class.'})

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        questions_data = self.initial_data.get('questions', [])
        exam = Exam.objects.create(**validated_data)
        self._replace_questions(exam, questions_data)
        return exam

    @transaction.atomic
    def update(self, instance, validated_data):
        questions_data = self.initial_data.get('questions')
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if questions_data is not None:
            self._replace_questions(instance, questions_data)
        return instance

    def _replace_questions(self, exam: Exam, questions_data):
        exam.questions.all().delete()
        for index, question in enumerate(questions_data or [], start=1):
            serializer = ExamQuestionWriteSerializer(data={**question, 'order': question.get('order', index)})
            serializer.is_valid(raise_exception=True)
            serializer.save(exam=exam)


class ExamSubmissionSerializer(serializers.ModelSerializer):
    exam_title = serializers.CharField(source='exam.title', read_only=True)
    subject_name = serializers.CharField(source='exam.subject.name', read_only=True)
    target_class = serializers.CharField(source='exam.target_class', read_only=True)
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    student_admission = serializers.CharField(source='student.admission_number', read_only=True)
    exam = ExamSerializer(read_only=True)

    class Meta:
        model = ExamSubmission
        fields = [
            'id', 'exam', 'exam_title', 'subject_name', 'target_class', 'student', 'student_name',
            'student_admission', 'answers', 'score', 'total_marks', 'percentage', 'status',
            'started_at', 'submitted_at', 'graded_at', 'created', 'modified',
        ]
        read_only_fields = [
            'id', 'student', 'score', 'total_marks', 'percentage', 'status',
            'started_at', 'submitted_at', 'graded_at', 'created', 'modified',
        ]


class ExamSubmissionCreateSerializer(serializers.Serializer):
    exam = serializers.UUIDField()
    answers = serializers.DictField(child=serializers.IntegerField(min_value=0))

    def validate(self, attrs):
        request = self.context['request']
        try:
            exam = Exam.objects.prefetch_related('questions').get(id=attrs['exam'])
        except Exam.DoesNotExist as exc:
            raise serializers.ValidationError({'exam': 'Exam not found.'}) from exc

        if request.user.role != 'STUDENT':
            raise serializers.ValidationError('Only students can submit exams.')

        student = students_api.get_student_for_user(request.user)
        if student is None:
            raise serializers.ValidationError('Student profile not found.')

        if exam.school_id != student.school_id:
            raise serializers.ValidationError({'exam': 'This exam does not belong to your school.'})
        if not (
            (student.school_class_id and exam.school_class_id == student.school_class_id)
            or exam.target_class == student.student_class
        ):
            raise serializers.ValidationError({'exam': 'This exam is not assigned to your class.'})
        if exam.mode != Exam.Mode.ONLINE:
            raise serializers.ValidationError({'exam': 'Only online exams can be submitted digitally.'})
        if exam.status in [Exam.Status.CANCELLED, Exam.Status.DRAFT]:
            raise serializers.ValidationError({'exam': 'This exam is not currently available.'})
        now = timezone.now()
        if now < exam.start_time:
            raise serializers.ValidationError({'exam': 'This exam has not started yet.'})
        if now >= exam.end_time:
            raise serializers.ValidationError({'exam': 'This exam has already ended.'})
        if not exam.questions.exists():
            raise serializers.ValidationError({'exam': 'This exam has no configured questions.'})

        attrs['exam_obj'] = exam
        attrs['student_obj'] = student
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        exam = validated_data['exam_obj']
        student = validated_data['student_obj']
        answers = validated_data['answers']

        submission, created = ExamSubmission.objects.get_or_create(
            exam=exam,
            student=student,
            defaults={'answers': {}, 'status': ExamSubmission.Status.IN_PROGRESS},
        )
        if not created and submission.status in [ExamSubmission.Status.SUBMITTED, ExamSubmission.Status.GRADED]:
            raise serializers.ValidationError({'exam': 'This exam has already been submitted.'})

        total_marks = Decimal('0.00')
        score = Decimal('0.00')
        normalized_answers = {}
        for question in exam.questions.all():
            total_marks += Decimal(question.marks)
            submitted_answer = answers.get(str(question.id))
            if submitted_answer is None:
                submitted_answer = answers.get(question.id.hex if hasattr(question.id, 'hex') else str(question.id))
            if submitted_answer is None:
                continue
            normalized_answers[str(question.id)] = submitted_answer
            if int(submitted_answer) == int(question.correct_option):
                score += Decimal(question.marks)

        percentage = Decimal('0.00')
        if total_marks > 0:
            percentage = (score / total_marks) * Decimal('100')

        submission.answers = normalized_answers
        submission.score = score
        submission.total_marks = total_marks
        submission.percentage = percentage.quantize(Decimal('0.01'))
        submission.status = ExamSubmission.Status.GRADED
        submission.submitted_at = timezone.now()
        submission.graded_at = timezone.now()
        submission.save()
        return submission

from rest_framework import serializers

from .audience import SCHOOL_AUDIENCES
from .models import Survey, SurveyAnswer, SurveyPublisher, SurveyQuestion, SurveyResponse


class SurveyListSerializer(serializers.ModelSerializer):
    """One row for GET /surveys/: enough to decide whether to open it."""

    question_count = serializers.SerializerMethodField()
    has_responded = serializers.SerializerMethodField()
    is_own = serializers.SerializerMethodField()

    class Meta:
        model = Survey
        fields = ['id', 'title', 'description', 'question_count', 'allow_multiple_responses', 'has_responded', 'is_own']

    def get_question_count(self, obj):
        return obj.questions.count()

    def get_is_own(self, obj):
        request = self.context.get('request')
        return bool(request and obj.created_by_id == getattr(request.user, 'pk', None))

    def get_has_responded(self, obj):
        annotated = getattr(obj, 'caller_has_responded', None)
        if annotated is not None:
            return bool(annotated)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return obj.responses.filter(user=user).exists()


class SurveyQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyQuestion
        fields = ['id', 'question_text', 'question_type', 'options']


class SurveyDetailSerializer(serializers.ModelSerializer):
    """GET /surveys/{id}/: the survey plus its ordered questions."""

    questions = SurveyQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = Survey
        fields = ['id', 'title', 'description', 'allow_multiple_responses', 'questions']


class SurveyManageSerializer(serializers.ModelSerializer):
    """A survey as its publisher sees it: audience, state and response count."""

    questions = SurveyQuestionSerializer(many=True, read_only=True)
    audience_display = serializers.CharField(source='get_audience_display', read_only=True)
    target_school_name = serializers.CharField(source='target_school.name', read_only=True, default=None)
    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    response_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Survey
        fields = [
            'id', 'title', 'description', 'is_active', 'audience', 'audience_display',
            'target_school', 'target_school_name', 'allow_multiple_responses',
            'created_by', 'created_by_name', 'created_at', 'response_count', 'questions',
        ]


class SurveyQuestionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyQuestion
        fields = ['question_text', 'question_type', 'options', 'order']

    def validate(self, attrs):
        if attrs.get('question_type') == SurveyQuestion.QuestionType.SINGLE_CHOICE and not attrs.get('options'):
            raise serializers.ValidationError({'options': 'At least one option is required for a single-choice question.'})
        return attrs


class SurveyWriteSerializer(serializers.ModelSerializer):
    """POST /surveys/ and PATCH /surveys/{id}/ for publishers only (see
    SurveyViewSet.get_permissions). The audience decides who is asked."""

    questions = SurveyQuestionWriteSerializer(many=True, required=False)

    class Meta:
        model = Survey
        fields = ['id', 'title', 'description', 'is_active', 'audience', 'target_school',
                  'allow_multiple_responses', 'questions']
        read_only_fields = ['id']

    def validate(self, attrs):
        audience = attrs.get('audience', getattr(self.instance, 'audience', None))
        target_school = attrs.get('target_school', getattr(self.instance, 'target_school', None))
        if target_school is not None and audience not in SCHOOL_AUDIENCES:
            raise serializers.ValidationError({
                'target_school': 'A school can only be chosen for a school audience.',
            })
        return attrs

    def create(self, validated_data):
        questions_data = validated_data.pop('questions', [])
        validated_data['created_by'] = self.context['request'].user
        survey = Survey.objects.create(**validated_data)
        SurveyQuestion.objects.bulk_create([
            SurveyQuestion(survey=survey, **question) for question in questions_data
        ])
        return survey

    def update(self, instance, validated_data):
        questions_data = validated_data.pop('questions', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if questions_data is not None:
            # Replacing the questions of a survey that already has answers
            # would orphan those answers, so only an unanswered survey's
            # questions can be rewritten.
            if instance.responses.exists():
                raise serializers.ValidationError({
                    'questions': 'This survey already has responses, so its questions can no longer change.',
                })
            instance.questions.all().delete()
            SurveyQuestion.objects.bulk_create([
                SurveyQuestion(survey=instance, **question) for question in questions_data
            ])
        return instance


class SurveyAnswerInputSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    answer_text = serializers.CharField(allow_blank=True)


class SurveyRespondSerializer(serializers.Serializer):
    """Body for POST /surveys/{id}/respond/."""

    answers = SurveyAnswerInputSerializer(many=True)

    def validate_answers(self, value):
        if not value:
            raise serializers.ValidationError('At least one answer is required.')
        seen = set()
        for answer in value:
            qid = answer['question_id']
            if qid in seen:
                raise serializers.ValidationError(f'Duplicate answer for question_id {qid}.')
            seen.add(qid)
        return value


class SurveyAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyAnswer
        fields = ['question', 'answer_text']


class SurveyResponseSerializer(serializers.ModelSerializer):
    answers = SurveyAnswerSerializer(many=True, read_only=True)

    class Meta:
        model = SurveyResponse
        fields = ['id', 'survey', 'sequence', 'submitted_at', 'answers']


class SurveyResponseReportSerializer(serializers.ModelSerializer):
    """One collected response, for the survey's publisher."""

    respondent_name = serializers.CharField(source='user.name', read_only=True)
    respondent_role = serializers.CharField(source='user.role', read_only=True)
    respondent_matricule = serializers.CharField(source='user.matricule', read_only=True)
    respondent_school = serializers.CharField(source='user.school.name', read_only=True, default=None)
    answers = serializers.SerializerMethodField()

    class Meta:
        model = SurveyResponse
        fields = ['id', 'sequence', 'submitted_at', 'respondent_name', 'respondent_role',
                  'respondent_matricule', 'respondent_school', 'answers']

    def get_answers(self, obj):
        return [
            {
                'question': answer.question_id,
                'question_text': answer.question.question_text,
                'answer_text': answer.answer_text,
            }
            for answer in obj.answers.all()
        ]


class SurveyPublisherSerializer(serializers.ModelSerializer):
    """Authorise someone by their user id or, more usually, their matricule."""

    matricule = serializers.CharField(write_only=True, required=False)
    user_name = serializers.CharField(source='user.name', read_only=True)
    user_role = serializers.CharField(source='user.role', read_only=True)
    user_matricule = serializers.CharField(source='user.matricule', read_only=True)
    granted_by_name = serializers.CharField(source='granted_by.name', read_only=True, default=None)

    class Meta:
        model = SurveyPublisher
        fields = ['id', 'user', 'matricule', 'user_name', 'user_role', 'user_matricule', 'granted_by',
                  'granted_by_name', 'created_at']
        read_only_fields = ['id', 'granted_by', 'created_at']
        extra_kwargs = {'user': {'required': False}}

    def validate(self, attrs):
        from django.contrib.auth import get_user_model

        matricule = (attrs.pop('matricule', '') or '').strip()
        if matricule and not attrs.get('user'):
            user = get_user_model().objects.filter(matricule__iexact=matricule, is_active=True).first()
            if user is None:
                raise serializers.ValidationError({'matricule': 'No active account has this matricule.'})
            attrs['user'] = user
        user = attrs.get('user')
        if user is None:
            raise serializers.ValidationError({'matricule': 'Enter the matricule of the person to authorise.'})
        if (user.role or '').upper() in {'CEO', 'CTO'}:
            raise serializers.ValidationError({'matricule': 'The CEO and CTO can already publish surveys.'})
        if SurveyPublisher.objects.filter(user=user).exists():
            raise serializers.ValidationError({'matricule': 'This person can already publish surveys.'})
        return attrs

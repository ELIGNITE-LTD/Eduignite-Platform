from rest_framework import serializers

from .models import Survey, SurveyAnswer, SurveyQuestion, SurveyResponse


class SurveyListSerializer(serializers.ModelSerializer):
    """One row for GET /surveys/ — enough to decide whether to open it, not
    the questions themselves."""

    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Survey
        fields = ['id', 'title', 'description', 'question_count']

    def get_question_count(self, obj):
        return obj.questions.count()


class SurveyQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyQuestion
        fields = ['id', 'question_text', 'question_type', 'options']


class SurveyDetailSerializer(serializers.ModelSerializer):
    """GET /surveys/{id}/ — the survey plus its ordered questions."""

    questions = SurveyQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = Survey
        fields = ['id', 'title', 'description', 'questions']


class SurveyQuestionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyQuestion
        fields = ['question_text', 'question_type', 'options', 'order']

    def validate(self, attrs):
        if attrs.get('question_type') == SurveyQuestion.QuestionType.SINGLE_CHOICE and not attrs.get('options'):
            raise serializers.ValidationError({'options': 'At least one option is required for a single-choice question.'})
        return attrs


class SurveyWriteSerializer(serializers.ModelSerializer):
    """POST /surveys/ (create) and PATCH /surveys/{id}/ (edit/publish) —
    CEO/CTO only, see SurveyViewSet.get_permissions(). A published survey
    (``is_active=True``) is immediately visible to every authenticated user
    across every client that reads this API (there is no per-school/
    per-role targeting -- see the model docstring), which is the whole
    point: the CEO/CTO publish once and it reaches every online app plus
    the offline companion app in one place.
    """

    questions = SurveyQuestionWriteSerializer(many=True, required=False)

    class Meta:
        model = Survey
        fields = ['id', 'title', 'description', 'is_active', 'questions']
        read_only_fields = ['id']

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
            # Same "a content edit replaces the whole tree" simplification
            # apps.academy.serializers.CourseWriteSerializer.update() uses
            # for its modules -- fine here too, since a survey a user has
            # already answered shouldn't normally be edited anyway (the
            # per-user UniqueConstraint on SurveyResponse means re-editing
            # questions after responses exist would orphan old answers,
            # which is an acceptable, rare tradeoff for this MVP).
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
        fields = ['id', 'survey', 'submitted_at', 'answers']

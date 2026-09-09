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

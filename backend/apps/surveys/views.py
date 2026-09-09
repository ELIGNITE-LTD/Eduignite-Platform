from django.db import IntegrityError, transaction
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Survey, SurveyAnswer, SurveyQuestion, SurveyResponse
from .serializers import (
    SurveyDetailSerializer,
    SurveyListSerializer,
    SurveyRespondSerializer,
    SurveyResponseSerializer,
)


class SurveyViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET  /api/v1/surveys/          — active surveys the caller hasn't answered yet
    GET  /api/v1/surveys/{id}/     — one survey with its ordered questions
    POST /api/v1/surveys/{id}/respond/ — submit answers

    Everything here requires a real logged-in platform account — a survey
    "answered by users of the companion app" implies a genuine session, not
    an anonymous visitor, so this is never AllowAny.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Survey.objects.filter(is_active=True).prefetch_related('questions')
        user = self.request.user
        if self.action == 'list' and user.is_authenticated:
            qs = qs.exclude(responses__user=user)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return SurveyListSerializer
        return SurveyDetailSerializer

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        survey = self.get_object()
        serializer = SurveyRespondSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submitted_answers = serializer.validated_data['answers']

        questions = list(SurveyQuestion.objects.filter(survey=survey))
        question_ids = {q.id for q in questions}
        submitted_question_ids = {a['question_id'] for a in submitted_answers}

        missing = question_ids - submitted_question_ids
        if missing:
            return Response(
                {'detail': f'Missing answers for question_id(s): {sorted(missing)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        unknown = submitted_question_ids - question_ids
        if unknown:
            return Response(
                {'detail': f'Unknown question_id(s) for this survey: {sorted(unknown)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                response = SurveyResponse.objects.create(survey=survey, user=request.user)
                SurveyAnswer.objects.bulk_create([
                    SurveyAnswer(
                        response=response,
                        question_id=answer['question_id'],
                        answer_text=answer['answer_text'],
                    )
                    for answer in submitted_answers
                ])
        except IntegrityError:
            return Response(
                {'detail': 'You have already responded to this survey.'},
                status=status.HTTP_409_CONFLICT,
            )

        response.refresh_from_db()
        return Response(SurveyResponseSerializer(response).data, status=status.HTTP_201_CREATED)

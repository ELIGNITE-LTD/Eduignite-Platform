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
    SurveyWriteSerializer,
)

# Publishing reaches every authenticated user on every client that reads
# this API in one shot (there is no per-school/per-role targeting -- see
# models.py) -- keeping that limited to the platform's two founders,
# mirroring how apps.announcements restricts platform-wide (school=None)
# announcements. Same set as apps.chat.relations.PRIMARY_FOUNDER_ROLES,
# duplicated here (not imported) to avoid a cross-app dependency from
# apps.surveys onto apps.chat for two string constants.
SURVEY_PUBLISHER_ROLES = {'CEO', 'CTO'}


class _IsSurveyPublisher(permissions.BasePermission):
    message = 'Only the CEO or CTO can publish, edit, or remove a survey.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role in SURVEY_PUBLISHER_ROLES)


class SurveyViewSet(viewsets.ModelViewSet):
    """
    GET    /api/v1/surveys/            — active surveys the caller hasn't answered yet
    GET    /api/v1/surveys/{id}/       — one survey with its ordered questions
    POST   /api/v1/surveys/{id}/respond/ — submit answers
    POST   /api/v1/surveys/           — create/publish a survey (CEO/CTO only)
    PATCH  /api/v1/surveys/{id}/      — edit a survey, including toggling is_active (CEO/CTO only)
    DELETE /api/v1/surveys/{id}/      — remove a survey (CEO/CTO only)

    Read/respond requires a real logged-in platform account — a survey
    "answered by users of the companion app" implies a genuine session, not
    an anonymous visitor, so this is never AllowAny. Create/edit/delete is
    further restricted to SURVEY_PUBLISHER_ROLES.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if self.action in ('list', 'respond') or (self.action == 'retrieve' and user.role not in SURVEY_PUBLISHER_ROLES):
            qs = Survey.objects.filter(is_active=True).prefetch_related('questions')
        else:
            # A publisher managing their own surveys (update/destroy, or
            # retrieving one to edit) needs to see inactive/draft ones too.
            qs = Survey.objects.all().prefetch_related('questions')
        if self.action == 'list' and user.is_authenticated:
            qs = qs.exclude(responses__user=user)
        return qs

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [permissions.IsAuthenticated(), _IsSurveyPublisher()]
        return [permission() for permission in self.permission_classes]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return SurveyWriteSerializer
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

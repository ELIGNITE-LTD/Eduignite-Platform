from collections import Counter

from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, Max, OuterRef, Prefetch
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import audience
from .models import Survey, SurveyAnswer, SurveyPublisher, SurveyQuestion, SurveyResponse
from .serializers import (
    SurveyDetailSerializer,
    SurveyListSerializer,
    SurveyManageSerializer,
    SurveyPublisherSerializer,
    SurveyRespondSerializer,
    SurveyResponseReportSerializer,
    SurveyResponseSerializer,
    SurveyWriteSerializer,
)


class _IsSurveyPublisher(permissions.BasePermission):
    message = 'Only the CEO, the CTO or an authorised publisher can manage surveys.'

    def has_permission(self, request, view):
        return audience.can_publish(request.user)


class _IsFounder(permissions.BasePermission):
    message = 'Only the CEO or CTO can authorise survey publishers.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and audience.is_founder(request.user))


class SurveyViewSet(viewsets.ModelViewSet):
    """
    GET    /surveys/                  active surveys the caller is asked to answer
    GET    /surveys/{id}/             one survey with its ordered questions
    POST   /surveys/{id}/respond/     submit answers
    POST   /surveys/                  publish (publishers only)
    PATCH  /surveys/{id}/             edit or unpublish (publishers only)
    DELETE /surveys/{id}/             remove (publishers only)
    GET    /surveys/managed/          surveys the caller manages, with response counts
    GET    /surveys/{id}/responses/   collected responses and per-question totals

    Answering needs a real session and a place in the survey's audience.
    Every read and write goes through ``audience``, so the server refuses
    anything the caller is not entitled to, whatever a client displays.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        base = Survey.objects.select_related('target_school', 'created_by').prefetch_related('questions')

        if self.action in ('update', 'partial_update', 'destroy', 'responses', 'managed'):
            return base.filter(audience.manageable_surveys_q(user)).annotate(response_count=Count('responses'))

        answerable = base.filter(is_active=True).filter(audience.eligible_surveys_q(user))
        if self.action == 'retrieve' and audience.can_publish(user):
            # A publisher may also open a survey they manage, active or not.
            return (answerable | base.filter(audience.manageable_surveys_q(user))).distinct()

        if self.action == 'list':
            answered = SurveyResponse.objects.filter(survey=OuterRef('pk'), user=user)
            answerable = answerable.annotate(caller_has_responded=Exists(answered)).exclude(
                caller_has_responded=True, allow_multiple_responses=False,
            )
        return answerable

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'responses', 'managed'):
            return [permissions.IsAuthenticated(), _IsSurveyPublisher()]
        return [permission() for permission in self.permission_classes]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return SurveyWriteSerializer
        if self.action == 'list':
            return SurveyListSerializer
        if self.action == 'managed':
            return SurveyManageSerializer
        return SurveyDetailSerializer

    @action(detail=False, methods=['get'])
    def access(self, request):
        """What this person may do with surveys, so clients show only that."""
        return Response({
            'can_publish': audience.can_publish(request.user),
            'can_manage_publishers': audience.is_founder(request.user),
        })

    @action(detail=False, methods=['get'])
    def managed(self, request):
        surveys = self.get_queryset().order_by('-created_at')
        page = self.paginate_queryset(surveys)
        if page is not None:
            return self.get_paginated_response(SurveyManageSerializer(page, many=True).data)
        return Response(SurveyManageSerializer(surveys, many=True).data)

    @action(detail=True, methods=['get'])
    def responses(self, request, pk=None):
        survey = self.get_object()
        responses = (
            SurveyResponse.objects.filter(survey=survey)
            .select_related('user', 'user__school')
            .prefetch_related(Prefetch('answers', queryset=SurveyAnswer.objects.select_related('question')))
            .order_by('-submitted_at')
        )
        questions = list(survey.questions.all())
        choice_counts = {q.id: Counter() for q in questions if q.question_type == SurveyQuestion.QuestionType.SINGLE_CHOICE}
        for answer in SurveyAnswer.objects.filter(response__survey=survey, question_id__in=choice_counts.keys()):
            choice_counts[answer.question_id][answer.answer_text] += 1

        summary = []
        for question in questions:
            entry = {
                'question': question.id,
                'question_text': question.question_text,
                'question_type': question.question_type,
            }
            if question.id in choice_counts:
                counts = choice_counts[question.id]
                entry['options'] = [{'option': option, 'count': counts.get(option, 0)} for option in question.options]
            summary.append(entry)

        return Response({
            'survey': SurveyManageSerializer(survey).data,
            'response_count': responses.count(),
            'respondent_count': responses.values('user').distinct().count(),
            'summary': summary,
            'responses': SurveyResponseReportSerializer(responses, many=True).data,
        })

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        survey = self.get_object()
        serializer = SurveyRespondSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submitted_answers = serializer.validated_data['answers']

        question_ids = set(SurveyQuestion.objects.filter(survey=survey).values_list('id', flat=True))
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
                sequence = 1
                if survey.allow_multiple_responses:
                    last = SurveyResponse.objects.filter(survey=survey, user=request.user).aggregate(
                        last=Max('sequence'),
                    )['last']
                    sequence = (last or 0) + 1
                response = SurveyResponse.objects.create(survey=survey, user=request.user, sequence=sequence)
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


class SurveyPublisherViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """CEO/CTO only: authorise other people to publish surveys."""

    serializer_class = SurveyPublisherSerializer
    permission_classes = [permissions.IsAuthenticated, _IsFounder]
    queryset = SurveyPublisher.objects.select_related('user', 'granted_by')

    def perform_create(self, serializer):
        serializer.save(granted_by=self.request.user)

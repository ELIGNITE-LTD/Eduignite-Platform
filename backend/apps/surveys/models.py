"""Models backing the Surveys feature.

The CEO or CTO publishes a survey (a set of questions) via
``POST /api/v1/surveys/`` (see ``views.py``'s ``SurveyViewSet`` and
``SURVEY_PUBLISHER_ROLES``), and it immediately becomes visible to every
authenticated user across every client that reads this API -- the mobile
app, desktop app, and the offline companion app alike, with no separate
per-app publish step. Django admin (``admin.py``) remains available as a
second authoring path for the same API-backed data.

There is deliberately no per-school/per-role targeting here (unlike
``apps.announcements.Announcement``) -- a published survey is global by
design, matching the product requirement that a survey reach everyone at
once.
"""

from django.db import models


class Survey(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='surveys_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'surveys'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return self.title


class SurveyQuestion(models.Model):
    class QuestionType(models.TextChoices):
        TEXT = 'TEXT', 'Free Text'
        SINGLE_CHOICE = 'SINGLE_CHOICE', 'Single Choice'

    survey = models.ForeignKey(Survey, on_delete=models.CASCADE, related_name='questions')
    question_text = models.TextField()
    question_type = models.CharField(
        max_length=20, choices=QuestionType.choices, default=QuestionType.TEXT,
    )
    options = models.JSONField(
        default=list, blank=True,
        help_text='List of option strings. Only meaningful for SINGLE_CHOICE questions.',
    )
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'survey_questions'
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.survey.title} / {self.question_text[:60]}'


class SurveyResponse(models.Model):
    survey = models.ForeignKey(Survey, on_delete=models.CASCADE, related_name='responses')
    user = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='survey_responses',
    )
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'survey_responses'
        ordering = ['-submitted_at']
        constraints = [
            # At most one response per user per survey — same pattern as
            # apps.academy.models.Certificate's UniqueConstraint on
            # user+course+tier. The API (views.py) catches the resulting
            # IntegrityError under concurrent double-submits and turns it
            # into a clean 409, rather than letting it surface raw.
            models.UniqueConstraint(fields=['survey', 'user'], name='survey_response_unique_survey_user'),
        ]

    def __str__(self):
        return f'{self.user_id} -> {self.survey_id}'


class SurveyAnswer(models.Model):
    response = models.ForeignKey(SurveyResponse, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey(SurveyQuestion, on_delete=models.CASCADE, related_name='answers')
    # Covers both question types: free text for TEXT, and the chosen option
    # string (not an index) for SINGLE_CHOICE — no separate structure needed.
    answer_text = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'survey_answers'
        constraints = [
            models.UniqueConstraint(fields=['response', 'question'], name='survey_answer_unique_response_question'),
        ]

    def __str__(self):
        return f'{self.response_id} / {self.question_id}'

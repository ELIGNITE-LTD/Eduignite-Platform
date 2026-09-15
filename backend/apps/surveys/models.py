"""Models backing the Surveys feature.

The CEO, the CTO, or someone they have authorised (``SurveyPublisher``)
publishes a survey for a chosen audience. Every client reads the same API,
so a survey reaches web, desktop, mobile and the offline companion at once,
but only for the people its audience describes (see ``audience.py``).
"""

from django.db import models


class SurveyAudience(models.TextChoices):
    ALL_EDUIGNITE_USERS = 'ALL_EDUIGNITE_USERS', 'All EduIgnite Users'
    ALL_SCHOOL_USERS = 'ALL_SCHOOL_USERS', 'All School Users'
    EXECUTIVE = 'EXECUTIVE', 'Executives'
    PRINCIPAL = 'PRINCIPAL', 'Principals'
    SCHOOL_STAFF = 'SCHOOL_STAFF', 'School Staff'
    TEACHER = 'TEACHER', 'Teachers'
    STUDENT = 'STUDENT', 'Students'
    PARENT = 'PARENT', 'Parents'


class Survey(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    audience = models.CharField(
        max_length=24,
        choices=SurveyAudience.choices,
        default=SurveyAudience.ALL_EDUIGNITE_USERS,
    )
    target_school = models.ForeignKey(
        'schools.School',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='targeted_surveys',
        help_text='School audiences only: limits the survey to this one school.',
    )
    allow_multiple_responses = models.BooleanField(
        default=False,
        help_text='When set, a person may answer again after submitting.',
    )
    created_by = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='surveys_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'surveys'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['is_active']),
            models.Index(fields=['audience'], name='surveys_audience_idx'),
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
    # 1 for the first answer. A survey that allows repeat answers numbers each
    # one; one that does not always writes 1, so the constraint below turns a
    # second submission (including a concurrent double-submit) into an
    # IntegrityError the API reports as 409.
    sequence = models.PositiveIntegerField(default=1)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'survey_responses'
        ordering = ['-submitted_at']
        constraints = [
            models.UniqueConstraint(
                fields=['survey', 'user', 'sequence'],
                name='survey_response_unique_survey_user_sequence',
            ),
        ]

    def __str__(self):
        return f'{self.user_id} -> {self.survey_id} #{self.sequence}'


class SurveyAnswer(models.Model):
    response = models.ForeignKey(SurveyResponse, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey(SurveyQuestion, on_delete=models.CASCADE, related_name='answers')
    # Free text for TEXT, the chosen option string (not an index) for SINGLE_CHOICE.
    answer_text = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'survey_answers'
        constraints = [
            models.UniqueConstraint(fields=['response', 'question'], name='survey_answer_unique_response_question'),
        ]

    def __str__(self):
        return f'{self.response_id} / {self.question_id}'


class SurveyPublisher(models.Model):
    """Someone other than the CEO or CTO whom a founder has authorised to
    publish surveys. They manage and read responses to their own surveys."""

    user = models.OneToOneField(
        'users.User', on_delete=models.CASCADE, related_name='survey_publisher_grant',
    )
    granted_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'survey_publishers'
        ordering = ['-created_at']

    def __str__(self):
        return f'Survey publisher {self.user_id}'

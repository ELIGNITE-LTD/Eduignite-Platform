import uuid
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django_extensions.db.models import TimeStampedModel


class Exam(TimeStampedModel):
    class Mode(models.TextChoices):
        ONLINE = 'ONLINE', 'Online'
        ONSITE = 'ONSITE', 'Onsite'

    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        SCHEDULED = 'SCHEDULED', 'Scheduled'
        CANCELLED = 'CANCELLED', 'Cancelled'
        COMPLETED = 'COMPLETED', 'Completed'

    class ExamType(models.TextChoices):
        SEQUENCE = 'SEQUENCE', 'Sequence Assessment'
        MID_TERM = 'MID_TERM', 'Mid-Term Evaluation'
        END_TERM = 'END_TERM', 'End of Term Examination'
        MOCK = 'MOCK', 'Mock Exam'
        OTHER = 'OTHER', 'Other'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='exams')
    subject = models.ForeignKey(
        'grades.Subject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='exams',
    )
    sequence = models.ForeignKey(
        'grades.Sequence',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='exams',
    )
    teacher = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_exams',
        limit_choices_to={'role': 'TEACHER'},
    )
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='exams',
    )
    title = models.CharField(max_length=255)
    exam_type = models.CharField(max_length=20, choices=ExamType.choices, default=ExamType.SEQUENCE)
    mode = models.CharField(max_length=10, choices=Mode.choices, default=Mode.ONSITE)
    target_class = models.CharField(max_length=100)
    instructions = models.TextField(blank=True)
    venue = models.CharField(max_length=255, blank=True, default='')
    start_time = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=30)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    pass_mark = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('50.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
    )
    allow_review = models.BooleanField(default=True)

    class Meta:
        ordering = ['-start_time', 'title']
        indexes = [
            models.Index(fields=['school', 'mode', 'status']),
            models.Index(fields=['school', 'target_class']),
            models.Index(fields=['school', 'start_time']),
            models.Index(fields=['school_class']),
        ]

    def __str__(self):
        return f'{self.title} ({self.get_mode_display()})'

    @property
    def end_time(self):
        return self.start_time + timedelta(minutes=self.duration_minutes)

    @property
    def is_live_now(self):
        now = timezone.now()
        return self.mode == self.Mode.ONLINE and self.status == self.Status.SCHEDULED and self.start_time <= now < self.end_time

    def save(self, *args, **kwargs):
        if self.school_class:
            self.target_class = self.school_class.name
            if not self.school_id:
                self.school = self.school_class.school
        super().save(*args, **kwargs)


class ExamQuestion(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='questions')
    order = models.PositiveIntegerField(default=1)
    text = models.TextField()
    image_url = models.TextField(blank=True, default='')
    options = models.JSONField(default=list, blank=True)
    correct_option = models.PositiveIntegerField(default=0)
    marks = models.PositiveIntegerField(default=1)
    explanation = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['order', 'created']
        unique_together = [['exam', 'order']]

    def __str__(self):
        return f'{self.exam.title} Q{self.order}'

    def clean(self):
        super().clean()
        normalized_options = [str(option).strip() for option in (self.options or []) if str(option).strip()]
        if len(normalized_options) < 2:
            raise ValidationError({'options': 'Each question must have at least two options.'})
        if self.correct_option >= len(normalized_options):
            raise ValidationError({'correct_option': 'Correct option must match one of the provided options.'})

    def save(self, *args, **kwargs):
        self.options = [str(option).strip() for option in (self.options or []) if str(option).strip()]
        self.full_clean()
        super().save(*args, **kwargs)


class ExamSubmission(TimeStampedModel):
    class Status(models.TextChoices):
        IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
        SUBMITTED = 'SUBMITTED', 'Submitted'
        GRADED = 'GRADED', 'Graded'
        ABSENT = 'ABSENT', 'Absent'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='submissions')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='exam_submissions')
    answers = models.JSONField(default=dict, blank=True)
    score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    total_marks = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    graded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-submitted_at', '-created']
        unique_together = [['exam', 'student']]
        indexes = [
            models.Index(fields=['student', 'status']),
            models.Index(fields=['exam', 'status']),
        ]

    def __str__(self):
        return f'{self.student.admission_number} - {self.exam.title}'

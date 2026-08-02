import uuid
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django_extensions.db.models import TimeStampedModel


class Assignment(TimeStampedModel):
    class SubmissionType(models.TextChoices):
        TEXT = 'text', 'Text'
        FILE = 'file', 'File'
        BOTH = 'both', 'Text and File'

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PUBLISHED = 'published', 'Published'
        CANCELLED = 'cancelled', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='assignments')
    subject = models.ForeignKey('grades.Subject', on_delete=models.CASCADE, related_name='assignments')
    teacher = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignments',
    )
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignments',
    )
    title = models.CharField(max_length=255)
    instructions = models.TextField(blank=True, default='')
    attachment_name = models.CharField(max_length=255, blank=True, default='')
    attachment_mime_type = models.CharField(max_length=120, blank=True, default='')
    attachment_data = models.TextField(blank=True, default='')
    target_class = models.CharField(max_length=100)
    due_date = models.DateTimeField()
    max_marks = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=20,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
    )
    submission_type = models.CharField(
        max_length=10,
        choices=SubmissionType.choices,
        default=SubmissionType.BOTH,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PUBLISHED,
    )

    class Meta:
        ordering = ['status', 'due_date', 'title']
        indexes = [
            models.Index(fields=['school', 'target_class']),
            models.Index(fields=['school', 'status']),
            models.Index(fields=['teacher', 'due_date']),
            models.Index(fields=['school_class']),
        ]

    def __str__(self):
        return f'{self.title} - {self.target_class}'

    def save(self, *args, **kwargs):
        if self.school_class:
            self.target_class = self.school_class.name
            if not self.school_id:
                self.school = self.school_class.school
        super().save(*args, **kwargs)


class AssignmentSubmission(TimeStampedModel):
    class Status(models.TextChoices):
        SUBMITTED = 'submitted', 'Submitted'
        GRADED = 'graded', 'Graded'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='submissions')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='assignment_submissions')
    content = models.TextField(blank=True, default='')
    attachment_name = models.CharField(max_length=255, blank=True, default='')
    attachment_data = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)
    score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
    )
    feedback = models.TextField(blank=True, default='')
    graded_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='graded_assignment_submissions',
    )
    graded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created']
        unique_together = [['assignment', 'student']]
        indexes = [
            models.Index(fields=['assignment', 'status']),
            models.Index(fields=['student', 'status']),
        ]

    def __str__(self):
        return f'{self.assignment.title} - {self.student.admission_number}'

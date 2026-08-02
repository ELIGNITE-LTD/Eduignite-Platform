"""
Live Classes models for EduIgnite.

Represents scheduled and live virtual classroom sessions. Each session
belongs to a teacher, targets a specific class/subject, and tracks
enrollment and participation.
"""

import uuid
from django.db import models
from django.utils import timezone
from django_extensions.db.models import TimeStampedModel


class LiveClassStatus(models.TextChoices):
    UPCOMING = 'upcoming', 'Upcoming'
    LIVE = 'live', 'Live Now'
    ENDED = 'ended', 'Ended'
    CANCELLED = 'cancelled', 'Cancelled'


class LiveClass(TimeStampedModel):
    """A scheduled virtual classroom session."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(
        'schools.School',
        on_delete=models.CASCADE,
        related_name='live_classes',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    subject = models.ForeignKey(
        'grades.Subject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='live_classes',
    )
    subject_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text='Fallback subject name if no FK subject is linked',
    )
    teacher = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='taught_live_classes',
        limit_choices_to={'role': 'TEACHER'},
    )
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='live_classes',
    )
    target_class = models.CharField(
        max_length=100,
        help_text='e.g., Form 5, Upper Sixth',
    )
    meeting_url = models.URLField(
        blank=True,
        null=True,
        help_text='Zoom / Google Meet / Jitsi link',
    )
    meeting_id = models.CharField(max_length=255, blank=True, null=True)
    meeting_password = models.CharField(max_length=255, blank=True, null=True)
    platform = models.CharField(
        max_length=50,
        default='jitsi',
        choices=[
            ('jitsi', 'Jitsi Meet'),
            ('zoom', 'Zoom'),
            ('google_meet', 'Google Meet'),
            ('teams', 'Microsoft Teams'),
        ],
    )
    start_time = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=60)
    status = models.CharField(
        max_length=20,
        choices=LiveClassStatus.choices,
        default=LiveClassStatus.UPCOMING,
    )
    # Tracking
    max_participants = models.PositiveIntegerField(default=50)
    enrolled_count = models.PositiveIntegerField(default=0)
    is_recorded = models.BooleanField(default=False)
    recording_url = models.URLField(blank=True, null=True)

    class Meta:
        app_label = 'live_classes'
        ordering = ['-start_time']
        indexes = [
            models.Index(fields=['school', 'status']),
            models.Index(fields=['teacher', 'start_time']),
            models.Index(fields=['target_class', 'start_time']),
            models.Index(fields=['school_class']),
        ]
        verbose_name = 'Live Class'
        verbose_name_plural = 'Live Classes'

    def __str__(self):
        return f"{self.title} — {self.teacher.name} ({self.start_time:%Y-%m-%d %H:%M})"

    @property
    def end_time(self):
        return self.start_time + timezone.timedelta(minutes=self.duration_minutes)

    @property
    def is_live_now(self):
        now = timezone.now()
        return self.start_time <= now <= self.end_time

    @property
    def subject_display(self):
        return self.subject.name if self.subject else self.subject_name or 'General'

    def save(self, *args, **kwargs):
        if self.school_class:
            self.target_class = self.school_class.name
            if not self.school_id:
                self.school = self.school_class.school
        super().save(*args, **kwargs)

    def auto_update_status(self):
        """Compute and save the live status based on current time."""
        if self.status == LiveClassStatus.CANCELLED:
            return
        now = timezone.now()
        if now < self.start_time:
            self.status = LiveClassStatus.UPCOMING
        elif self.start_time <= now <= self.end_time:
            self.status = LiveClassStatus.LIVE
        else:
            self.status = LiveClassStatus.ENDED
        self.save(update_fields=['status'])


class LiveClassEnrollment(TimeStampedModel):
    """Tracks which students have enrolled in a live class."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    live_class = models.ForeignKey(
        LiveClass,
        on_delete=models.CASCADE,
        related_name='enrollments',
    )
    student = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='class_enrollments',
    )
    joined_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)
    duration_attended = models.PositiveIntegerField(
        default=0,
        help_text='Minutes attended',
    )

    class Meta:
        unique_together = [['live_class', 'student']]
        ordering = ['-created']

    def __str__(self):
        return f"{self.student.name} → {self.live_class.title}"

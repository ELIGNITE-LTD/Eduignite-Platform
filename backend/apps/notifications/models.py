import uuid

from django.conf import settings
from django.db import models
from django_extensions.db.models import TimeStampedModel


class NotificationType(models.TextChoices):
    ASSIGNMENT = 'assignment', 'Assignment'
    EXAMINATION = 'examination', 'Examination'
    GRADE_PUBLISHED = 'grade_published', 'Grade Published'
    FEE_PAYMENT = 'fee_payment', 'Fee Payment'
    COMMUNITY = 'community', 'Community'
    LIBRARY = 'library', 'Library'
    ATTENDANCE = 'attendance', 'Attendance'
    LIVE_CLASS = 'live_class', 'Live Class'
    SUPPORT = 'support', 'Support'
    PLATFORM = 'platform', 'Platform'
    ANNOUNCEMENT = 'announcement', 'Announcement'
    CHAT_MESSAGE = 'chat_message', 'Chat Message'
    PARENT_NOTIFICATION = 'parent_notification', 'Parent Notification'
    TEACHER_NOTIFICATION = 'teacher_notification', 'Teacher Notification'
    STUDENT_NOTIFICATION = 'student_notification', 'Student Notification'


class NotificationPriority(models.TextChoices):
    LOW = 'low', 'Low'
    NORMAL = 'normal', 'Normal'
    HIGH = 'high', 'High'
    URGENT = 'urgent', 'Urgent'


class Notification(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_notifications',
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(
        max_length=40,
        choices=NotificationType.choices,
        default=NotificationType.PLATFORM,
        db_index=True,
    )
    priority = models.CharField(
        max_length=20,
        choices=NotificationPriority.choices,
        default=NotificationPriority.NORMAL,
        db_index=True,
    )
    icon = models.CharField(max_length=100, blank=True, default='bell')
    url = models.CharField(max_length=500, blank=True, default='')
    is_read = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ['-created']
        indexes = [
            models.Index(fields=['recipient', 'is_read', '-created']),
            models.Index(fields=['recipient', 'notification_type', '-created']),
            models.Index(fields=['priority', '-created']),
        ]

    @property
    def created_at(self):
        return self.created

    @property
    def updated_at(self):
        return self.modified

    def __str__(self):
        return f'{self.recipient}: {self.title}'


class NotificationDevice(TimeStampedModel):
    class Platform(models.TextChoices):
        WEB = 'web', 'Web'
        ANDROID = 'android', 'Android'
        IOS = 'ios', 'iOS'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notification_devices')
    platform = models.CharField(max_length=20, choices=Platform.choices, default=Platform.WEB)
    token = models.TextField(unique=True)
    browser_name = models.CharField(max_length=100, blank=True, default='')
    active = models.BooleanField(default=True, db_index=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-modified']
        indexes = [
            models.Index(fields=['user', 'active']),
            models.Index(fields=['platform', 'active']),
        ]

    def __str__(self):
        return f'{self.user} - {self.platform}'

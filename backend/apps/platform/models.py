from django.db import models
import uuid
from django.core.validators import MinValueValidator
import json
from decimal import Decimal


class TimeStampedModel(models.Model):
    """Abstract base model with timestamp fields."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PlatformRole(models.TextChoices):
    """Roles for platform fee tracking."""
    STUDENT = 'STUDENT', 'Student'
    PARENT = 'PARENT', 'Parent'
    TEACHER = 'TEACHER', 'Teacher'
    BURSAR = 'BURSAR', 'Bursar'
    LIBRARIAN = 'LIBRARIAN', 'Librarian'
    SCHOOL_ADMIN = 'SCHOOL_ADMIN', 'School Admin'
    SUB_ADMIN = 'SUB_ADMIN', 'Sub Admin'


class PlatformSettings(models.Model):
    """Global platform settings (singleton pattern)."""

    name = models.CharField(max_length=255, default='EduIgnite')
    logo = models.TextField(null=True, blank=True)
    payment_deadline = models.DateField(null=True, blank=True)
    honour_roll_threshold = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('12.00'),
        validators=[MinValueValidator(Decimal('0'))],
    )
    fees = models.JSONField(default=dict)
    tutorial_links = models.JSONField(default=dict)
    maintenance_mode = models.BooleanField(default=False)
    contact_email = models.EmailField(default='eduignitecmr@gmail.com', blank=True)
    contact_phone = models.CharField(max_length=20, null=True, blank=True)

    class Meta:
        verbose_name = 'Platform Settings'
        verbose_name_plural = 'Platform Settings'
        db_table = 'platform_settings'

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        """Override save to maintain singleton."""
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        """Get or create singleton instance with default branding."""
        obj, created = cls.objects.get_or_create(pk=1, defaults={
            'name': 'EduIgnite',
            'contact_email': 'eduignitecmr@gmail.com',
        })
        return obj


class PlatformFees(models.Model):
    """Fee structure for different roles."""

    role = models.CharField(
        max_length=50,
        choices=PlatformRole.choices,
        unique=True,
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
    )
    currency = models.CharField(max_length=3, default='XAF')

    class Meta:
        verbose_name = 'Platform Fee'
        verbose_name_plural = 'Platform Fees'
        db_table = 'platform_fees'
        ordering = ['role']

    def __str__(self):
        return f'{self.get_role_display()} - {self.amount} {self.currency}'


class PublicEventType(models.TextChoices):
    """Types of public events."""
    VIDEO = 'video', 'Video'
    IMAGE = 'image', 'Image'
    ARTICLE = 'article', 'Article'
    NEWS = 'news', 'News'


class PublicEvent(TimeStampedModel):
    """Public events displayed on platform."""

    type = models.CharField(max_length=20, choices=PublicEventType.choices)
    title = models.CharField(max_length=255)
    description = models.TextField()
    url = models.TextField()
    is_active = models.BooleanField(default=True)
    order = models.IntegerField(default=0)

    class Meta:
        verbose_name = 'Public Event'
        verbose_name_plural = 'Public Events'
        db_table = 'public_events'
        ordering = ['order', '-created_at']

    def __str__(self):
        return self.title


class PublicEventComment(TimeStampedModel):
    event = models.ForeignKey(PublicEvent, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='public_event_comments')
    content = models.TextField()
    is_approved = models.BooleanField(default=True)

    class Meta:
        db_table = 'public_event_comments'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['event', 'is_approved']),
        ]

    def __str__(self):
        return f'Comment on {self.event.title} by {self.author.get_full_name()}'


class PublicEventLike(TimeStampedModel):
    event = models.ForeignKey(PublicEvent, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='public_event_likes')

    class Meta:
        db_table = 'public_event_likes'
        ordering = ['-created_at']
        unique_together = [['event', 'user']]
        indexes = [
            models.Index(fields=['event', 'user']),
        ]

    def __str__(self):
        return f'{self.user.get_full_name()} liked {self.event.title}'


class TutorialLink(models.Model):
    """Tutorial links for different user roles."""

    role = models.CharField(max_length=50)
    url = models.URLField()
    title = models.CharField(max_length=255)

    class Meta:
        verbose_name = 'Tutorial Link'
        verbose_name_plural = 'Tutorial Links'
        db_table = 'tutorial_links'
        ordering = ['role', 'title']

    def __str__(self):
        return f'{self.role} - {self.title}'


class AppKey(models.TextChoices):
    """Every shipped EduIgnite client that can ask the backend for its own
    version status. Keep in sync with the four client build targets:
    apps/mobile, apps/desktop, apps/offline-desktop, apps/offline-companion.
    """
    MOBILE = 'mobile', 'Mobile'
    DESKTOP = 'desktop', 'Desktop'
    OFFLINE_DESKTOP = 'offline_desktop', 'Offline Desktop'
    OFFLINE_COMPANION = 'offline_companion', 'Offline Companion'


class AppVersion(models.Model):
    """Latest/minimum-supported version info for one shipped client app.

    Public GET is served to every app on startup so it can self-check
    against ``latest_version``/``min_supported_version`` (see
    ``GET /api/v1/platform/app-versions/``). ``latest_version``,
    ``download_url`` and ``release_notes`` are the only fields CI is allowed
    to update (``POST /api/v1/platform/app-versions/{app_key}/``, guarded by
    the ``CI_VERSION_UPDATE_TOKEN`` shared-secret bearer token).

    ``min_supported_version`` is deliberately NEVER touched by that CI
    endpoint. It is the floor below which an app is blocked with a
    "you must update" screen, and bumping that floor is a human decision
    (some old version might still need to keep working) made by hand in
    Django admin — never an automatic side effect of shipping a new release.
    """

    app_key = models.CharField(max_length=32, unique=True, choices=AppKey.choices)
    latest_version = models.CharField(max_length=32, help_text='Semver string, e.g. "1.2.3".')
    min_supported_version = models.CharField(
        max_length=32,
        blank=True,
        help_text=(
            'Semver floor below which the app must block usage and force an update. '
            'Defaults to latest_version when a row is first created. Manual-only after '
            'that — never set by the CI update endpoint.'
        ),
    )
    download_url = models.URLField()
    release_notes = models.TextField(blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'App Version'
        verbose_name_plural = 'App Versions'
        db_table = 'app_versions'
        ordering = ['app_key']

    def __str__(self):
        return f'{self.get_app_key_display()} v{self.latest_version}'

    def save(self, *args, **kwargs):
        # Only backfill on first creation — never overwrite an existing,
        # possibly manually-adjusted, min_supported_version on later saves.
        if self._state.adding and not self.min_supported_version:
            self.min_supported_version = self.latest_version
        super().save(*args, **kwargs)


class ContactMessage(models.Model):
    """A message sent from the public website's contact form."""

    STATUS_CHOICES = [
        ('New', 'New'),
        ('Read', 'Read'),
        ('Replied', 'Replied'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    email = models.EmailField()
    subject = models.CharField(max_length=200, blank=True, default='')
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='New')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Contact Message'
        verbose_name_plural = 'Contact Messages'
        db_table = 'contact_messages'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} <{self.email}>'

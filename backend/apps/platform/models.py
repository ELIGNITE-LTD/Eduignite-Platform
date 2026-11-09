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
    # Where the maintenance notice is shown while maintenance_mode is on:
    # the signed-in apps ("accounts"), the public marketing site ("public"),
    # or both. Chosen by the founders.
    MAINTENANCE_SCOPE_CHOICES = [
        ('accounts', 'Accounts only'),
        ('public', 'Public site only'),
        ('both', 'Both'),
    ]
    maintenance_scope = models.CharField(
        max_length=10, choices=MAINTENANCE_SCOPE_CHOICES, default='both',
    )
    contact_email = models.EmailField(default='info@eduignite.online', blank=True)
    contact_phone = models.CharField(max_length=20, null=True, blank=True)

    # --- Platform fee per student (what EduIgnite bills each school) --------
    # Set by the founders only. A school is billed (active pupils) x (rate for
    # its education category). ``per_student_fee`` is the default rate;
    # ``per_student_fee_by_category`` ({'basic': n, 'secondary': n, 'higher': n})
    # overrides it per category when > 0. The deadline is ``payment_deadline``
    # above, optionally overridden per category in ``payment_deadline_by_category``
    # ({'basic': 'YYYY-MM-DD'}). A rate of 0 means "not configured": that school
    # is not billed this way and nothing is locked.
    per_student_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))],
    )
    per_student_fee_by_category = models.JSONField(default=dict, blank=True)
    payment_deadline_by_category = models.JSONField(default=dict, blank=True)
    #: Label of the billing period (e.g. '2026-2027'). Payments are tied to it,
    #: so moving the deadline within a period never resets what a school paid.
    #: Blank = the year of the deadline.
    billing_cycle = models.CharField(max_length=20, blank=True, default='')

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
            'contact_email': 'info@eduignite.online',
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
    ``download_url``, ``release_notes`` and ``size`` are the only fields CI is
    allowed to update (``POST /api/v1/platform/app-versions/{app_key}/``,
    guarded by the ``CI_VERSION_UPDATE_TOKEN`` shared-secret bearer token).

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
    size = models.CharField(
        max_length=32,
        blank=True,
        default='',
        help_text='Human-readable installer size, e.g. "79.4 MB". Blank for rows created before this field existed.',
    )
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


class IdempotencyRecord(models.Model):
    """One record of work the apps recorded offline, and what came of it.

    A device with no connection keeps what it records in an outbox and sends
    it when the network returns. If the answer to that send is lost on the
    way back, the device cannot tell whether the payment was recorded, so it
    sends again. Without this table the second attempt would take the money
    twice.

    The device generates a key for each piece of work and repeats it on every
    attempt. The first attempt is processed and its answer stored here; any
    repeat of that key is answered from this row instead of being processed
    again.
    """

    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_COMPLETED = 'completed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=200, db_index=True)
    user = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='idempotency_records'
    )
    method = models.CharField(max_length=10)
    path = models.CharField(max_length=500)
    status = models.CharField(max_length=20, default=STATUS_IN_PROGRESS)
    response_status = models.PositiveIntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True, default='')
    # When the device recorded it, which can be days before it arrives.
    recorded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Idempotency Record'
        db_table = 'idempotency_records'
        ordering = ['-created_at']
        constraints = [
            # The key is unique per person, so two schools using the same
            # device cannot collide, and one person's replay is recognised.
            models.UniqueConstraint(fields=['user', 'key'], name='unique_idempotency_key_per_user'),
        ]
        indexes = [
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.method} {self.path} [{self.key}]'


class IntegrationSecrets(models.Model):
    """CEO/CTO-editable runtime keys for AI (Gemini) and email (Brevo).

    A singleton (pk=1). When a value here is non-empty it OVERRIDES the matching
    environment variable at runtime, so the founders can rotate keys from the
    dashboard with no redeploy. Never serialized except masked, and only ever
    read/written through CEO/CTO-gated code.
    """

    gemini_api_key = models.CharField(max_length=255, blank=True, default='')
    gemini_model = models.CharField(max_length=64, blank=True, default='')
    brevo_api_key = models.CharField(max_length=255, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='+',
    )

    class Meta:
        db_table = 'integration_secrets'
        verbose_name = 'Integration Secrets'
        verbose_name_plural = 'Integration Secrets'

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Integration secrets (Gemini / Brevo)'


class PlatformBillingChange(models.Model):
    """Audit trail: who changed the platform billing configuration, and how."""

    changed_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='platform_billing_changes',
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    changes = models.JSONField(default=dict)  # {field: {'old': ..., 'new': ...}}

    class Meta:
        db_table = 'platform_billing_changes'
        ordering = ['-changed_at']

    def __str__(self):
        return f'billing change {self.pk} by {self.changed_by_id}'


class SchoolPlatformBill(models.Model):
    """One school's platform bill for one billing cycle.

    The amount is always recomputed on the server from the live pupil count and
    the founders' rate while the cycle is open; ``pupil_count``/``rate``/
    ``total_amount`` keep the last computed figures for history. What was paid
    is never stored here: it is the sum of confirmed gateway transactions
    pointing at this bill, so there is a single source of truth for money.
    """

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='platform_bills')
    cycle = models.CharField(max_length=20)
    pupil_count = models.PositiveIntegerField(default=0)
    rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    currency = models.CharField(max_length=3, default='XAF')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    deadline = models.DateField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'school_platform_bills'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['school', 'cycle'], name='unique_platform_bill_per_school_cycle'),
        ]

    def __str__(self):
        return f'{self.school_id} {self.cycle}'


from .executive_activity_model import ExecutiveActivityLog  # noqa: E402,F401

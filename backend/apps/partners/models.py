import uuid

from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ApplicantKind(models.TextChoices):
    INDIVIDUAL = 'individual', 'Individual'
    ORGANIZATION = 'organization', 'Organization'


class PartnerType(TimeStampedModel):
    """A kind of partnership the CEO offers (Marketing, Technology, …).

    Never hard-coded: the executive creates and manages these, and the public
    application form loads only the active ones.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True, default='')
    # Shown to applicants choosing this type (what it means / expectations).
    instructions = models.TextField(blank=True, default='')
    # Whether this type currently accepts new applications.
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_partner_types',
    )

    class Meta:
        ordering = ['order', 'name']
        indexes = [models.Index(fields=['is_active'])]

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            base = slugify(self.name)[:130] or 'type'
            slug = base
            n = 2
            qs = PartnerType.objects.exclude(pk=self.pk)
            while qs.filter(slug=slug).exists():
                slug = f'{base}-{n}'
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class PartnerApplication(TimeStampedModel):
    """Someone's request to become a partner. Reviewed by the CEO. A submitted
    application is NOT an account — an account is created only after approval."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        UNDER_REVIEW = 'under_review', 'Under Review'
        MORE_INFO = 'more_info', 'More Information Required'
        APPROVED = 'approved', 'Approved — Account Creation Pending'
        REJECTED = 'rejected', 'Rejected'
        ACCOUNT_CREATED = 'account_created', 'Account Created'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner_type = models.ForeignKey(
        PartnerType, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='applications',
    )
    # The type's name captured at apply time, so the record survives a type
    # being renamed or deleted.
    partner_type_name = models.CharField(max_length=120, blank=True, default='')
    applicant_kind = models.CharField(max_length=20, choices=ApplicantKind.choices)

    # Common contact fields (used for both kinds; for an organization these are
    # the contact person's details).
    full_name = models.CharField(max_length=180)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True, default='')
    country = models.CharField(max_length=80, blank=True, default='')
    region_city = models.CharField(max_length=120, blank=True, default='')
    website = models.URLField(blank=True, default='')

    # Organization-only identity (blank for individuals).
    organization_name = models.CharField(max_length=180, blank=True, default='')
    organization_type = models.CharField(max_length=120, blank=True, default='')
    contact_person_position = models.CharField(max_length=120, blank=True, default='')

    # The pitch (both kinds).
    proposed_partnership = models.TextField(blank=True, default='')
    contribution = models.TextField(blank=True, default='')
    # Everything else collected for this kind (profession, experience, reach,
    # social links, …) kept as structured answers so the form can evolve
    # without a migration per field.
    answers = models.JSONField(default=dict, blank=True)
    # Links to any supporting documents the applicant provided (URLs).
    documents = models.JSONField(default=list, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    # Message from the CEO when requesting more info or rejecting.
    ceo_message = models.TextField(blank=True, default='')
    reviewed_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewed_partner_applications',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['email']),
        ]

    def __str__(self):
        who = self.organization_name or self.full_name
        return f'{who} · {self.get_status_display()}'


class Partner(TimeStampedModel):
    """A partner account. Created only after an application is approved and the
    applicant sets a password. Owns the public profile and lifecycle state; the
    login/identity lives on the linked User (role PARTNER)."""

    class Status(models.TextChoices):
        ACCOUNT_PENDING = 'account_pending', 'Account Creation Pending'
        ACTIVE = 'active', 'Active'
        SUSPENDED = 'suspended', 'Suspended'
        INACTIVE = 'inactive', 'Inactive'
        DELETED = 'deleted', 'Deleted'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        'users.User', on_delete=models.CASCADE, related_name='partner',
    )
    application = models.ForeignKey(
        PartnerApplication, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='partners',
    )
    partner_type = models.ForeignKey(
        PartnerType, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='partners',
    )
    applicant_kind = models.CharField(max_length=20, choices=ApplicantKind.choices)
    display_name = models.CharField(max_length=180)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    # --- Public profile (CEO-moderated) -------------------------------------
    is_public = models.BooleanField(default=False)
    public_slug = models.SlugField(max_length=180, unique=True, null=True, blank=True)
    public_name = models.CharField(max_length=180, blank=True, default='')
    public_description = models.TextField(blank=True, default='')
    public_website = models.URLField(blank=True, default='')
    logo_url = models.TextField(blank=True, default='')

    # --- Lifecycle / inactivity --------------------------------------------
    account_created_at = models.DateTimeField(default=timezone.now)
    last_login_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(null=True, blank=True)
    # Deadline after which an unused account is auto-deleted (set at creation,
    # cleared the moment the account is genuinely used).
    inactivity_deadline = models.DateTimeField(null=True, blank=True)
    inactivity_warnings_sent = models.PositiveSmallIntegerField(default=0)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deletion_reason = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['is_public']),
            models.Index(fields=['inactivity_deadline']),
        ]

    @property
    def referral_code(self):
        return getattr(self.user, 'referral_code', '') or ''

    def __str__(self):
        return f'{self.display_name} ({self.get_status_display()})'


class ReferralClick(TimeStampedModel):
    """One visit to a partner's referral link. Clicks are counted separately
    from schools — a click is never a successful referral on its own, and
    repeat visits from the same source are de-duplicated for a short window."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referral_code = models.CharField(max_length=12, db_index=True)
    partner = models.ForeignKey(
        Partner, on_delete=models.CASCADE, null=True, blank=True, related_name='clicks',
    )
    # Hashed visitor fingerprint (never the raw IP), for de-duplication only.
    visitor_hash = models.CharField(max_length=64, blank=True, default='', db_index=True)
    path = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['referral_code', 'created_at'])]

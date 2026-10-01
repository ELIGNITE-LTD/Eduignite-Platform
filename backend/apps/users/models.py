import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.core.validators import RegexValidator, MinValueValidator


class UserRole(models.TextChoices):
    SUPER_ADMIN = 'SUPER_ADMIN', 'Super Admin'
    CEO = 'CEO', 'Chief Executive Officer'
    CTO = 'CTO', 'Chief Technology Officer'
    COO = 'COO', 'Chief Operations Officer'
    INV = 'INV', 'Investor'
    DESIGNER = 'DESIGNER', 'Designer'
    SCHOOL_ADMIN = 'SCHOOL_ADMIN', 'School Administrator'
    SUB_ADMIN = 'SUB_ADMIN', 'Sub Administrator'
    TEACHER = 'TEACHER', 'Teacher'
    STUDENT = 'STUDENT', 'Student'
    PARENT = 'PARENT', 'Parent'
    BURSAR = 'BURSAR', 'Bursar'
    LIBRARIAN = 'LIBRARIAN', 'Librarian'
    # EduIgnite Academy Path B: an independent learner with no School OS
    # tenant (see apps.academy). Additive only — every choice above this
    # line keeps its existing semantics unchanged.
    ACADEMY_LEARNER = 'ACADEMY_LEARNER', 'Academy Learner'
    # Someone who uses EduIgnite AI from a chat app (Telegram, later WhatsApp)
    # without an EduIgnite account. Has no school and cannot sign in to the
    # apps; linking a real account moves their bought credits across.
    AI_GUEST = 'AI_GUEST', 'EduIgnite AI Guest'


class UserManager(BaseUserManager):
    """Custom user manager for User model."""

    def create_user(self, matricule, name, email, role, password=None, **extra_fields):
        """Create and save a regular user."""
        if not matricule:
            raise ValueError('The Matricule field must be set')
        if not email:
            raise ValueError('The Email field must be set')
        if not role:
            raise ValueError('The Role field must be set')

        email = self.normalize_email(email)
        user = self.model(
            matricule=matricule,
            name=name,
            email=email,
            role=role,
            **extra_fields,
        )
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, matricule, name, email, password=None, **extra_fields):
        """Create and save a superuser."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('role', UserRole.SUPER_ADMIN)

        if not extra_fields.get('is_staff'):
            raise ValueError('Superuser must have is_staff=True')
        if not extra_fields.get('is_superuser'):
            raise ValueError('Superuser must have is_superuser=True')

        return self.create_user(matricule, name, email, password=password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom user model for EduIgnite platform."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    uid = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        verbose_name='Firebase UID',
    )
    matricule = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name='Matricule',
    )
    # Shared in public links, so it is deliberately not the matricule: that
    # is the name people sign in with, and putting it in a link someone
    # forwards around would hand out half of their credentials and let
    # anyone confirm which accounts exist.
    referral_code = models.CharField(
        max_length=12, unique=True, null=True, blank=True, db_index=True
    )
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True, db_index=True)
    phone = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        validators=[
            RegexValidator(
                regex=r'^\+?1?\d{9,15}$',
                message='Enter a valid phone number',
            ),
        ],
    )
    whatsapp = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        validators=[
            RegexValidator(
                regex=r'^\+?1?\d{9,15}$',
                message='Enter a valid WhatsApp number',
            ),
        ],
    )
    role = models.CharField(
        max_length=50,
        choices=UserRole.choices,
        default=UserRole.STUDENT,
        db_index=True,
    )
    previous_role = models.CharField(
        max_length=50,
        choices=UserRole.choices,
        null=True,
        blank=True,
        help_text='Last non-admin staff role preserved when a user is temporarily assigned as a sub administrator.',
    )
    EMPLOYMENT_TYPE_CHOICES = [
        ('civil_servant', 'Civil Servant'),
        ('pta', 'PTA'),
    ]
    employment_type = models.CharField(
        max_length=20,
        choices=EMPLOYMENT_TYPE_CHOICES,
        blank=True,
        default='',
        help_text='For teaching staff: Civil Servant (government) or PTA (locally paid).',
    )
    school = models.ForeignKey(
        'schools.School',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
    )
    sub_school = models.ForeignKey(
        'schools.SubSchool',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff_members',
    )
    avatar = models.TextField(null=True, blank=True)
    is_license_paid = models.BooleanField(default=False)
    ai_request_count = models.IntegerField(default=0)
    # Which AI plan this account is on. No longer read: AI use is now paid
    # for in AI credits (see apps.ai_features.credit_engine). Kept so the
    # column and any values in it survive until a decision is taken on plans.
    ai_plan = models.CharField(max_length=20, default='free', db_index=True)
    # Set when a principal resets a student's password: the temporary
    # password works once to sign in, then the student must choose their own.
    must_change_password = models.BooleanField(default=False)
    annual_avg = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Annual Average',
    )
    is_active = models.BooleanField(default=True)
    is_drafted = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Soft-deleted users live in Draft for six months before permanent deletion.',
    )
    drafted_at = models.DateTimeField(null=True, blank=True)
    draft_delete_after = models.DateTimeField(null=True, blank=True)
    draft_reason = models.TextField(blank=True)
    draft_last_reminder_at = models.DateTimeField(null=True, blank=True)
    draft_reminder_count = models.PositiveSmallIntegerField(default=0)
    drafted_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='drafted_users',
    )
    # Suspension: a school admin can temporarily block a user's access and lift
    # it again at any time. suspended_until = null means an indefinite suspension.
    is_suspended = models.BooleanField(default=False, db_index=True)
    suspended_until = models.DateTimeField(null=True, blank=True)
    suspension_reason = models.TextField(blank=True)
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspended_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='suspended_users',
    )
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = 'matricule'
    REQUIRED_FIELDS = ['name', 'email', 'role']

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        db_table = 'users'
        ordering = ['-date_joined']
        indexes = [
            models.Index(fields=['matricule']),
            models.Index(fields=['email']),
            models.Index(fields=['role']),
            models.Index(fields=['school']),
            models.Index(fields=['sub_school']),
            models.Index(fields=['previous_role']),
            models.Index(fields=['is_drafted', 'draft_delete_after']),
        ]

    def __str__(self):
        return f'{self.matricule} - {self.name}'

    def get_full_name(self):
        return self.name

    def get_short_name(self):
        return self.name.split()[0] if self.name else self.matricule

    @property
    def is_platform_executive(self):
        """Check if user is a platform executive."""
        executive_roles = [
            UserRole.SUPER_ADMIN,
            UserRole.CEO,
            UserRole.CTO,
            UserRole.COO,
            UserRole.INV,
            UserRole.DESIGNER,
        ]
        return self.role in executive_roles

    @property
    def is_school_admin(self):
        """Check if user is a school administrator."""
        admin_roles = [UserRole.SCHOOL_ADMIN, UserRole.SUB_ADMIN]
        return self.role in admin_roles

    @property
    def is_currently_suspended(self):
        """True while a suspension is in force. A suspension whose end date has
        passed is treated as lifted (callers should persist that when seen)."""
        if not self.is_suspended:
            return False
        if self.suspended_until is not None:
            from django.utils import timezone
            return self.suspended_until > timezone.now()
        return True

    def lift_suspension(self, save=True):
        """Clear suspension state and restore access (unless still drafted)."""
        self.is_suspended = False
        self.suspended_until = None
        self.suspension_reason = ''
        self.suspended_at = None
        self.suspended_by = None
        if not self.is_drafted:
            self.is_active = True
        if save:
            self.save(update_fields=[
                'is_suspended', 'suspended_until', 'suspension_reason',
                'suspended_at', 'suspended_by', 'is_active',
            ])

    @property
    def is_school_staff(self):
        """Check if user is school staff (non-executive)."""
        staff_roles = [
            UserRole.TEACHER,
            UserRole.BURSAR,
            UserRole.LIBRARIAN,
            UserRole.SCHOOL_ADMIN,
            UserRole.SUB_ADMIN,
        ]
        return self.role in staff_roles

    @property
    def display_role(self):
        """Get human-readable role name."""
        return self.get_role_display()

    def save(self, *args, **kwargs):
        """Override save to handle special cases."""
        if self.sub_school and not self.school_id:
            self.school = self.sub_school.school
        if self.is_platform_executive:
            self.is_staff = True
        super().save(*args, **kwargs)


class FounderAccessLevel(models.TextChoices):
    READ_ONLY = 'READ_ONLY', 'Read Only'
    FULL = 'FULL', 'Full Access'


class FounderProfile(models.Model):
    """Founder board profile with share ownership metadata."""

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='founder_profile',
    )
    founder_title = models.CharField(max_length=255)
    primary_share_percentage = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'))
    primary_share_units = models.PositiveIntegerField(
        default=0,
        help_text='Share allocation as a whole number of shares, held alongside the percentage.',
    )
    is_primary_founder = models.BooleanField(default=False)
    can_be_removed = models.BooleanField(default=True)

    # Renewable shares governance
    has_renewable_shares = models.BooleanField(
        default=False,
        help_text='CEO/CTO determines if this founder has shares that must be periodically renewed.',
    )
    share_renewal_period_days = models.PositiveIntegerField(
        default=365,
        validators=[MinValueValidator(1)],
        help_text='Number of days in the renewal period before shares expire.',
    )
    shares_expire_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the founder\'s board participation expires (renewable shares only).',
    )

    # Activity permission level
    access_level = models.CharField(
        max_length=20,
        choices=FounderAccessLevel.choices,
        default=FounderAccessLevel.FULL,
        help_text='READ_ONLY founders can view but cannot perform write operations.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'founder_profiles'
        ordering = ['-is_primary_founder', 'user__date_joined']
        indexes = [
            models.Index(fields=['is_primary_founder'], name='founder_pro_is_prim_4ef813_idx'),
            models.Index(fields=['can_be_removed'], name='founder_pro_can_be__7be4be_idx'),
            models.Index(fields=['shares_expire_at'], name='founder_pro_shares_expire_idx'),
            models.Index(fields=['access_level'], name='founder_pro_access_level_idx'),
        ]

    def __str__(self):
        return f'{self.user.name} Founder Profile'

    @property
    def additional_share_percentage(self):
        """Sum only non-expired share adjustments."""
        now = timezone.now()
        total = self.share_adjustments.filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
        ).aggregate(total=models.Sum('percentage')).get('total')
        return total or Decimal('0.00')

    @property
    def total_share_percentage(self):
        return (self.primary_share_percentage or Decimal('0.00')) + self.additional_share_percentage

    @property
    def additional_share_units(self):
        """Units from non-expired adjustments — mirrors the percentage rule."""
        now = timezone.now()
        total = self.share_adjustments.filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
        ).aggregate(total=models.Sum('units')).get('total')
        return int(total or 0)

    @property
    def total_share_units(self):
        return int(self.primary_share_units or 0) + self.additional_share_units

    @property
    def is_share_expired(self):
        """Returns True if renewable shares have expired."""
        if not self.has_renewable_shares or not self.shares_expire_at:
            return False
        return self.shares_expire_at <= timezone.now()

    @property
    def days_until_share_expiry(self):
        """Days remaining until shares expire, or None if not renewable."""
        if not self.has_renewable_shares or not self.shares_expire_at:
            return None
        delta = self.shares_expire_at - timezone.now()
        return max(0, delta.days)


class FounderShareAdjustment(models.Model):
    """Incremental share allocations granted over time, with a mandatory time frame."""

    founder = models.ForeignKey(
        FounderProfile,
        on_delete=models.CASCADE,
        related_name='share_adjustments',
    )
    percentage = models.DecimalField(max_digits=6, decimal_places=2)
    units = models.PositiveIntegerField(
        default=0,
        help_text='Whole shares granted by this allocation, alongside the percentage.',
    )
    note = models.CharField(max_length=255, blank=True)
    added_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='founder_share_adjustments_added',
    )
    # Time frame: shares are locked until expires_at, then auto-removed
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this share allocation expires and is automatically removed.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'founder_share_adjustments'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['founder', 'created_at'], name='founder_sha_founder_f3e8e4_idx'),
            models.Index(fields=['expires_at'], name='founder_sha_expires_idx'),
        ]

    def __str__(self):
        return f'{self.founder.user.name} +{self.percentage}%'

    @property
    def is_expired(self):
        if not self.expires_at:
            return False
        return self.expires_at <= timezone.now()

    @property
    def is_locked(self):
        """Share is locked (cannot be edited/deleted) until its time frame expires."""
        if not self.expires_at:
            return False
        return self.expires_at > timezone.now()

    @property
    def days_until_expiry(self):
        if not self.expires_at:
            return None
        delta = self.expires_at - timezone.now()
        return max(0, delta.days)

from django.db import models
from django.contrib.postgres.fields import ArrayField
from django.core.validators import MinValueValidator, MaxValueValidator
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from django.core.exceptions import ValidationError
from django.db.models import Q
from django_extensions.db.models import TimeStampedModel
import uuid
import qrcode
import base64
import logging
from io import BytesIO
from decimal import Decimal
from urllib.parse import quote

logger = logging.getLogger(__name__)


class Student(TimeStampedModel):
    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
        ('other', 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # A learner can exist without a login account (e.g. a nursery/primary pupil).
    # ``name`` and ``matricule`` below carry the identity of such a pupil; for
    # learners that have a user, the user stays the source of truth and these
    # stay empty. Always read them through display_name / display_matricule.
    user = models.OneToOneField(
        'users.User', on_delete=models.CASCADE, related_name='student_profile',
        null=True, blank=True,
    )
    name = models.CharField(max_length=255, blank=True, default='')
    matricule = models.CharField(max_length=50, null=True, blank=True)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='students')
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='students',
    )
    student_class = models.CharField(max_length=100, help_text='e.g., Form 5, Upper Sixth Science')
    class_level = models.CharField(max_length=100, default='Form 1')
    section = models.CharField(max_length=100, default='General')
    date_of_birth = models.DateField(null=True, blank=True)
    place_of_birth = models.CharField(max_length=120, blank=True, default='')
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, default='other')
    guardian_name = models.CharField(max_length=255, blank=True, default='')
    guardian_phone = models.CharField(max_length=20, blank=True, default='')
    guardian_whatsapp = models.CharField(max_length=20, null=True, blank=True)
    admission_number = models.CharField(max_length=50, db_index=True)
    admission_date = models.DateField(null=True, blank=True)
    # "Activate My Account": a student may set their own password once, after the
    # school has created their account. Separate from account status
    # (user.is_active), which stays under the school's control, and never
    # reset by a password reset.
    self_activation_used = models.BooleanField(default=False)
    self_activated_at = models.DateTimeField(null=True, blank=True)
    annual_average = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True,
                                         validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('20'))])
    is_on_honour_roll = models.BooleanField(default=False)
    qr_code = models.URLField(max_length=5000, null=True, blank=True)

    class Meta:
        ordering = ['student_class', 'user__name']
        constraints = [
            models.UniqueConstraint(fields=['school', 'admission_number'], name='students_unique_admission_number_per_school'),
            models.UniqueConstraint(
                fields=['school', 'matricule'],
                condition=Q(matricule__isnull=False),
                name='students_unique_matricule_per_school',
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'class_level']),
            models.Index(fields=['school', 'school_class']),
            models.Index(fields=['admission_number']),
        ]

    def __str__(self):
        return f"{self.display_name} ({self.admission_number})"

    @property
    def display_name(self) -> str:
        """Full name: the user's when there is a login, else the pupil's own."""
        if self.user_id:
            return self.user.get_full_name()
        return self.name

    @property
    def display_matricule(self) -> str:
        if self.user_id:
            return self.user.matricule
        return self.matricule or ''

    @property
    def display_email(self) -> str:
        return self.user.email if self.user_id else ''

    @property
    def display_avatar(self):
        return self.user.avatar if self.user_id else ''

    @property
    def has_login(self) -> bool:
        return bool(self.user_id)

    def clean(self):
        super().clean()
        if not self.user_id and not (self.name or '').strip():
            raise ValidationError({'name': 'A learner without a login account needs a name.'})
        if self.user_id and self.user.role != 'STUDENT':
            raise ValidationError({'user': 'Student profiles must be linked to a user with role STUDENT.'})
        if self.user_id and self.school_id and self.user.school_id and self.user.school_id != self.school_id:
            raise ValidationError({'school': 'Student profile school must match the linked user school.'})
        if self.school_class_id and self.school_id and self.school_class.school_id != self.school_id:
            raise ValidationError({'school_class': 'The selected class must belong to the student school.'})

    def sync_class_fields(self):
        """Copy the class-derived values from ``school_class`` onto this row.

        The class is the source of truth: the name and level always follow it,
        and so does the section when the class name names one ("Form 3
        Science"). When a student is moved to a different class whose name names
        no section, the section resets to 'General' so the old class's section is
        not carried over; otherwise a section the school chose (e.g. English /
        French) is kept. Returns the names of the fields set.
        """
        if not self.school_class_id:
            return []
        from .class_sync import enforced_class_fields

        values = enforced_class_fields(self.school_class)
        if 'section' not in values and not self._state.adding:
            previous = (
                type(self).objects.filter(pk=self.pk).values_list('school_class_id', flat=True).first()
            )
            if previous != self.school_class_id:
                values['section'] = 'General'
        for field, value in values.items():
            setattr(self, field, value)
        self.school = self.school_class.school
        return list(values) + ['school']

    def save(self, *args, **kwargs):
        derived = self.sync_class_fields()
        update_fields = kwargs.get('update_fields')
        if derived and update_fields is not None and 'school_class' in update_fields:
            kwargs['update_fields'] = list(set(update_fields) | set(derived))
        self.full_clean(exclude=['qr_code'])
        super().save(*args, **kwargs)
        update_fields = []
        if self.user_id and self.user.school_id != self.school_id:
            self.user.school = self.school
            update_fields.append('school')
        if update_fields:
            self.user.save(update_fields=update_fields)
        from apps.grades.relationships import sync_student_subject_enrollments
        from apps.fees.ledger import sync_student_school_fee_records

        try:
            sync_student_subject_enrollments(self)
        except Exception:
            logger.exception("Student subject enrollment sync failed for student %s", self.pk)

        try:
            sync_student_school_fee_records(self)
        except Exception:
            logger.exception("Student school-fee sync failed for student %s", self.pk)

    def verify_url(self):
        """Public ID-card verification URL (the single URL this card's QR encodes)."""
        from core.verification import build_verify_url

        school_ref = getattr(self.school, 'matricule', None) or self.school_id
        return build_verify_url('student', {'school': school_ref}, admission=self.admission_number)

    def generate_qr_code(self):
        """Generate a scannable verification QR code and store it as a base64 data URL."""
        from core.verification import qr_png_data_url

        self.qr_code = qr_png_data_url(self.verify_url(), box_size=10, border=4)
        type(self).objects.filter(pk=self.pk).update(qr_code=self.qr_code)


class Guardian(TimeStampedModel):
    RELATIONSHIP_CHOICES = [
        ('father', 'Father'),
        ('mother', 'Mother'),
        ('uncle', 'Uncle'),
        ('aunt', 'Aunt'),
        ('elder_sibling', 'Elder Sibling'),
        ('legal_guardian', 'Legal Guardian'),
        ('other', 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        'users.User',
        on_delete=models.CASCADE,
        related_name='guardian_profile',
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    whatsapp = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    national_id = models.CharField(max_length=50, blank=True)
    occupation = models.CharField(max_length=100, blank=True)
    students = models.ManyToManyField(Student, through='StudentGuardian', related_name='guardians')

    class Meta:
        db_table = 'guardians'
        ordering = ['name']
        indexes = [
            models.Index(fields=['phone']),
            models.Index(fields=['email']),
        ]

    def __str__(self):
        return self.name


class StudentGuardian(TimeStampedModel):
    """Many-to-many through table: Student <-> Guardian."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='guardian_links')
    guardian = models.ForeignKey(Guardian, on_delete=models.CASCADE, related_name='student_links')
    relationship = models.CharField(max_length=30, choices=Guardian.RELATIONSHIP_CHOICES)
    is_primary = models.BooleanField(default=False)
    can_pickup = models.BooleanField(default=True)
    emergency_contact = models.BooleanField(default=False)

    class Meta:
        db_table = 'student_guardians'
        unique_together = [['student', 'guardian']]
        indexes = [
            models.Index(fields=['student', 'is_primary']),
            models.Index(fields=['guardian']),
        ]

    def __str__(self):
        return f'{self.student.display_name} - {self.guardian.name}'

    def save(self, *args, **kwargs):
        if self.is_primary:
            StudentGuardian.objects.filter(student=self.student, is_primary=True).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)


class StudentPromotionRecord(TimeStampedModel):
    """School-issued annual promotion decision for a learner.

    The student matricule lives on the linked user account and is never changed
    here. Promotion only changes the current class placement.
    """

    class Status(models.TextChoices):
        # PENDING is retained only so historical rows still resolve; the
        # promotion check always reaches one of the four real outcomes below.
        PENDING = 'PENDING', 'Pending Review'
        PROMOTED = 'PROMOTED', 'Promoted'
        REPEATED = 'REPEATED', 'Repeated'
        GRADUATED = 'GRADUATED', 'Graduated'
        DISMISSED = 'DISMISSED', 'Dismissed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='promotion_records')
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='student_promotion_records')
    academic_year = models.CharField(max_length=20, db_index=True)
    current_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='promotion_records_from',
    )
    current_class_name = models.CharField(max_length=255, blank=True, default='')
    promoted_to_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='promotion_records_to',
    )
    promoted_to_class_name = models.CharField(max_length=255, blank=True, default='')
    average_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('20'))],
    )
    promotion_average = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('10.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('20'))],
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    decision_reason = models.CharField(max_length=255, blank=True, default='')
    decided_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='student_promotion_decisions',
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'student_promotion_records'
        ordering = ['current_class_name', 'student__user__name']
        unique_together = [['student', 'academic_year']]
        indexes = [
            models.Index(fields=['school', 'academic_year', 'status']),
            models.Index(fields=['current_class', 'status']),
            models.Index(fields=['promoted_to_class']),
        ]

    def __str__(self):
        return f'{self.student.admission_number} - {self.academic_year} - {self.status}'

    @property
    def is_applied(self):
        """
        Whether this decision has actually been carried out on the learner.

        A record's status is only ever a proposal until an administrator
        commits it: the status is recomputed from the annual average every time
        the promotions screen is opened, which writes PROMOTED long before
        anyone has moved the learner. Without this distinction a school reads
        "Promoted" on the screen while the learner's account is still sitting
        in last year's class.

        A promotion counts as applied only when the learner is genuinely in the
        target class. Repeats and graduations change no class, so for those the
        recorded decision is enough.
        """
        if not self.decided_by_id:
            return False
        if self.status == self.Status.PROMOTED:
            return bool(self.promoted_to_class_id) and (
                self.student.school_class_id == self.promoted_to_class_id
            )
        return self.status in (self.Status.REPEATED, self.Status.GRADUATED, self.Status.DISMISSED)

    def save(self, *args, **kwargs):
        if self.student_id and not self.school_id:
            self.school = self.student.school
        if self.current_class_id and not self.current_class_name:
            self.current_class_name = self.current_class.name
        if self.promoted_to_class_id:
            self.promoted_to_class_name = self.promoted_to_class.name
        if self.status != self.Status.PENDING and not self.decided_at:
            from django.utils import timezone

            self.decided_at = timezone.now()
        super().save(*args, **kwargs)


class StudentMoveLog(models.Model):
    """Audit row for every pupil moved by the Basic Education "Move pupils" tool."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch_id = models.UUIDField(db_index=True)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='student_move_logs')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='move_logs')
    moved_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    from_class = models.ForeignKey('schools.SchoolClass', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    from_class_name = models.CharField(max_length=255, blank=True, default='')
    to_class = models.ForeignKey('schools.SchoolClass', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    to_class_name = models.CharField(max_length=255, blank=True, default='')
    crossed_level = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'student_move_logs'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['school', 'created_at'])]


class ClassPromotionPolicy(TimeStampedModel):
    """Principal-approved promotion average for one class in one academic year."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='class_promotion_policies')
    school_class = models.ForeignKey('schools.SchoolClass', on_delete=models.CASCADE, related_name='promotion_policies')
    academic_year = models.CharField(max_length=20, db_index=True)
    promotion_average = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('10.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('20'))],
    )
    decided_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_promotion_policies',
    )

    class Meta:
        db_table = 'class_promotion_policies'
        unique_together = [['school_class', 'academic_year']]
        ordering = ['school_class__name', '-academic_year']
        indexes = [
            models.Index(fields=['school', 'academic_year']),
            models.Index(fields=['school_class', 'academic_year']),
        ]

    def __str__(self):
        return f'{self.school_class.name} - {self.academic_year} - {self.promotion_average}/20'

    def clean(self):
        super().clean()
        if self.school_class_id and self.school_id and self.school_class.school_id != self.school_id:
            raise ValidationError({'school_class': 'Promotion policy class must belong to the selected school.'})

    def save(self, *args, **kwargs):
        if self.school_class_id and not self.school_id:
            self.school = self.school_class.school
        self.full_clean()
        super().save(*args, **kwargs)


class ParentStudentLink(TimeStampedModel):
    RELATIONSHIP_CHOICES = [
        ('father', 'Father'),
        ('mother', 'Mother'),
        ('guardian', 'Guardian'),
        ('uncle', 'Uncle'),
        ('aunt', 'Aunt'),
        ('elder_sibling', 'Elder Sibling'),
        ('legal_guardian', 'Legal Guardian'),
        ('other', 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey('users.User', on_delete=models.CASCADE,
                               related_name='linked_students',
                               limit_choices_to={'role': 'PARENT'})
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='parent_links')
    relationship = models.CharField(max_length=20, choices=RELATIONSHIP_CHOICES)
    is_primary = models.BooleanField(default=False)

    class Meta:
        unique_together = [['parent', 'student']]
        constraints = [
            models.UniqueConstraint(
                fields=['student'],
                condition=Q(is_primary=True),
                name='students_one_primary_parent_per_student',
            ),
        ]
        indexes = [
            models.Index(fields=['parent', 'student']),
            models.Index(fields=['student', 'is_primary']),
        ]

    def __str__(self):
        return f"{self.parent.get_full_name()} - {self.student.display_name} ({self.relationship})"

    def clean(self):
        super().clean()
        if self.parent_id and self.parent.role != 'PARENT':
            raise ValidationError({'parent': 'Parent/student links must be attached to a user with role PARENT.'})
        if self.parent_id and self.student_id and self.parent.school_id and self.student.school_id and self.parent.school_id != self.student.school_id:
            raise ValidationError({'parent': 'Parent and student must belong to the same school.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        if self.student_id and not self.parent.school_id:
            self.parent.school = self.student.school
            self.parent.save(update_fields=['school'])
        # Ensure only one primary parent per student before the database constraint is checked.
        if self.is_primary:
            ParentStudentLink.objects.filter(student=self.student, is_primary=True).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)


class StudentActivationToken(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='student_activation_tokens')
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activation_tokens',
    )
    matricule = models.CharField(max_length=50, unique=True, db_index=True)
    student_name = models.CharField(max_length=255, blank=True, default='')
    student_class = models.CharField(max_length=100)
    class_level = models.CharField(max_length=100, default='Form 1')
    section = models.CharField(max_length=100, default='General')
    department = models.CharField(max_length=100, blank=True, default='')
    stream = models.CharField(max_length=100, blank=True, default='')
    batch_name = models.CharField(max_length=255, blank=True, default='')
    generated_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generated_student_activation_tokens',
    )
    is_used = models.BooleanField(default=False)
    used_by = models.OneToOneField(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='used_student_activation_token',
    )
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['student_class', 'matricule']
        indexes = [
            models.Index(fields=['school', 'student_class']),
            models.Index(fields=['school', 'is_used']),
        ]

    def __str__(self):
        return f'{self.matricule} - {self.student_class}'

    def save(self, *args, **kwargs):
        if self.school_class_id:
            from .class_sync import enforced_class_fields

            for field, value in enforced_class_fields(self.school_class).items():
                setattr(self, field, value)
            if not self.school_id:
                self.school = self.school_class.school
        super().save(*args, **kwargs)


class StudentHealthProfile(TimeStampedModel):
    """Basic Education: one sensitive health sheet per pupil.

    Readable only by the school's administrators, the pupil's class teacher and
    the pupil's linked parents (see ``apps.students.school_life``).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='student_health_profiles')
    student = models.OneToOneField(Student, on_delete=models.CASCADE, related_name='health_profile')
    blood_group = models.CharField(max_length=5, blank=True, default='')
    allergies = models.TextField(blank=True, default='')
    conditions = models.TextField(blank=True, default='')
    emergency_contact_name = models.CharField(max_length=255, blank=True, default='')
    emergency_contact_phone = models.CharField(max_length=30, blank=True, default='')
    doctor_name = models.CharField(max_length=255, blank=True, default='')
    doctor_phone = models.CharField(max_length=30, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    updated_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )

    class Meta:
        indexes = [models.Index(fields=['school'])]

    def __str__(self):
        return f'Health sheet of {self.student.display_name}'


class StudentHealthEntry(TimeStampedModel):
    """A dated health event for a pupil (sickness, injury, check-up, medication)."""

    KIND_CHOICES = [
        ('illness', 'Illness'),
        ('injury', 'Injury'),
        ('checkup', 'Check-up'),
        ('medication', 'Medication'),
        ('other', 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='student_health_entries')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='health_entries')
    entry_date = models.DateField()
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='other')
    note = models.TextField()
    recorded_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )

    class Meta:
        ordering = ['-entry_date', '-created']
        indexes = [models.Index(fields=['school', 'student', '-entry_date'])]


class StudentCertificate(TimeStampedModel):
    """A certificate issued to a Basic Education pupil (merit, attendance, ...)."""

    KIND_CHOICES = [
        ('merit', 'Merit'),
        ('attendance', 'Attendance'),
        ('conduct', 'Good conduct'),
        ('completion', 'Completion'),
        ('enrolment', 'Enrolment'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='student_certificates')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='certificates')
    number = models.CharField(max_length=30)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    issued_on = models.DateField()
    academic_year = models.CharField(max_length=20, blank=True, default='')
    remark = models.TextField(blank=True, default='')
    issued_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )

    class Meta:
        ordering = ['-issued_on', '-created']
        constraints = [
            models.UniqueConstraint(fields=['school', 'number'], name='students_unique_certificate_number_per_school'),
        ]
        indexes = [models.Index(fields=['school', 'student'])]

    def __str__(self):
        return f'{self.number} ({self.kind})'

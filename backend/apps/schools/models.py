import uuid
from decimal import Decimal

from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator

from apps.users.matricules import generate_school_matricule as build_school_matricule


def generate_school_matricule(school_name: str, short_name: str = '') -> str:
    """Backward-compatible wrapper for the standardized school matricule."""
    return build_school_matricule(school_name, short_name=short_name)


class TimeStampedModel(models.Model):
    """Abstract base model with timestamp fields."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SchoolStatus(models.TextChoices):
    """School operational status."""
    ACTIVE = 'Active', 'Active'
    SUSPENDED = 'Suspended', 'Suspended'
    PENDING = 'Pending', 'Pending'


class School(TimeStampedModel):
    """School model for EduIgnite platform."""

    SCHOOL_TYPE_CHOICES = [
        ('general', 'General Education (Enseignement Général)'),
        ('technical', 'Technical & Vocational (Enseignement Technique)'),
        ('mixed', 'Mixed (General + Technical)'),
    ]

    SUBSYSTEM_CHOICES = [
        ('francophone', 'Francophone'),
        ('anglophone', 'Anglophone'),
        ('bilingual', 'Bilingual (Both)'),
    ]

    id = models.CharField(
        max_length=50,
        primary_key=True,
        verbose_name='School ID',
        help_text='e.g., GBHS-D',
    )
    name = models.CharField(max_length=255, unique=True)
    short_name = models.CharField(max_length=50)
    principal = models.CharField(max_length=255)
    principal_user = models.OneToOneField(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='school_principal',
    )
    motto = models.CharField(max_length=255, blank=True)
    logo = models.TextField(null=True, blank=True)
    banner = models.TextField(null=True, blank=True)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=255)
    school_type = models.CharField(
        max_length=20,
        choices=SCHOOL_TYPE_CHOICES,
        default='general',
    )
    subsystem = models.CharField(
        max_length=20,
        choices=SUBSYSTEM_CHOICES,
        default='francophone',
    )
    # Education level served by the school. Distinct from school_type, which is
    # the curriculum track. Default 'secondary' keeps every existing school as is.
    EDUCATION_CATEGORY_BASIC = 'basic'
    EDUCATION_CATEGORY_SECONDARY = 'secondary'
    EDUCATION_CATEGORY_HIGHER = 'higher'
    EDUCATION_CATEGORY_CHOICES = [
        (EDUCATION_CATEGORY_BASIC, 'Basic Education'),
        (EDUCATION_CATEGORY_SECONDARY, 'Secondary Education'),
        (EDUCATION_CATEGORY_HIGHER, 'Higher Education'),
    ]
    #: Sections a basic school may enable in SchoolSettings.sections.
    BASIC_EDUCATION_SECTIONS = ['nursery', 'primary']
    education_category = models.CharField(
        max_length=20,
        choices=EDUCATION_CATEGORY_CHOICES,
        default=EDUCATION_CATEGORY_SECONDARY,
    )
    region = models.CharField(
        max_length=100,
        choices=[
            ('Adamaoua', 'Adamaoua'),
            ('Centre', 'Centre'),
            ('Est', 'Est'),
            ('Extrême-Nord', 'Extrême-Nord'),
            ('Littoral', 'Littoral'),
            ('Nord', 'Nord'),
            ('Nord-Ouest', 'Nord-Ouest'),
            ('Ouest', 'Ouest'),
            ('Sud', 'Sud'),
            ('Sud-Ouest', 'Sud-Ouest'),
        ],
        blank=True,
    )
    division = models.CharField(max_length=100, blank=True)
    sub_division = models.CharField(max_length=100, blank=True)
    city_village = models.CharField(max_length=100, blank=True)
    address = models.CharField(max_length=255, blank=True)
    postal_code = models.CharField(max_length=20, null=True, blank=True)
    phone = models.CharField(
        max_length=20,
        validators=[
            RegexValidator(
                regex=r'^\+?1?\d{9,15}$',
                message='Enter a valid phone number',
            ),
        ],
        blank=True,
    )
    email = models.EmailField()
    status = models.CharField(
        max_length=20,
        choices=SchoolStatus.choices,
        default=SchoolStatus.PENDING,
    )
    founded_year = models.IntegerField(null=True, blank=True)
    student_count = models.IntegerField(default=0)
    teacher_count = models.IntegerField(default=0)

    # --- Yearly school subscription ---------------------------------------
    # A school can settle one yearly subscription that activates all of its
    # users except parents, instead of each person paying their own way. The
    # yearly amount is set by the founders per school, on its own; the status
    # is a separate control the founders change, and the school admin can pay
    # to move it to 'paid' for a year.
    #
    # Default is 'free' on purpose: every school that predates this feature
    # keeps working untouched, and gating only begins when a founder sets a
    # school to 'unpaid'.
    SUBSCRIPTION_FREE = 'free'
    SUBSCRIPTION_PAID = 'paid'
    SUBSCRIPTION_UNPAID = 'unpaid'
    SUBSCRIPTION_CHOICES = [
        (SUBSCRIPTION_FREE, 'Free'),
        (SUBSCRIPTION_PAID, 'Paid'),
        (SUBSCRIPTION_UNPAID, 'Unpaid'),
    ]
    subscription_status = models.CharField(
        max_length=10, choices=SUBSCRIPTION_CHOICES, default=SUBSCRIPTION_FREE, db_index=True,
    )
    subscription_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Yearly amount a school pays to keep all its users active. Set by founders.',
    )
    subscription_currency = models.CharField(max_length=3, default='XAF')
    #: When a paid subscription lapses. A paid school past this date is treated
    #: as unpaid and must renew. Set a year out whenever the school is paid.
    subscription_expires_on = models.DateField(null=True, blank=True)
    #: When a free period ends. Blank means free indefinitely. A past date on a
    #: 'free' school is treated as unpaid.
    subscription_free_until = models.DateField(null=True, blank=True)
    subscription_paid_at = models.DateTimeField(null=True, blank=True)
    subscription_updated_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='school_subscriptions_set',
    )
    subscription_note = models.TextField(blank=True, default='')
    matricule = models.CharField(
        max_length=50,
        unique=True,
        blank=True,
        null=True,
        help_text='Auto-generated activation matricule based on school name.',
    )
    is_drafted = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Soft-deleted schools live in Draft for six months before permanent deletion.',
    )
    drafted_at = models.DateTimeField(null=True, blank=True)
    draft_delete_after = models.DateTimeField(null=True, blank=True)
    draft_reason = models.TextField(blank=True)
    draft_last_reminder_at = models.DateTimeField(null=True, blank=True)
    draft_reminder_count = models.PositiveSmallIntegerField(default=0)
    drafted_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='drafted_schools',
    )
    public_profile_enabled = models.BooleanField(
        default=True,
        help_text=(
            'Publish this school\'s public profile page. It shows only the '
            'school\'s own descriptive and contact details, never people or finances.'
        ),
    )
    public_slug = models.SlugField(
        max_length=90,
        unique=True,
        null=True,
        blank=True,
        help_text='Address of the public profile page: /school/<public_slug>.',
    )
    public_staff_directory_enabled = models.BooleanField(
        default=False,
        help_text=(
            'Show a staff directory on the public profile. Off by default; even '
            'when on, only staff who personally opted in appear, with name, '
            'public title and photo only - never contact details.'
        ),
    )

    class Meta:
        verbose_name = 'School'
        verbose_name_plural = 'Schools'
        db_table = 'schools'
        ordering = ['name']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['region']),
            models.Index(fields=['is_drafted', 'draft_delete_after']),
        ]

    def save(self, *args, **kwargs):
        if not self.matricule and self.name:
            self.matricule = generate_school_matricule(self.name, self.short_name)
        if not self.public_slug and self.name:
            from .public_slugs import unique_public_slug

            self.public_slug = unique_public_slug(self)
            update_fields = kwargs.get('update_fields')
            if update_fields is not None:
                kwargs['update_fields'] = {*update_fields, 'public_slug'}
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.name} ({self.id})'

    def update_student_count(self):
        """Update cached student count from users."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.student_count = User.objects.filter(
            school=self,
            role='STUDENT',
        ).count()
        self.save(update_fields=['student_count'])

    def update_teacher_count(self):
        """Update cached teacher count from users."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.teacher_count = User.objects.filter(
            school=self,
            role='TEACHER',
        ).count()
        self.save(update_fields=['teacher_count'])


class SchoolSettings(models.Model):
    """Settings for individual schools."""

    school = models.OneToOneField(School, on_delete=models.CASCADE, related_name='settings')
    licence_expiry = models.DateField(null=True, blank=True)
    max_students = models.IntegerField(default=500)
    max_teachers = models.IntegerField(default=50)
    academic_year = models.CharField(
        max_length=20,
        default='2024-2025',
        help_text='e.g., 2024-2025',
    )
    term = models.CharField(
        max_length=20,
        choices=[
            ('First', 'First Term'),
            ('Second', 'Second Term'),
            ('Third', 'Third Term'),
        ],
        default='First',
    )
    allow_ai_features = models.BooleanField(default=True)
    ai_request_limit = models.IntegerField(default=1000)
    class_masters_can_edit_students = models.BooleanField(
        default=False,
        help_text='When on, class masters can view and edit the students of their own class (no payments).',
    )
    honour_roll_threshold = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('12.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('20'))],
        help_text='Minimum average on the Cameroon 0-20 scale for academic reward eligibility.',
    )
    promotion_average = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('10.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('20'))],
        help_text='Minimum annual average on the Cameroon 0-20 scale required for automatic promotion.',
    )
    dismissal_average = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('20'))],
        help_text=(
            'Annual average below which a learner is dismissed rather than asked to repeat. '
            'Left at 0 no learner is ever dismissed, which is the default.'
        ),
    )
    sections = models.JSONField(
        default=list,
        blank=True,
        help_text='School sections such as English, French, Bilingual or Technical.',
    )
    class_levels = models.JSONField(
        default=list,
        blank=True,
        help_text='Registered class levels such as Form 1, Form 2, Lower Sixth.',
    )
    departments = models.JSONField(
        default=list,
        blank=True,
        help_text='Academic or administrative departments in the school.',
    )
    streams = models.JSONField(
        default=list,
        blank=True,
        help_text='Optional streams/specialisations such as General, Commercial, Industrial.',
    )
    assessment_config = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            'Per-school assessment configuration (max_score, pass_mark, grade_bands, '
            'sequences_per_term, use_coefficients, show_rank, grading_style, descriptive_bands). '
            'Empty means the Cameroon secondary defaults. Only Basic Education schools may change it. '
            'Resolve it through apps.grades.assessment_config.get_assessment_config.'
        ),
    )

    class Meta:
        verbose_name = 'School Settings'
        verbose_name_plural = 'School Settings'
        db_table = 'school_settings'

    def __str__(self):
        return f'{self.school.name} Settings'


class SubSchool(TimeStampedModel):
    """Operational subdivision inside a school."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='sub_schools')
    name = models.CharField(max_length=255)
    is_system_managed = models.BooleanField(
        default=False,
        db_index=True,
        help_text='True for sections generated from the school type/subsystem map; false for custom school-created sections.',
    )
    vice_principal = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vice_principal_sub_schools',
    )

    class Meta:
        db_table = 'sub_schools'
        ordering = ['name']
        unique_together = [['school', 'name']]
        indexes = [
            models.Index(fields=['school', 'name']),
        ]

    def __str__(self):
        return f'{self.name} - {self.school.short_name}'


class SchoolClass(TimeStampedModel):
    """Relational class registry for a school."""

    class Cycle(models.TextChoices):
        FIRST = 'first', 'First Cycle'
        SECOND = 'second', 'Second Cycle'
        NURSERY = 'nursery', 'Nursery'
        PRIMARY = 'primary', 'Primary'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='school_classes')
    sub_school = models.ForeignKey(
        SubSchool,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='classes',
    )
    name = models.CharField(max_length=255)
    # Cameroon secondary schools run two cycles: First Cycle (Forms 1-5 /
    # 6e-3e) and Second Cycle (Lower & Upper Sixth). Each class belongs to one.
    cycle = models.CharField(max_length=10, choices=Cycle.choices, default=Cycle.FIRST)
    class_master = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mastered_classes',
    )

    class Meta:
        db_table = 'school_classes'
        ordering = ['name']
        unique_together = [['school', 'name']]
        indexes = [
            models.Index(fields=['school', 'name']),
            models.Index(fields=['sub_school', 'name']),
        ]

    def __str__(self):
        return f'{self.name} - {self.school.short_name}'

    def save(self, *args, **kwargs):
        old_name = None
        is_new = self._state.adding
        if self.pk:
            old_name = type(self).objects.filter(pk=self.pk).values_list('name', flat=True).first()

        super().save(*args, **kwargs)

        # Students copy a few details from their class (name, level, section).
        # Whatever changed on the class, they must follow it. Sub-school and
        # cycle are read through the class, so they follow automatically.
        if not is_new:
            from apps.students import api as students_api

            students_api.sync_class_students(self)

        if old_name and old_name != self.name:
            from apps.assignments.models import Assignment
            from apps.attendance.models import AttendanceSession
            from apps.exams.models import Exam
            from apps.live_classes.models import LiveClass
            from apps.students import api as students_api

            students_api.relabel_class(self.school, old_name, self)
            Assignment.objects.filter(school=self.school, target_class=old_name).update(
                school_class=self,
                target_class=self.name,
            )
            Exam.objects.filter(school=self.school, target_class=old_name).update(
                school_class=self,
                target_class=self.name,
            )
            AttendanceSession.objects.filter(school=self.school, student_class=old_name).update(
                school_class=self,
                student_class=self.name,
            )
            LiveClass.objects.filter(school=self.school, target_class=old_name).update(
                school_class=self,
                target_class=self.name,
            )


class ClassTeacherAssignment(models.Model):
    """A teacher assigned to a whole class (Basic Education class-centred teaching).

    Additive to ``SchoolClass.class_master`` and ``grades.ClassSubject.teacher``.
    In schools whose ``education_category`` is ``basic`` an assigned teacher can
    work with every configured subject of the class without a per-subject
    assignment. Secondary and higher schools keep subject-specific assignment;
    rows may exist there but grant no extra access.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school_class = models.ForeignKey(
        SchoolClass,
        on_delete=models.CASCADE,
        related_name='teacher_assignments',
    )
    teacher = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='class_teacher_assignments',
        limit_choices_to={'role': 'TEACHER'},
    )
    is_lead = models.BooleanField(default=False, help_text='Lead (main) teacher of the class.')
    academic_year = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'school_class_teacher_assignments'
        ordering = ['school_class__name', '-is_lead', 'teacher__name']
        constraints = [
            models.UniqueConstraint(
                fields=['school_class', 'teacher', 'academic_year'],
                name='unique_class_teacher_assignment_per_year',
            ),
        ]
        indexes = [
            models.Index(fields=['teacher', 'school_class']),
        ]

    def __str__(self):
        return f'{self.teacher_id} -> {self.school_class_id} ({self.academic_year or "any year"})'

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.teacher_id and self.school_class_id:
            if self.teacher.role != 'TEACHER':
                raise ValidationError({'teacher': 'Only users with the teacher role can be assigned to a class.'})
            if self.teacher.school_id != self.school_class.school_id:
                raise ValidationError({'teacher': 'Teacher must belong to the same school as the class.'})


class TimetableEntry(TimeStampedModel):
    """Published or draft teaching period for a Cameroon secondary school class."""

    class DayOfWeek(models.IntegerChoices):
        MONDAY = 1, 'Monday'
        TUESDAY = 2, 'Tuesday'
        WEDNESDAY = 3, 'Wednesday'
        THURSDAY = 4, 'Thursday'
        FRIDAY = 5, 'Friday'
        SATURDAY = 6, 'Saturday'

    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        PUBLISHED = 'PUBLISHED', 'Published'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='timetable_entries')
    sub_school = models.ForeignKey(
        SubSchool,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='timetable_entries',
    )
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='timetable_entries')
    class_subject = models.ForeignKey(
        'grades.ClassSubject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='timetable_entries',
    )
    subject = models.ForeignKey('grades.Subject', on_delete=models.CASCADE, related_name='timetable_entries')
    teacher = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='timetable_entries',
    )
    academic_year = models.CharField(max_length=20)
    term = models.CharField(
        max_length=20,
        choices=[
            ('First', 'First Term'),
            ('Second', 'Second Term'),
            ('Third', 'Third Term'),
        ],
    )
    day_of_week = models.PositiveSmallIntegerField(choices=DayOfWeek.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='published_timetable_entries',
    )
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_timetable_entries',
    )

    class Meta:
        db_table = 'school_timetable_entries'
        ordering = ['day_of_week', 'start_time', 'school_class__name']
        indexes = [
            models.Index(fields=['school', 'academic_year', 'term', 'status']),
            models.Index(fields=['school_class', 'day_of_week', 'start_time']),
            models.Index(fields=['teacher', 'day_of_week', 'start_time']),
        ]

    def __str__(self):
        return f'{self.school_class.name} - {self.subject.name} - {self.get_day_of_week_display()} {self.start_time}'

    def save(self, *args, **kwargs):
        if self.school_class:
            self.school = self.school_class.school
            self.sub_school = self.school_class.sub_school
        if not self.academic_year:
            try:
                self.academic_year = self.school.settings.academic_year
            except Exception:
                pass
        if not self.term:
            try:
                self.term = self.school.settings.term
            except Exception:
                pass
        super().save(*args, **kwargs)


SUB_SCHOOL_MAP = {
    ('general', 'anglophone'): [],
    ('general', 'francophone'): [],
    ('general', 'bilingual'): ['Anglophone General Section', 'Francophone General Section'],
    ('technical', 'anglophone'): [],
    ('technical', 'francophone'): [],
    ('technical', 'bilingual'): ['Anglophone Technical Section', 'Francophone Technical Section'],
    ('mixed', 'anglophone'): ['General Section', 'Technical Section'],
    ('mixed', 'francophone'): ['General Section', 'Technical Section'],
    ('mixed', 'bilingual'): [
        'Anglophone General Section',
        'Francophone General Section',
        'Anglophone Technical Section',
        'Francophone Technical Section',
    ],
}


def sync_sub_schools_for_school(school):
    """Keep system-managed sub-schools aligned with school type/subsystem."""
    expected_names = SUB_SCHOOL_MAP.get((school.school_type, school.subsystem), [])
    existing = {
        item.name: item
        for item in SubSchool.objects.filter(school=school).only('id', 'name', 'is_system_managed')
    }

    if not expected_names:
        SubSchool.objects.filter(school=school, is_system_managed=True).delete()
        return

    for name in expected_names:
        existing_item = existing.get(name)
        if existing_item:
            if not existing_item.is_system_managed:
                existing_item.is_system_managed = True
                existing_item.save(update_fields=['is_system_managed', 'updated_at'])
            continue
        SubSchool.objects.create(school=school, name=name, is_system_managed=True)

    stale_names = set(existing).difference(expected_names)
    if stale_names:
        SubSchool.objects.filter(school=school, name__in=stale_names, is_system_managed=True).delete()


@receiver(post_save, sender=School)
def auto_create_sub_schools(sender, instance, **kwargs):
    sync_sub_schools_for_school(instance)


class SchoolEvent(TimeStampedModel):
    """An event posted by a school's administration, visible to every user
    that belongs to that school (students, staff, parents)."""

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='events')
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='school_events',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    event_date = models.DateField(null=True, blank=True)
    location = models.CharField(max_length=255, blank=True)
    # Base64 data-URL, consistent with how the platform stores other images.
    image = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', '-created_at']),
        ]

    def __str__(self):
        return f"{self.title} ({self.school})"

"""Models backing EduIgnite Academy — the decoupled learning/certification
platform described in ``scratchpad/academy-contract.md`` (Phase 1 MVP).

EduIgnite Academy is intentionally its own Django app, separate from the
School OS domain apps, per the spec's "Ecosystem Architecture" section: it
shares identity (``users.User`` + the platform-wide JWT auth) but owns its
own courses/quizzes/certificates schema so heavy media/quiz workloads never
touch school-management tables.
"""

import secrets
import uuid

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AcademyProfile(models.Model):
    """One per User who has ever touched an Academy endpoint.

    Deliberately NOT created for every platform user up front — created
    lazily via ``AcademyProfile.objects.get_or_create(user=...)`` the first
    time a user hits an authenticated Academy endpoint (SSO handshake,
    registration, enrollment, etc.), per the contract.
    """

    user = models.OneToOneField('users.User', on_delete=models.CASCADE, related_name='academy_profile')
    headline = models.CharField(max_length=255, null=True, blank=True)
    bio = models.TextField(null=True, blank=True)
    avatar_url = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'academy_profiles'

    def __str__(self):
        return f'AcademyProfile({self.user.matricule})'


class AcademyPermission(models.Model):
    """A single, revocable scope grant. NOT derived from ``User.role`` — per
    the spec's governance model, a Course Creator "may only build courses
    formally assigned by the CEO" (a per-user grant), so even the CEO/COO's
    own scopes are real rows here (seeded by the bootstrap data migration),
    not hardcoded role checks.
    """

    class Scope(models.TextChoices):
        COURSE_CREATE = 'COURSE_CREATE', 'Course Create'
        COURSE_PUBLISH = 'COURSE_PUBLISH', 'Course Publish'
        COURSE_ASSIGN = 'COURSE_ASSIGN', 'Course Assign'
        COURSE_APPROVE = 'COURSE_APPROVE', 'Course Approve'
        PROFILE_EDIT = 'PROFILE_EDIT', 'Profile Edit'
        ACM_READ = 'ACM_READ', 'Academy Read'
        ACM_WRITE = 'ACM_WRITE', 'Academy Write'
        ANALYTICS_VIEW = 'ANALYTICS_VIEW', 'Analytics View'
        LEARNER_ACCESS = 'LEARNER_ACCESS', 'Learner Access'
        QUIZ_TAKE = 'QUIZ_TAKE', 'Quiz Take'

    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='academy_permissions')
    scope = models.CharField(max_length=30, choices=Scope.choices)
    granted_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'academy_permissions'
        ordering = ['-granted_at']
        constraints = [
            models.UniqueConstraint(fields=['user', 'scope'], name='academy_permission_unique_user_scope'),
        ]
        indexes = [
            models.Index(fields=['scope']),
        ]

    def __str__(self):
        return f'{self.user.matricule}: {self.scope}'


class Course(TimeStampedModel):
    class RolePathway(models.TextChoices):
        PRINCIPAL = 'PRINCIPAL', 'Principal'
        TEACHER = 'TEACHER', 'Teacher'
        ACCOUNTANT = 'ACCOUNTANT', 'Accountant'
        LIBRARIAN = 'LIBRARIAN', 'Librarian'
        GENERAL = 'GENERAL', 'General'

    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        PENDING_REVIEW = 'PENDING_REVIEW', 'Pending Review'
        PUBLISHED = 'PUBLISHED', 'Published'

    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=280, unique=True)
    description = models.TextField(blank=True, default='')
    role_pathway = models.CharField(max_length=20, choices=RolePathway.choices, default=RolePathway.GENERAL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    created_by = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='academy_courses_created')
    assigned_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='academy_courses_assigned',
        help_text='The CEO (COURSE_ASSIGN holder) who authorized this creator to build this specific course.',
    )
    approved_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='academy_courses_approved',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    is_featured = models.BooleanField(default=False)
    thumbnail_url = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'academy_courses'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'role_pathway']),
            models.Index(fields=['is_featured']),
        ]

    def __str__(self):
        return self.title

    @property
    def duration_minutes(self):
        """Sum of every lesson's duration across every module — never stored,
        always computed, so editing lesson lengths can't drift the total."""
        total = 0
        for module in self.modules.all():
            for lesson in module.lessons.all():
                total += lesson.duration_minutes or 0
        return total

    @property
    def module_count(self):
        return self.modules.count()


class Module(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='modules')
    title = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'academy_modules'
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.course.title} / {self.title}'


class Lesson(models.Model):
    class VideoProvider(models.TextChoices):
        YOUTUBE = 'youtube', 'YouTube'
        VIMEO = 'vimeo', 'Vimeo'
        SELF_HOSTED = 'self_hosted', 'Self Hosted'

    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='lessons')
    title = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0)
    duration_minutes = models.PositiveIntegerField(
        default=5,
        help_text=(
            'Task-oriented lessons should run 3-10 minutes per the spec, but '
            'this is validated (warned on), not hard-blocked — real content '
            'may occasionally need to differ.'
        ),
    )
    video_provider = models.CharField(max_length=20, choices=VideoProvider.choices, default=VideoProvider.YOUTUBE)
    video_url = models.TextField(blank=True, default='')
    description = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'academy_lessons'
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.module.course.title} / {self.title}'


class Resource(models.Model):
    class ResourceType(models.TextChoices):
        PDF = 'pdf', 'PDF'
        CHECKLIST = 'checklist', 'Checklist'
        GUIDE = 'guide', 'Guide'
        OTHER = 'other', 'Other'

    course = models.ForeignKey(Course, on_delete=models.CASCADE, null=True, blank=True, related_name='resources')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, null=True, blank=True, related_name='resources')
    title = models.CharField(max_length=255)
    file_url = models.TextField()
    resource_type = models.CharField(max_length=20, choices=ResourceType.choices, default=ResourceType.OTHER)

    class Meta:
        db_table = 'academy_resources'

    def __str__(self):
        return self.title


class CourseEnrollment(models.Model):
    class Source(models.TextChoices):
        SSO = 'sso', 'SSO'
        DIRECT = 'direct', 'Direct'

    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='academy_enrollments')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='enrollments')
    enrolled_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.DIRECT)

    class Meta:
        db_table = 'academy_course_enrollments'
        ordering = ['-enrolled_at']
        constraints = [
            models.UniqueConstraint(fields=['user', 'course'], name='academy_enrollment_unique_user_course'),
        ]

    def __str__(self):
        return f'{self.user.matricule} -> {self.course.slug}'


class LessonProgress(models.Model):
    enrollment = models.ForeignKey(CourseEnrollment, on_delete=models.CASCADE, related_name='lesson_progress')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='progress_rows')
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'academy_lesson_progress'
        constraints = [
            models.UniqueConstraint(fields=['enrollment', 'lesson'], name='academy_progress_unique_enrollment_lesson'),
        ]

    def __str__(self):
        return f'{self.enrollment_id} / {self.lesson_id}'


class Quiz(models.Model):
    class Kind(models.TextChoices):
        MODULE_QUIZ = 'MODULE_QUIZ', 'Module Quiz'
        FINAL_ASSESSMENT = 'FINAL_ASSESSMENT', 'Final Assessment'

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, null=True, blank=True, related_name='quizzes')
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, null=True, blank=True, related_name='final_assessments',
        help_text='Set only for kind=FINAL_ASSESSMENT (the course-level closing exam).',
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.MODULE_QUIZ)
    pass_threshold_percent = models.PositiveSmallIntegerField(default=80)

    class Meta:
        db_table = 'academy_quizzes'

    def __str__(self):
        return f'{self.get_kind_display()} ({self.pk})'

    @property
    def owning_course(self):
        if self.course_id:
            return self.course
        if self.lesson_id:
            return self.lesson.module.course
        return None


class QuizQuestion(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='questions')
    text = models.TextField()
    choices = models.JSONField(default=list, help_text='List of choice strings.')
    correct_index = models.PositiveSmallIntegerField()

    class Meta:
        db_table = 'academy_quiz_questions'

    def __str__(self):
        return self.text[:60]


class QuizAttempt(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='attempts')
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='academy_quiz_attempts')
    score_percent = models.DecimalField(max_digits=5, decimal_places=2)
    passed = models.BooleanField(default=False)
    attempted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'academy_quiz_attempts'
        ordering = ['-attempted_at']

    def __str__(self):
        return f'{self.user.matricule} - {self.quiz_id} ({self.score_percent}%)'


class CertificateSequenceCounter(models.Model):
    """Historical model, no longer used to generate ``verification_id`` (see
    ``next_verification_id`` below) -- kept only so the existing migration
    that created this table doesn't need reworking. A sequential per-year
    counter directly encoded into a small (10^6) numeric ID space made every
    real certificate trivially enumerable by iterating EDU-2026-000000
    through EDU-2026-999999 against the public, unauthenticated
    /verify/{id}/ endpoint -- a full roster/PII harvest, not the
    "look up the one certificate you already hold" use case the endpoint is
    meant to serve. The spec itself explicitly calls for a "non-sequential"
    ID (Section 7) -- this model's sequential-counter approach was a
    contract-writing error translating that requirement, now corrected.
    """

    year = models.PositiveIntegerField(unique=True)
    last_value = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'academy_certificate_sequence_counters'

    def __str__(self):
        return f'{self.year}: {self.last_value}'

    @classmethod
    def next_verification_id(cls, year=None):
        """Non-sequential, cryptographically random verification ID (spec
        Section 7's explicit requirement) -- EDU-{year}-{6 random
        alphanumeric chars, excluding visually-ambiguous 0/O/1/I}. ~2 billion
        possible values per year, making full-space enumeration of the
        public /verify/{id}/ endpoint computationally infeasible, unlike the
        10^6-value sequential counter this replaces. Collision-checked with
        a bounded retry -- astronomically unlikely to ever actually retry
        given the space size, but never silently trust an unchecked random
        value to be unique.
        """
        year = year or timezone.now().year
        alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'  # no 0/O/1/I
        for _ in range(10):
            candidate = f'EDU-{year}-{"".join(secrets.choice(alphabet) for _ in range(6))}'
            if not Certificate.objects.filter(verification_id=candidate).exists():
                return candidate
        raise RuntimeError('Could not generate a unique certificate verification ID after 10 attempts.')


class Certificate(models.Model):
    class Tier(models.TextChoices):
        COMPLETION = 'COMPLETION', 'Certificate of Completion'
        CERTIFIED_USER = 'CERTIFIED_USER', 'Certified EduIgnite User'
        CERTIFIED_TRAINER = 'CERTIFIED_TRAINER', 'Certified EduIgnite Trainer'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='academy_certificates')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='certificates')
    tier = models.CharField(max_length=20, choices=Tier.choices)
    verification_id = models.CharField(max_length=32, unique=True, db_index=True)
    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'academy_certificates'
        ordering = ['-issued_at']
        constraints = [
            # Belt-and-braces alongside the get_or_create() idempotency checks
            # in views.py: a user can hold at most one certificate per
            # (course, tier) — this is what actually guarantees "completing
            # all lessons twice never issues two COMPLETION certificates"
            # under concurrent requests, not just the Python-level check.
            models.UniqueConstraint(fields=['user', 'course', 'tier'], name='academy_certificate_unique_user_course_tier'),
        ]

    def __str__(self):
        return self.verification_id

    def save(self, *args, **kwargs):
        if not self.verification_id:
            self.verification_id = CertificateSequenceCounter.next_verification_id()
        super().save(*args, **kwargs)


class DeepLinkCache(models.Model):
    """Context-Preserving Redirection cache (spec Section 3). Rows older
    than 30 minutes are treated as expired at *read* time — no cron needed,
    the lookup query itself filters them out (see ``apps.academy.services``).
    """

    state = models.CharField(max_length=64, unique=True, db_index=True)
    course_id = models.UUIDField(null=True, blank=True)
    module_id = models.UUIDField(null=True, blank=True)
    return_path = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'academy_deep_link_cache'

    def __str__(self):
        return self.state

    @staticmethod
    def generate_state():
        return secrets.token_urlsafe(32)


class ProfileConfig(models.Model):
    """Singleton public-profile/CMS config — same pattern as
    ``apps.platform.models.PlatformSettings``: ``pk`` pinned to 1 and a
    ``load()`` classmethod that get-or-creates it."""

    tagline = models.CharField(max_length=255, blank=True, default='')
    mission = models.TextField(blank=True, default='')
    vision = models.TextField(blank=True, default='')
    description = models.TextField(blank=True, default='')
    logo_url = models.TextField(null=True, blank=True)
    courses_count_override = models.PositiveIntegerField(null=True, blank=True)
    learners_count_override = models.PositiveIntegerField(null=True, blank=True)
    certificates_count_override = models.PositiveIntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Academy Profile Config'
        verbose_name_plural = 'Academy Profile Config'
        db_table = 'academy_profile_config'

    def __str__(self):
        return self.tagline or 'EduIgnite Academy'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class CourseTestimonial(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='academy_testimonials')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='testimonials')
    message = models.TextField()
    rating = models.PositiveSmallIntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text='Star rating from 1 to 5.',
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    approved_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'academy_course_testimonials'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'course']),
        ]

    def __str__(self):
        return f'{self.user.matricule} - {self.course.slug}'


class TrainerProfile(models.Model):
    user = models.OneToOneField('users.User', on_delete=models.CASCADE, related_name='academy_trainer_profile')
    bio = models.TextField(blank=True, default='')
    photo_url = models.TextField(null=True, blank=True)
    credentials = models.TextField(blank=True, default='')
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'academy_trainer_profiles'

    def __str__(self):
        return f'Trainer: {self.user.name}'


class FAQEntry(models.Model):
    question = models.CharField(max_length=500)
    answer = models.TextField()
    category = models.CharField(max_length=100, blank=True, default='General')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'academy_faq_entries'
        ordering = ['category', 'order', 'id']

    def __str__(self):
        return self.question


class AcademyAuditLog(models.Model):
    """Append-only. No update/delete API — write-once audit trail for every
    course publish/approve/reject, permission grant/revoke, profile metadata
    change, and SSO handshake, per the spec's security audit requirement."""

    timestamp = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        help_text='Null for system-initiated actions.',
    )
    action = models.CharField(max_length=100)
    entity = models.CharField(max_length=255, help_text='e.g. "Course:<uuid>".')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'academy_audit_logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['action', 'timestamp']),
            models.Index(fields=['entity']),
        ]

    def __str__(self):
        return f'{self.timestamp:%Y-%m-%d %H:%M} {self.action} {self.entity}'

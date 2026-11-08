from decimal import Decimal

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django_extensions.db.models import TimeStampedModel
import uuid


class Subject(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='subjects')
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, db_index=True)
    level = models.CharField(max_length=50, help_text='Class level this subject is offered in')
    coefficient = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('1.00'))
    teacher = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='taught_subjects',
                                limit_choices_to={'role': 'TEACHER'})
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        unique_together = [['school', 'code']]
        indexes = [
            models.Index(fields=['school', 'level']),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class ClassSubject(TimeStampedModel):
    class SubjectType(models.TextChoices):
        MANDATORY = 'mandatory', 'Mandatory'
        OPTIONAL = 'optional', 'Optional'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.CASCADE,
        related_name='class_subjects',
    )
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='class_links')
    teacher = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='class_subject_links',
        limit_choices_to={'role': 'TEACHER'},
    )
    type = models.CharField(
        max_length=20,
        choices=SubjectType.choices,
        default=SubjectType.MANDATORY,
    )

    class Meta:
        ordering = ['school_class__name', 'subject__name']
        unique_together = [['school_class', 'subject']]
        indexes = [
            models.Index(fields=['school_class', 'type']),
            models.Index(fields=['subject', 'teacher']),
        ]

    def __str__(self):
        return f'{self.subject.name} - {self.school_class.name}'

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        from .relationships import sync_class_subject_enrollments

        sync_class_subject_enrollments(self)

    def delete(self, *args, **kwargs):
        subject = self.subject
        super().delete(*args, **kwargs)
        from .relationships import sync_subject_metadata

        sync_subject_metadata(subject)


class StudentSubjectEnrollment(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='subject_enrollments',
    )
    class_subject = models.ForeignKey(
        ClassSubject,
        on_delete=models.CASCADE,
        related_name='student_enrollments',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['class_subject__type', 'class_subject__subject__name']
        unique_together = [['student', 'class_subject']]
        indexes = [
            models.Index(fields=['student', 'is_active']),
            models.Index(fields=['class_subject', 'is_active']),
        ]

    def __str__(self):
        return f'{self.student.admission_number} - {self.class_subject.subject.name}'

    def save(self, *args, **kwargs):
        if self.class_subject.type == ClassSubject.SubjectType.MANDATORY:
            self.is_active = True
        super().save(*args, **kwargs)


class SubjectMaterial(TimeStampedModel):
    class MaterialType(models.TextChoices):
        PDF = 'pdf', 'PDF'
        VIDEO = 'video', 'Video'
        IMAGE = 'image', 'Image'
        DOCUMENT = 'document', 'Document'
        LINK = 'link', 'Link'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='subject_materials')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='materials')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    material_type = models.CharField(max_length=20, choices=MaterialType.choices, default=MaterialType.PDF)
    external_url = models.URLField(blank=True, default='')
    file_name = models.CharField(max_length=255, blank=True, default='')
    mime_type = models.CharField(max_length=120, blank=True, default='')
    file_size_bytes = models.PositiveIntegerField(null=True, blank=True)
    file_data = models.TextField(blank=True, default='')
    uploaded_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_subject_materials',
    )

    class Meta:
        ordering = ['-created']
        indexes = [
            models.Index(fields=['school', 'subject']),
            models.Index(fields=['subject', 'material_type']),
        ]

    def __str__(self):
        return f'{self.title} - {self.subject.name}'


class Sequence(models.Model):
    TERM_CHOICES = [
        (1, 'Term 1'),
        (2, 'Term 2'),
        (3, 'Term 3'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='sequences')
    name = models.CharField(max_length=255, help_text='e.g., Sequence 1, Sequence 2')
    academic_year = models.CharField(max_length=20, help_text='e.g., 2024-2025')
    term = models.IntegerField(choices=TERM_CHOICES)
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=False)
    marks_deadline = models.DateField(
        null=True,
        blank=True,
        help_text='Latest date teachers may submit marks for this sequence. Set by the school administration.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-academic_year', 'term', 'name']
        unique_together = [['school', 'academic_year', 'term', 'name']]
        indexes = [
            models.Index(fields=['school', 'academic_year', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} - {self.academic_year} (Term {self.term})"


class Grade(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='grades')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='grades')
    sequence = models.ForeignKey(Sequence, on_delete=models.CASCADE, related_name='grades')
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='grades')
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grades',
        help_text='Class snapshot at the time this mark was entered.',
    )
    class_name_snapshot = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text='Class name snapshot used to keep promoted student records separated from current class work.',
    )
    score = models.DecimalField(max_digits=5, decimal_places=2,
                                validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))])
    teacher = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True,
                                related_name='entered_grades',
                                limit_choices_to={'role': 'TEACHER'})
    comment = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-sequence__academic_year', '-sequence__term', 'subject__name']
        unique_together = [['student', 'subject', 'sequence']]
        indexes = [
            models.Index(fields=['student', 'sequence']),
            models.Index(fields=['subject', 'sequence']),
            models.Index(fields=['student', 'school_class', 'sequence']),
            models.Index(fields=['school', 'class_name_snapshot', 'sequence']),
        ]

    def __str__(self):
        return f"{self.student.admission_number} - {self.subject.code} ({self.sequence.name}): {self.score}"

    def save(self, *args, **kwargs):
        if self.student_id:
            if not self.school_class_id and getattr(self.student, 'school_class_id', None):
                self.school_class = self.student.school_class
            if not self.class_name_snapshot:
                if getattr(self.student, 'school_class_id', None):
                    self.class_name_snapshot = self.student.school_class.name
                else:
                    self.class_name_snapshot = self.student.student_class or ''
            if not self.school_id and getattr(self.student, 'school_id', None):
                self.school = self.student.school
        super().save(*args, **kwargs)

    def get_grade_letter(self, config=None):
        """Letter (or descriptive label) for this mark using the school's assessment config.

        Defaults reproduce the Cameroon scale: >=16 A, >=14 B, >=12 C, >=10 D, else F.
        """
        from .assessment_config import get_assessment_config

        config = config or get_assessment_config(self.school_id)
        return config.label(self.score)

    def clean(self):
        from django.core.exceptions import ValidationError
        from .assessment_config import get_assessment_config

        super().clean()
        if self.score is not None and self.school_id:
            maximum = get_assessment_config(self.school_id).max_score
            if Decimal(str(self.score)) > maximum:
                raise ValidationError({'score': f'Ensure this value is less than or equal to {maximum.normalize():f}.'})


class TermResult(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='term_results')
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='term_results')
    academic_year = models.CharField(max_length=20)
    term = models.IntegerField(choices=[(1, 'Term 1'), (2, 'Term 2'), (3, 'Term 3')])
    average = models.DecimalField(max_digits=5, decimal_places=2,
                                  validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))])
    rank = models.IntegerField(null=True, blank=True)
    total_students = models.IntegerField(default=0)
    is_promoted = models.BooleanField(null=True, blank=True)
    teacher_comment = models.TextField(blank=True, null=True)
    # Class-master / admin assessed conduct for this term (shown on the report
    # card's Conduct & Attendance panel).
    conduct = models.CharField(max_length=30, blank=True, default='Excellent')
    principal_remark = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-academic_year', '-term']
        unique_together = [['student', 'academic_year', 'term']]
        indexes = [
            models.Index(fields=['student', 'academic_year']),
        ]

    def __str__(self):
        return f"{self.student.admission_number} - Term {self.term} {self.academic_year}: {self.average}"


class AnnualResult(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='annual_results')
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='annual_results')
    academic_year = models.CharField(max_length=20)
    annual_average = models.DecimalField(max_digits=5, decimal_places=2,
                                         validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))])
    rank = models.IntegerField(null=True, blank=True)
    is_on_honour_roll = models.BooleanField(default=False)
    is_promoted = models.BooleanField()

    class Meta:
        ordering = ['-academic_year', '-annual_average']
        unique_together = [['student', 'academic_year']]
        indexes = [
            models.Index(fields=['student', 'academic_year']),
            models.Index(fields=['school', 'academic_year']),
        ]

    def __str__(self):
        return f"{self.student.admission_number} - {self.academic_year}: {self.annual_average}"


class AssessmentArea(TimeStampedModel):
    """A developmental area rated per pupil per term (Basic Education, nursery).

    Nursery report cards carry no marks, averages or ranks: each active area gets
    a level on the school's configured scale (``assessment_config['nursery_scale']``).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='assessment_areas')
    name = models.CharField(max_length=120)
    name_fr = models.CharField(max_length=120, blank=True, default='')
    order_index = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order_index', 'name']
        unique_together = [['school', 'name']]
        indexes = [models.Index(fields=['school', 'active'])]

    def __str__(self):
        return f'{self.name} ({self.school_id})'


class AssessmentRating(TimeStampedModel):
    """A pupil's level (1..scale length) in an area for a term; ``level`` null = not assessed."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='assessment_ratings')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='assessment_ratings')
    area = models.ForeignKey(AssessmentArea, on_delete=models.CASCADE, related_name='ratings')
    academic_year = models.CharField(max_length=20)
    term = models.IntegerField(choices=Sequence.TERM_CHOICES)
    level = models.PositiveSmallIntegerField(null=True, blank=True)
    rated_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='assessment_ratings_given',
    )

    class Meta:
        ordering = ['area__order_index', 'area__name']
        unique_together = [['student', 'area', 'academic_year', 'term']]
        indexes = [models.Index(fields=['school', 'academic_year', 'term'])]

    def __str__(self):
        return f'{self.student_id} {self.area_id} T{self.term}: {self.level}'


class ConductEntry(TimeStampedModel):
    """One line of a pupil's conduct log (Basic Education): late, warning, praise or note."""

    KIND_CHOICES = [('warning', 'Warning'), ('praise', 'Praise'), ('note', 'Note'), ('late', 'Late')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='conduct_entries')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='conduct_entries')
    school_class = models.ForeignKey(
        'schools.SchoolClass', on_delete=models.SET_NULL, null=True, blank=True, related_name='conduct_entries',
    )
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    note = models.CharField(max_length=200, blank=True, default='')
    date = models.DateField()
    recorded_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='conduct_entries_recorded',
    )

    class Meta:
        ordering = ['-date', '-created']
        indexes = [
            models.Index(fields=['school', 'student', 'date'], name='grades_cond_school__stud_idx'),
            models.Index(fields=['school', 'school_class', 'date'], name='grades_cond_school__cls_idx'),
        ]

    def __str__(self):
        return f'{self.student_id} {self.kind} {self.date}'


class ReportCardPublication(TimeStampedModel):
    """Tracks school-admin release of report cards to students and parents."""

    class Scope(models.TextChoices):
        SEQUENCE = 'SEQUENCE', 'Sequence'
        TERM = 'TERM', 'Term'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='report_card_publications')
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='report_card_publications',
    )
    class_name = models.CharField(max_length=255, db_index=True)
    scope = models.CharField(max_length=20, choices=Scope.choices)
    sequence = models.ForeignKey(
        Sequence,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='report_card_publications',
    )
    academic_year = models.CharField(max_length=20)
    term = models.IntegerField(choices=Sequence.TERM_CHOICES, null=True, blank=True)
    is_published = models.BooleanField(default=True)
    published_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='published_report_cards',
    )
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'report_card_publications'
        ordering = ['-published_at', '-created']
        indexes = [
            models.Index(fields=['school', 'scope', 'academic_year', 'term']),
            models.Index(fields=['school', 'class_name', 'is_published']),
            models.Index(fields=['sequence', 'is_published']),
        ]

    def __str__(self):
        period = self.sequence.name if self.sequence_id else f"Term {self.term} {self.academic_year}"
        return f"{self.class_name} - {period}"

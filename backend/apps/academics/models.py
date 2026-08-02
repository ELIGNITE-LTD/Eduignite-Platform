from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from django_extensions.db.models import TimeStampedModel
import uuid


class AcademicYear(TimeStampedModel):
    """Represents an academic year (e.g., 2024-2025)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='academic_years')
    name = models.CharField(
        max_length=20,
        help_text='e.g., 2024-2025',
    )
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'academic_years'
        ordering = ['-start_date']
        unique_together = [['school', 'name']]
        indexes = [
            models.Index(fields=['school', 'is_current']),
            models.Index(fields=['school', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} - {self.school.short_name}"

    def clean(self):
        super().clean()
        if self.start_date >= self.end_date:
            raise ValidationError({'end_date': 'End date must be after start date.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        # Ensure only one current academic year per school
        if self.is_current:
            AcademicYear.objects.filter(school=self.school, is_current=True).exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


class Term(TimeStampedModel):
    """Represents a term within an academic year."""

    TERM_CHOICES = [
        ('first', 'First Term'),
        ('second', 'Second Term'),
        ('third', 'Third Term'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='terms')
    name = models.CharField(max_length=20, choices=TERM_CHOICES)
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'terms'
        ordering = ['start_date']
        unique_together = [['academic_year', 'name']]
        indexes = [
            models.Index(fields=['academic_year', 'is_current']),
            models.Index(fields=['academic_year', 'is_active']),
        ]

    def __str__(self):
        return f"{self.get_name_display()} - {self.academic_year}"

    def clean(self):
        super().clean()
        if self.start_date >= self.end_date:
            raise ValidationError({'end_date': 'End date must be after start date.'})
        if self.start_date < self.academic_year.start_date or self.end_date > self.academic_year.end_date:
            raise ValidationError(
                {'start_date': 'Term dates must fall within the academic year dates.'}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        # Ensure only one current term per academic year
        if self.is_current:
            Term.objects.filter(academic_year=self.academic_year, is_current=True).exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


class StudentPromotion(TimeStampedModel):
    """Tracks student promotion/retention/graduation at the end of an academic year."""

    PROMOTION_STATUS_CHOICES = [
        ('promoted', 'Promoted to Next Class'),
        ('retained', 'Retained in Same Class'),
        ('graduated', 'Graduated'),
        ('transferred', 'Transferred to Another School'),
        ('withdrawn', 'Withdrawn'),
        ('pending', 'Pending Decision'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='promotions')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='student_promotions')
    current_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='promotions_from',
    )
    promoted_to_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='promotions_to',
    )
    status = models.CharField(max_length=20, choices=PROMOTION_STATUS_CHOICES, default='pending')
    average_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    promotion_date = models.DateTimeField(null=True, blank=True)
    promoted_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='promoted_students',
    )
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'student_promotions'
        ordering = ['-academic_year', 'student']
        unique_together = [['student', 'academic_year']]
        indexes = [
            models.Index(fields=['student', 'academic_year']),
            models.Index(fields=['academic_year', 'status']),
        ]

    def __str__(self):
        return f"{self.student} - {self.academic_year} ({self.get_status_display()})"

    def clean(self):
        super().clean()
        if self.promoted_to_class and self.promoted_to_class.school_id != self.student.school_id:
            raise ValidationError(
                {'promoted_to_class': 'Promoted class must belong to the same school.'}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        if self.status != 'pending' and not self.promotion_date:
            self.promotion_date = timezone.now()
        super().save(*args, **kwargs)


class ClassSubject(TimeStampedModel):
    """Represents a subject offered in a specific class."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.CASCADE,
        related_name='subjects',
    )
    subject_name = models.CharField(max_length=255)
    teacher = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='teaching_classes',
        limit_choices_to={'role': 'TEACHER'},
    )
    coefficient = models.PositiveIntegerField(default=2)
    is_compulsory = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'class_subjects'
        ordering = ['school_class', 'subject_name']
        unique_together = [['school_class', 'subject_name']]
        indexes = [
            models.Index(fields=['school_class', 'is_active']),
            models.Index(fields=['teacher', 'school_class']),
        ]

    def __str__(self):
        return f"{self.subject_name} - {self.school_class}"

    def clean(self):
        super().clean()
        if self.teacher and self.teacher.school_id != self.school_class.school_id:
            raise ValidationError(
                {'teacher': 'Teacher must belong to the same school as the class.'}
            )


class StudentEnrollment(TimeStampedModel):
    """Tracks student enrollment in specific subjects for a term."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='subject_enrollments')
    term = models.ForeignKey(Term, on_delete=models.CASCADE, related_name='student_enrollments')
    class_subject = models.ForeignKey(ClassSubject, on_delete=models.CASCADE, related_name='student_enrollments')
    is_enrolled = models.BooleanField(default=True)

    class Meta:
        db_table = 'student_enrollments'
        ordering = ['term', 'student', 'class_subject']
        unique_together = [['student', 'term', 'class_subject']]
        indexes = [
            models.Index(fields=['student', 'term']),
            models.Index(fields=['term', 'is_enrolled']),
        ]

    def __str__(self):
        return f"{self.student} - {self.class_subject} ({self.term})"

    def clean(self):
        super().clean()
        if self.student.school_id != self.class_subject.school_class.school_id:
            raise ValidationError(
                {'class_subject': 'Subject must belong to the same school as the student.'}
            )


class SubjectGrade(TimeStampedModel):
    """Stores grades for a student in a subject during a term."""

    GRADE_TYPE_CHOICES = [
        ('sequence', 'Sequence/Quiz'),
        ('composition', 'Composition/Mid-Term'),
        ('exam', 'Final Exam'),
        ('project', 'Project/Assignment'),
        ('participation', 'Class Participation'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enrollment = models.ForeignKey(StudentEnrollment, on_delete=models.CASCADE, related_name='grades')
    grade_type = models.CharField(max_length=20, choices=GRADE_TYPE_CHOICES)
    score = models.DecimalField(max_digits=5, decimal_places=2)
    max_score = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    recorded_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_grades',
    )
    recorded_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'subject_grades'
        ordering = ['-recorded_date']
        indexes = [
            models.Index(fields=['enrollment', 'grade_type']),
            models.Index(fields=['enrollment', 'recorded_date']),
        ]

    def __str__(self):
        return f"{self.enrollment.student} - {self.enrollment.class_subject} - {self.get_grade_type_display()}: {self.score}/{self.max_score}"

    def clean(self):
        super().clean()
        if self.score < 0 or self.score > self.max_score:
            raise ValidationError(
                {'score': f'Score must be between 0 and {self.max_score}.'}
            )

    @property
    def percentage(self):
        """Calculate percentage score."""
        if self.max_score == 0:
            return 0
        return (self.score / self.max_score) * 100

    @property
    def grade_letter(self):
        """Get letter grade based on percentage."""
        percentage = self.percentage
        if percentage >= 90:
            return 'A'
        elif percentage >= 80:
            return 'B'
        elif percentage >= 70:
            return 'C'
        elif percentage >= 60:
            return 'D'
        elif percentage >= 50:
            return 'E'
        else:
            return 'F'

"""Higher Education structure: units, programmes, calendar and grading policy.

Every row belongs to one institution (``school`` with ``education_category ==
'higher'``). Nothing here touches School/SchoolClass/Grade semantics.
"""

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction

from . import grading_presets


class Stamped(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class OrganizationalUnit(Stamped):
    """Faculty, school, institute, department or campus; faculties and campuses are optional."""

    FACULTY = 'faculty'
    SCHOOL = 'school'
    INSTITUTE = 'institute'
    DEPARTMENT = 'department'
    CAMPUS = 'campus'
    TYPE_CHOICES = [
        (FACULTY, 'Faculty'),
        (SCHOOL, 'School'),
        (INSTITUTE, 'Institute'),
        (DEPARTMENT, 'Department'),
        (CAMPUS, 'Campus'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_units')
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.PROTECT, related_name='children')
    unit_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=30, blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'higher_ed_units'
        ordering = ['unit_type', 'name']
        constraints = [
            models.UniqueConstraint(fields=['school', 'unit_type', 'name'], name='he_unit_unique_name_per_type'),
        ]
        indexes = [models.Index(fields=['school', 'unit_type'])]

    def __str__(self):
        return f'{self.get_unit_type_display()}: {self.name}'

    def clean(self):
        if self.parent_id:
            if self.parent.school_id != self.school_id:
                raise ValidationError({'parent': 'The parent unit belongs to another institution.'})
            if self.parent_id == self.pk:
                raise ValidationError({'parent': 'A unit cannot be its own parent.'})
            if self.parent.unit_type == self.DEPARTMENT:
                raise ValidationError({'parent': 'A department cannot contain other units.'})
            node = self.parent
            while node is not None:
                if self.pk and node.pk == self.pk:
                    raise ValidationError({'parent': 'This would create a loop in the structure.'})
                node = node.parent

    def save(self, *args, **kwargs):
        self.full_clean(exclude=['school'])
        super().save(*args, **kwargs)


class Programme(Stamped):
    """A course of study leading to an award (Licence, Master, HND, ...)."""

    LICENCE = 'licence'
    MASTER = 'master'
    DOCTORAT = 'doctorat'
    HND = 'hnd'
    BTS = 'bts'
    DIPLOMA = 'diploma'
    CERTIFICATE = 'certificate'
    OTHER = 'other'
    AWARD_CHOICES = [
        (LICENCE, 'Licence / Bachelor'),
        (MASTER, 'Master'),
        (DOCTORAT, 'Doctorat / PhD'),
        (HND, 'HND'),
        (BTS, 'BTS'),
        (DIPLOMA, 'Diploma'),
        (CERTIFICATE, 'Certificate'),
        (OTHER, 'Other'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_programmes')
    department = models.ForeignKey(OrganizationalUnit, on_delete=models.PROTECT, related_name='programmes')
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=30, blank=True, default='')
    award_level = models.CharField(max_length=20, choices=AWARD_CHOICES, default=LICENCE)
    duration_years = models.PositiveSmallIntegerField(default=3)
    required_credits = models.PositiveIntegerField(default=0)
    description = models.TextField(blank=True, default='', max_length=2000)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'higher_ed_programmes'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['school', 'name', 'award_level'], name='he_programme_unique'),
        ]
        indexes = [models.Index(fields=['school', 'department'])]

    def __str__(self):
        return f'{self.name} ({self.get_award_level_display()})'

    def clean(self):
        if not 1 <= (self.duration_years or 0) <= 10:
            raise ValidationError({'duration_years': 'Duration must be between 1 and 10 years.'})
        if self.department_id:
            if self.department.school_id != self.school_id:
                raise ValidationError({'department': 'This department belongs to another institution.'})
            if self.department.unit_type != OrganizationalUnit.DEPARTMENT:
                raise ValidationError({'department': 'A programme belongs to a department.'})

    def save(self, *args, **kwargs):
        self.full_clean(exclude=['school'])
        super().save(*args, **kwargs)


YEAR_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']


class ProgrammeYear(Stamped):
    """A labelled year of a programme ('Year One', ...); the label can be renamed (e.g. Level 100)."""

    programme = models.ForeignKey(Programme, on_delete=models.CASCADE, related_name='years')
    number = models.PositiveSmallIntegerField()
    label = models.CharField(max_length=60)

    class Meta:
        db_table = 'higher_ed_programme_years'
        ordering = ['programme_id', 'number']
        constraints = [
            models.UniqueConstraint(fields=['programme', 'number'], name='he_programme_year_unique'),
        ]

    def __str__(self):
        return f'{self.programme.name} - {self.label}'

    @staticmethod
    def default_label(number):
        return f'Year {YEAR_WORDS[number - 1]}' if 1 <= number <= len(YEAR_WORDS) else f'Year {number}'

    def save(self, *args, **kwargs):
        if not self.label:
            self.label = self.default_label(self.number)
        super().save(*args, **kwargs)


class AcademicYear(Stamped):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_academic_years')
    label = models.CharField(max_length=30, help_text='e.g. 2025/2026')
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = 'higher_ed_academic_years'
        ordering = ['-start_date']
        constraints = [
            models.UniqueConstraint(fields=['school', 'label'], name='he_academic_year_unique'),
        ]

    def __str__(self):
        return self.label

    def clean(self):
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            raise ValidationError({'end_date': 'The end date must be after the start date.'})

    def save(self, *args, **kwargs):
        self.full_clean(exclude=['school'])
        with transaction.atomic():
            if self.is_current:
                AcademicYear.objects.filter(school_id=self.school_id, is_current=True).exclude(pk=self.pk).update(
                    is_current=False
                )
            super().save(*args, **kwargs)


class AcademicPeriod(Stamped):
    """A semester, trimester, exam window, resit window, ... inside an academic year."""

    SEMESTER = 'semester'
    TRIMESTER = 'trimester'
    TERM = 'term'
    REGISTRATION = 'registration'
    EXAM = 'exam'
    RESIT = 'resit'
    PUBLICATION = 'publication'
    OTHER = 'other'
    TYPE_CHOICES = [
        (SEMESTER, 'Semester'),
        (TRIMESTER, 'Trimester'),
        (TERM, 'Term'),
        (REGISTRATION, 'Registration'),
        (EXAM, 'Exams'),
        (RESIT, 'Resits'),
        (PUBLICATION, 'Results publication'),
        (OTHER, 'Other'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_periods')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='periods')
    period_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=SEMESTER)
    name = models.CharField(max_length=100)
    order = models.PositiveSmallIntegerField(default=1)
    start_date = models.DateField()
    end_date = models.DateField()

    class Meta:
        db_table = 'higher_ed_academic_periods'
        ordering = ['academic_year_id', 'order', 'start_date']
        constraints = [
            models.UniqueConstraint(fields=['academic_year', 'name'], name='he_period_unique_name'),
        ]

    def __str__(self):
        return f'{self.academic_year.label} - {self.name}'

    def clean(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({'end_date': 'The end date cannot be before the start date.'})
        if self.academic_year_id and self.school_id and self.academic_year.school_id != self.school_id:
            raise ValidationError({'academic_year': 'This academic year belongs to another institution.'})

    def save(self, *args, **kwargs):
        if self.academic_year_id and not self.school_id:
            self.school_id = self.academic_year.school_id
        self.full_clean(exclude=['school'])
        super().save(*args, **kwargs)


class GradingPolicy(Stamped):
    """The grading scale an institution uses: one preset key plus editable JSON thresholds."""

    PRESET_CHOICES = [
        (grading_presets.GPA_4, 'GPA (4.0 scale)'),
        (grading_presets.SCALE_20, 'Marks out of 20'),
    ]

    school = models.OneToOneField('schools.School', on_delete=models.CASCADE, related_name='he_grading_policy')
    preset_key = models.CharField(max_length=20, choices=PRESET_CHOICES)
    thresholds = models.JSONField(default=dict)

    class Meta:
        db_table = 'higher_ed_grading_policies'

    def __str__(self):
        return f'{self.school_id}: {self.preset_key}'

    def clean(self):
        problems = grading_presets.validate_thresholds(self.preset_key, self.thresholds)
        if problems:
            raise ValidationError({'thresholds': problems})

    def save(self, *args, **kwargs):
        if not self.thresholds and self.preset_key in grading_presets.PRESETS:
            self.thresholds = grading_presets.get_preset(self.preset_key)
        self.full_clean(exclude=['school'])
        super().save(*args, **kwargs)


class CourseUnit(Stamped):
    """A reusable course definition (code, title, default credits) owned by a department.

    It says nothing about which programme uses it (CurriculumEntry) or when it is
    taught (CourseOffering).
    """

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_course_units')
    department = models.ForeignKey(OrganizationalUnit, on_delete=models.PROTECT, related_name='course_units')
    code = models.CharField(max_length=30)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    credits = models.PositiveSmallIntegerField()
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'higher_ed_course_units'
        ordering = ['code']
        constraints = [
            models.UniqueConstraint(fields=['school', 'code'], name='he_course_unit_unique_code'),
        ]
        indexes = [models.Index(fields=['school', 'department'])]

    def __str__(self):
        return f'{self.code} {self.title}'

    def clean(self):
        if not self.credits or self.credits <= 0:
            raise ValidationError({'credits': 'Credits must be greater than zero.'})
        if self.department_id:
            if self.department.school_id != self.school_id:
                raise ValidationError({'department': 'This department belongs to another institution.'})
            if self.department.unit_type != OrganizationalUnit.DEPARTMENT:
                raise ValidationError({'department': 'A course unit belongs to a department.'})

    def save(self, *args, **kwargs):
        self.code = (self.code or '').strip().upper()
        self.full_clean(exclude=['school'])
        super().save(*args, **kwargs)


class CurriculumEntry(Stamped):
    """Places a course unit in a programme: which year, which semester, core or elective."""

    CORE = 'core'
    ELECTIVE = 'elective'
    CATEGORY_CHOICES = [(CORE, 'Core'), (ELECTIVE, 'Elective')]
    PERIOD_TYPES = [('semester', 'Semester'), ('trimester', 'Trimester'), ('term', 'Term')]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_curriculum')
    programme = models.ForeignKey(Programme, on_delete=models.CASCADE, related_name='curriculum')
    programme_year = models.ForeignKey(ProgrammeYear, on_delete=models.PROTECT, related_name='curriculum')
    period_type = models.CharField(max_length=20, choices=PERIOD_TYPES, default='semester')
    period_number = models.PositiveSmallIntegerField(default=1, help_text='Semester (or trimester) number in the year')
    course_unit = models.ForeignKey(CourseUnit, on_delete=models.PROTECT, related_name='curriculum_entries')
    credits_override = models.PositiveSmallIntegerField(null=True, blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default=CORE)

    class Meta:
        db_table = 'higher_ed_curriculum_entries'
        ordering = ['programme_id', 'programme_year__number', 'period_number', 'course_unit__code']
        verbose_name_plural = 'curriculum entries'
        constraints = [
            models.UniqueConstraint(
                fields=['programme', 'programme_year', 'period_type', 'period_number', 'course_unit'],
                name='he_curriculum_unique_placement'),
        ]
        indexes = [models.Index(fields=['school', 'programme'])]

    def __str__(self):
        return f'{self.programme.name}: {self.course_unit.code}'

    @property
    def effective_credits(self):
        return self.credits_override if self.credits_override is not None else self.course_unit.credits

    def clean(self):
        if self.credits_override is not None and self.credits_override <= 0:
            raise ValidationError({'credits_override': 'Credits must be greater than zero.'})
        if not 1 <= (self.period_number or 0) <= 6:
            raise ValidationError({'period_number': 'The period number must be between 1 and 6.'})
        if self.programme_id and self.programme.school_id != self.school_id:
            raise ValidationError({'programme': 'This programme belongs to another institution.'})
        if self.course_unit_id and self.course_unit.school_id != self.school_id:
            raise ValidationError({'course_unit': 'This course unit belongs to another institution.'})
        if self.programme_id and self.programme_year_id:
            if self.programme_year.programme_id != self.programme_id:
                raise ValidationError({'programme_year': 'This year does not belong to the programme.'})

    def save(self, *args, **kwargs):
        if self.programme_id and not self.school_id:
            self.school_id = self.programme.school_id
        self.full_clean(exclude=['school'])
        super().save(*args, **kwargs)


class CourseOffering(Stamped):
    """The delivery of a course unit in one academic period, with its lecturers."""

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_offerings')
    course_unit = models.ForeignKey(CourseUnit, on_delete=models.PROTECT, related_name='offerings')
    academic_period = models.ForeignKey(AcademicPeriod, on_delete=models.PROTECT, related_name='offerings')
    lecturers = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name='he_offerings',
        limit_choices_to={'role': 'TEACHER'},
    )

    class Meta:
        db_table = 'higher_ed_course_offerings'
        ordering = ['academic_period_id', 'course_unit__code']
        constraints = [
            models.UniqueConstraint(fields=['course_unit', 'academic_period'], name='he_offering_unique'),
        ]
        indexes = [models.Index(fields=['school', 'academic_period'])]

    def __str__(self):
        return f'{self.course_unit.code} in {self.academic_period.name}'

    def clean(self):
        if self.course_unit_id and self.course_unit.school_id != self.school_id:
            raise ValidationError({'course_unit': 'This course unit belongs to another institution.'})
        if self.academic_period_id and self.academic_period.school_id != self.school_id:
            raise ValidationError({'academic_period': 'This academic period belongs to another institution.'})

    def save(self, *args, **kwargs):
        if self.course_unit_id and not self.school_id:
            self.school_id = self.course_unit.school_id
        self.full_clean(exclude=['school'])
        super().save(*args, **kwargs)


class DepartmentHead(Stamped):
    """Marks a lecturer as head of a department. Grants nothing beyond reading that department."""

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_department_heads')
    unit = models.OneToOneField(OrganizationalUnit, on_delete=models.CASCADE, related_name='head')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='he_headed_units')

    class Meta:
        db_table = 'higher_ed_department_heads'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.user_id} heads {self.unit_id}'

    def clean(self):
        if self.unit_id:
            if self.unit.school_id != self.school_id:
                raise ValidationError({'unit': 'This unit belongs to another institution.'})
            if self.unit.unit_type != OrganizationalUnit.DEPARTMENT:
                raise ValidationError({'unit': 'Only a department has a head of department.'})
        if self.user_id and (self.user.role != 'TEACHER' or self.user.school_id != self.school_id):
            raise ValidationError({'user': 'The head must be a lecturer of this institution.'})

    def save(self, *args, **kwargs):
        if self.unit_id and not self.school_id:
            self.school_id = self.unit.school_id
        self.full_clean(exclude=['school'])
        super().save(*args, **kwargs)


class Enrolment(Stamped):
    """A student's place in a programme, at a level (year), for one academic year.

    Higher education has no school "class": a student belongs to a programme and moves up a level each year.
    Promotion, deferral or leaving is a change here, never a deletion, so the history stays.
    """

    ACTIVE = 'active'
    DEFERRED = 'deferred'
    SUSPENDED = 'suspended'
    WITHDRAWN = 'withdrawn'
    GRADUATED = 'graduated'
    STATUS_CHOICES = [
        (ACTIVE, 'Active'),
        (DEFERRED, 'Deferred'),
        (SUSPENDED, 'Suspended'),
        (WITHDRAWN, 'Withdrawn'),
        (GRADUATED, 'Graduated'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_enrolments')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='he_enrolments')
    programme = models.ForeignKey(Programme, on_delete=models.PROTECT, related_name='enrolments')
    programme_year = models.ForeignKey(ProgrammeYear, on_delete=models.PROTECT, related_name='enrolments')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name='enrolments')
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=ACTIVE)

    class Meta:
        db_table = 'higher_ed_enrolments'
        ordering = ['programme__name', 'programme_year__number', 'student__name']
        constraints = [
            models.UniqueConstraint(fields=['student', 'academic_year'], name='he_enrolment_one_per_student_year'),
        ]
        indexes = [models.Index(fields=['school', 'programme', 'programme_year', 'status'])]

    def __str__(self):
        return f'{self.student_id} in {self.programme} ({self.programme_year}) {self.academic_year}'

    def clean(self):
        if self.programme_id and self.programme.school_id != self.school_id:
            raise ValidationError({'programme': 'This programme belongs to another institution.'})
        if self.programme_year_id and self.programme_year.programme_id != self.programme_id:
            raise ValidationError({'programme_year': 'This level does not belong to the programme.'})
        if self.academic_year_id and self.academic_year.school_id != self.school_id:
            raise ValidationError({'academic_year': 'This academic year belongs to another institution.'})

    def save(self, *args, **kwargs):
        self.full_clean(exclude=['student'])
        super().save(*args, **kwargs)


class CourseResult(Stamped):
    """One student's result in one course offering: continuous assessment (CA) plus the exam.

    Cameroonian higher education marks a course unit from continuous assessment and a final exam. The
    institution's grading policy says what the total is out of and how it becomes a grade. A lecturer saves
    scores, which save at once (there is no draft); the administrator publishes. A student only ever sees published results.
    """

    SUBMITTED = 'submitted'
    PUBLISHED = 'published'
    STATUS_CHOICES = [(SUBMITTED, 'Submitted'), (PUBLISHED, 'Published')]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_results')
    offering = models.ForeignKey(CourseOffering, on_delete=models.CASCADE, related_name='results')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='he_results')
    ca_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    exam_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    total_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    grade = models.CharField(max_length=40, blank=True, default='')
    grade_points = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    passed = models.BooleanField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=SUBMITTED, db_index=True)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'higher_ed_course_results'
        ordering = ['offering__academic_period_id', 'offering__course_unit__code']
        constraints = [
            models.UniqueConstraint(fields=['offering', 'student'], name='he_result_one_per_student_offering'),
        ]
        indexes = [models.Index(fields=['school', 'status']), models.Index(fields=['student', 'status'])]

    def __str__(self):
        return f'{self.student_id} {self.offering} {self.total_score}'


class TuitionFee(Stamped):
    """A fee charged for one programme level in one academic year, in XAF (CFA francs, no decimals).

    A level can carry several lines (tuition, registration, medical, ...). Every active student enrolled in that
    level and year owes the sum of its lines. Fees are set once per programme level, not per student.
    """

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_tuition_fees')
    programme_year = models.ForeignKey(ProgrammeYear, on_delete=models.CASCADE, related_name='fees')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='fees')
    name = models.CharField(max_length=80, default='Tuition')
    amount = models.PositiveIntegerField()

    class Meta:
        db_table = 'higher_ed_tuition_fees'
        ordering = ['academic_year_id', 'programme_year__programme__name', 'programme_year__number', 'name']
        constraints = [
            models.UniqueConstraint(fields=['programme_year', 'academic_year', 'name'], name='he_fee_unique_line'),
        ]
        indexes = [models.Index(fields=['school', 'academic_year'])]

    def __str__(self):
        return f'{self.name} {self.amount} XAF'

    def clean(self):
        if self.programme_year_id and self.programme_year.programme.school_id != self.school_id:
            raise ValidationError({'programme_year': 'This level belongs to another institution.'})
        if self.academic_year_id and self.academic_year.school_id != self.school_id:
            raise ValidationError({'academic_year': 'This academic year belongs to another institution.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class FeePayment(Stamped):
    """Money received from a student against their fees for the academic year. Never deleted: it is voided.

    Each payment gets a receipt number, unique in the institution. Voiding keeps the line (who, when, why) so
    the books stay auditable, and a voided payment no longer counts towards the balance.
    """

    CASH = 'cash'
    MTN_MOMO = 'mtn_momo'
    ORANGE_MONEY = 'orange_money'
    BANK = 'bank'
    OTHER = 'other'
    METHOD_CHOICES = [
        (CASH, 'Cash'), (MTN_MOMO, 'MTN Mobile Money'), (ORANGE_MONEY, 'Orange Money'),
        (BANK, 'Bank transfer or deposit'), (OTHER, 'Other'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='he_fee_payments')
    enrolment = models.ForeignKey(Enrolment, on_delete=models.PROTECT, related_name='payments')
    amount = models.PositiveIntegerField()
    method = models.CharField(max_length=16, choices=METHOD_CHOICES, default=CASH)
    reference = models.CharField(max_length=80, blank=True, default='')
    paid_on = models.DateField()
    note = models.CharField(max_length=200, blank=True, default='')
    receipt_number = models.CharField(max_length=24)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    is_void = models.BooleanField(default=False)
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        db_table = 'higher_ed_fee_payments'
        ordering = ['-paid_on', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['school', 'receipt_number'], name='he_payment_receipt_unique'),
        ]
        indexes = [models.Index(fields=['school', 'enrolment', 'is_void'])]

    def __str__(self):
        return f'{self.receipt_number} {self.amount} XAF'

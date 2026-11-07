from django.db import models
from django_extensions.db.models import TimeStampedModel
import uuid


class AttendanceSession(TimeStampedModel):
    PERIOD_CHOICES = [
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
        ('full_day', 'Full Day'),
        ('daily', 'Daily'),
    ]
    TYPE_PERIOD = 'period'
    TYPE_DAILY = 'daily'
    SESSION_TYPE_CHOICES = [
        (TYPE_PERIOD, 'Per period / subject'),
        (TYPE_DAILY, 'Daily class register'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='attendance_sessions')
    teacher = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True,
                                related_name='attendance_sessions',
                                limit_choices_to={'role': 'TEACHER'})
    subject = models.ForeignKey('grades.Subject', on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='attendance_sessions')
    school_class = models.ForeignKey(
        'schools.SchoolClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attendance_sessions',
    )
    student_class = models.CharField(max_length=100)
    date = models.DateField(db_index=True)
    period = models.CharField(max_length=20, choices=PERIOD_CHOICES)
    notes = models.TextField(blank=True, null=True)
    # 'period' is the original per-period/per-subject session. 'daily' is the
    # basic-education class register: one per class per day, no subject.
    session_type = models.CharField(max_length=10, choices=SESSION_TYPE_CHOICES, default=TYPE_PERIOD)
    # Client-generated key so an offline client can resubmit safely.
    client_ref = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        ordering = ['-date', '-created']
        unique_together = [['school', 'teacher', 'student_class', 'date', 'period']]
        constraints = [
            models.UniqueConstraint(
                fields=['school_class', 'date'],
                condition=models.Q(session_type='daily'),
                name='attendance_one_daily_session_per_class_day',
            ),
            models.UniqueConstraint(
                fields=['school', 'client_ref'],
                condition=models.Q(client_ref__isnull=False),
                name='attendance_unique_client_ref_per_school',
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'date']),
            models.Index(fields=['teacher', 'date']),
            models.Index(fields=['school_class']),
        ]

    def __str__(self):
        return f"{self.student_class} - {self.date} ({self.period})"

    def save(self, *args, **kwargs):
        if self.school_class:
            self.student_class = self.school_class.name
            if not self.school_id:
                self.school = self.school_class.school
        super().save(*args, **kwargs)


class AttendanceRecord(TimeStampedModel):
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('excused', 'Excused'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name='records')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='attendance_records')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    excuse_note = models.TextField(blank=True, null=True)
    notified_parent = models.BooleanField(default=False)

    class Meta:
        ordering = ['-session__date', 'student__user__name']
        unique_together = [['session', 'student']]
        indexes = [
            models.Index(fields=['student', 'session']),
        ]

    def __str__(self):
        return f"{self.student.admission_number} - {self.session.date} ({self.status})"


class TeacherAttendance(TimeStampedModel):
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='teacher_attendances')
    teacher = models.ForeignKey('users.User', on_delete=models.CASCADE,
                                related_name='teacher_attendance_records',
                                limit_choices_to={'role': 'TEACHER'})
    date = models.DateField(db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    check_in_time = models.TimeField(null=True, blank=True)
    check_out_time = models.TimeField(null=True, blank=True)
    noted_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name='noted_teacher_attendances',
                                 limit_choices_to={'role__in': ['SCHOOL_ADMIN', 'SUB_ADMIN']})

    class Meta:
        ordering = ['-date', 'teacher__name']
        unique_together = [['school', 'teacher', 'date']]
        indexes = [
            models.Index(fields=['school', 'date']),
            models.Index(fields=['teacher', 'date']),
        ]

    def __str__(self):
        return f"{self.teacher.get_full_name()} - {self.date} ({self.status})"

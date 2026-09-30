from django.db import models
from django.utils import timezone
from django.contrib.postgres.fields import ArrayField
from core.models import TimeStampedModel


class AIRequest(TimeStampedModel):
    REQUEST_TYPE_CHOICES = [
        ('study_plan', 'Study Plan Generation'),
        ('grade_analysis', 'Grade Analysis'),
        ('attendance_insight', 'Attendance Insight'),
        ('report_summary', 'Report Summary'),
        ('subject_recommendation', 'Subject Recommendation'),
        ('exam_prep', 'Exam Preparation'),
        ('parent_report', 'Parent Report'),
        ('teacher_insight', 'Teacher Insight'),
        ('ai_exam_generation', 'AI Exam Generation'),
        ('career_orientation', 'Career Orientation'),
        ('academic_roadmap', 'Academic Roadmap'),
        ('skill_gap_analysis', 'Skill Gap Analysis'),
        ('student_guidance', 'Student Guidance Report'),
        ('general', 'General Query'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='ai_requests'
    )
    school = models.ForeignKey(
        'schools.School',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='ai_requests'
    )
    request_type = models.CharField(
        max_length=50,
        choices=REQUEST_TYPE_CHOICES
    )
    prompt = models.TextField()
    response = models.TextField(blank=True)
    model_used = models.CharField(
        max_length=100,
        default='llama-3.3-70b-versatile'
    )
    tokens_used = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    error_message = models.TextField(blank=True)
    processing_time_ms = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['school', '-created_at']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['request_type', '-created_at']),
        ]

    def __str__(self):
        return f"{self.get_request_type_display()} - {self.user} - {self.status}"

    def mark_completed(self, response, tokens_used=0, processing_time_ms=0):
        """Mark request as completed with response."""
        self.status = 'completed'
        self.response = response
        self.tokens_used = tokens_used
        self.processing_time_ms = processing_time_ms
        self.save(update_fields=['status', 'response', 'tokens_used', 'processing_time_ms', 'updated_at'])

    def mark_failed(self, error_message):
        """Mark request as failed with error message."""
        self.status = 'failed'
        self.error_message = error_message
        self.save(update_fields=['status', 'error_message', 'updated_at'])


class AIInsight(TimeStampedModel):
    INSIGHT_TYPE_CHOICES = [
        ('weekly_performance', 'Weekly Performance'),
        ('attendance_alert', 'Attendance Alert'),
        ('honour_roll_prediction', 'Honour Roll Prediction'),
        ('dropout_risk', 'Dropout Risk'),
    ]

    school = models.ForeignKey(
        'schools.School',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='ai_insights'
    )
    insight_type = models.CharField(
        max_length=50,
        choices=INSIGHT_TYPE_CHOICES
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    data = models.JSONField(default=dict)
    target_role = models.CharField(
        max_length=100,
        help_text='Comma-separated roles that should see this insight (e.g., executive,principal,teacher)'
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', 'is_active']),
            models.Index(fields=['insight_type', '-created_at']),
            models.Index(fields=['expires_at', 'is_active']),
        ]

    def __str__(self):
        return f"{self.get_insight_type_display()} - {self.title}"

    def is_expired(self):
        """Check if insight has expired."""
        if self.expires_at and timezone.now() > self.expires_at:
            return True
        return False

    def get_target_roles(self):
        """Get list of target roles."""
        return [role.strip() for role in self.target_role.split(',')]


class AIExamDraft(TimeStampedModel):
    """Holds AI-generated exam questions pending teacher review."""

    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft - Awaiting Review'
        REVIEWED = 'REVIEWED', 'Reviewed'
        PUBLISHED = 'PUBLISHED', 'Published to Exam'
        REJECTED = 'REJECTED', 'Rejected'
        FAILED = 'FAILED', 'Generation Failed'

    class ExamMode(models.TextChoices):
        ONLINE = 'ONLINE', 'Online'
        ONSITE = 'ONSITE', 'On-site (Printable)'

    class QuestionType(models.TextChoices):
        MCQ = 'MCQ', 'Multiple Choice Only'
        STRUCTURAL = 'STRUCTURAL', 'Structural Only'
        MIXED = 'MIXED', 'Mixed (MCQ + Structural)'

    class PublishTarget(models.TextChoices):
        EXAM = 'EXAM', 'Exam'
        ASSIGNMENT = 'ASSIGNMENT', 'Assignment'

    class Difficulty(models.TextChoices):
        EASY = 'easy', 'Easy'
        MEDIUM = 'medium', 'Medium'
        HARD = 'hard', 'Hard'
        MIXED = 'mixed', 'Mixed'

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='ai_exam_drafts')
    created_by = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='ai_exam_drafts')
    exam = models.OneToOneField(
        'exams.Exam',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ai_draft',
    )
    subject = models.ForeignKey('grades.Subject', on_delete=models.SET_NULL, null=True, blank=True)
    school_class = models.ForeignKey('schools.SchoolClass', on_delete=models.SET_NULL, null=True, blank=True)
    assignment = models.OneToOneField(
        'assignments.Assignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ai_draft',
    )
    title = models.CharField(max_length=255)
    topics = models.TextField(blank=True, help_text='Comma-separated list of topics')
    difficulty = models.CharField(max_length=20, choices=Difficulty.choices, default=Difficulty.MEDIUM)
    publish_target = models.CharField(max_length=20, choices=PublishTarget.choices, default=PublishTarget.EXAM)
    exam_mode = models.CharField(max_length=10, choices=ExamMode.choices, default=ExamMode.ONLINE)
    question_type = models.CharField(max_length=15, choices=QuestionType.choices, default=QuestionType.MCQ)
    num_mcq = models.PositiveIntegerField(default=10)
    num_structural = models.PositiveIntegerField(default=0)
    start_time = models.DateTimeField(null=True, blank=True)
    assignment_due_date = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    instructions = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    generation_error = models.TextField(blank=True)
    ai_request = models.OneToOneField(
        'ai_features.AIRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='exam_draft',
    )
    reviewed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_exam_drafts',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'ai_exam_drafts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', 'status']),
            models.Index(fields=['created_by', '-created_at']),
        ]

    def __str__(self):
        return f'{self.title} ({self.status})'


class AIExamQuestion(TimeStampedModel):
    """Individual question inside an AIExamDraft."""

    class QuestionKind(models.TextChoices):
        MCQ = 'MCQ', 'Multiple Choice'
        THEORY = 'THEORY', 'Theory'
        PROBLEM = 'PROBLEM', 'Problem Solving'
        ESSAY = 'ESSAY', 'Essay'
        PRACTICAL = 'PRACTICAL', 'Practical'

    draft = models.ForeignKey(AIExamDraft, on_delete=models.CASCADE, related_name='questions')
    order = models.PositiveIntegerField(default=1)
    kind = models.CharField(max_length=15, choices=QuestionKind.choices, default=QuestionKind.MCQ)
    text = models.TextField()
    options = models.JSONField(default=list, blank=True, help_text='List of 4 option strings for MCQ')
    correct_option = models.PositiveIntegerField(default=0, help_text='0-based index of correct option')
    expected_answer = models.TextField(blank=True)
    marking_guide = models.TextField(blank=True)
    marks = models.PositiveIntegerField(default=1)
    explanation = models.TextField(blank=True)
    is_edited = models.BooleanField(default=False, help_text='True if teacher manually edited this question')

    class Meta:
        db_table = 'ai_exam_questions'
        ordering = ['order']
        unique_together = [['draft', 'order']]

    def __str__(self):
        return f'{self.draft.title} Q{self.order}'


class QuestionBank(TimeStampedModel):
    """Reusable question store to reduce repeated AI generation costs."""

    class Kind(models.TextChoices):
        MCQ = 'MCQ', 'Multiple Choice'
        STRUCTURAL = 'STRUCTURAL', 'Structural'

    class Difficulty(models.TextChoices):
        EASY = 'easy', 'Easy'
        MEDIUM = 'medium', 'Medium'
        HARD = 'hard', 'Hard'

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='question_bank')
    subject_name = models.CharField(max_length=255)
    class_level = models.CharField(max_length=100)
    topic = models.CharField(max_length=255, blank=True)
    difficulty = models.CharField(max_length=20, choices=Difficulty.choices)
    kind = models.CharField(max_length=15, choices=Kind.choices)
    text = models.TextField()
    text_hash = models.CharField(max_length=64, db_index=True)
    options = models.JSONField(default=list, blank=True)
    correct_option = models.PositiveIntegerField(null=True, blank=True)
    expected_answer = models.TextField(blank=True)
    marking_guide = models.TextField(blank=True)
    marks = models.PositiveIntegerField(default=1)
    use_count = models.PositiveIntegerField(default=0, help_text='How many times this question was reused')
    source_draft = models.ForeignKey(
        AIExamDraft,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='banked_questions',
    )

    class Meta:
        db_table = 'question_bank'
        unique_together = [['school', 'text_hash']]
        indexes = [
            models.Index(fields=['school', 'subject_name', 'class_level']),
            models.Index(fields=['difficulty', 'kind']),
        ]

    def __str__(self):
        return f'{self.subject_name} - {self.kind}'


class CareerOrientationReport(TimeStampedModel):
    """Stores AI-generated career orientation reports per student."""

    class StudyStyle(models.TextChoices):
        ONLINE = 'online', 'Online'
        ONSITE = 'onsite', 'On-site'
        HYBRID = 'hybrid', 'Hybrid'

    class BudgetLevel(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'

    student = models.ForeignKey(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='career_reports',
        null=True,
        blank=True,
    )
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='career_reports')
    desired_career = models.CharField(max_length=255)
    education_level = models.CharField(max_length=100)
    country = models.CharField(max_length=100, default='Cameroon')
    favorite_subjects = models.JSONField(default=list)
    strengths = models.TextField(blank=True)
    career_goals = models.TextField(blank=True)
    preferred_university_country = models.CharField(max_length=100, blank=True)
    preferred_study_style = models.CharField(max_length=50, choices=StudyStyle.choices, blank=True)
    budget_level = models.CharField(max_length=20, choices=BudgetLevel.choices, blank=True)
    response_language = models.CharField(max_length=10, default='English')
    report_data = models.JSONField(default=dict, help_text='Structured career report from AI')
    status = models.CharField(max_length=20, choices=AIRequest.STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True)
    ai_request = models.OneToOneField('AIRequest', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'career_orientation_reports'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.desired_career} - {self.user}'


class AcademicRoadmap(TimeStampedModel):
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='roadmaps')
    academic_year = models.CharField(max_length=20)
    target_grade = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    target_career = models.CharField(max_length=255, blank=True)
    roadmap_data = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=AIRequest.STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True)
    ai_request = models.OneToOneField('AIRequest', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'academic_roadmaps'
        ordering = ['-created_at']


class SkillGapReport(TimeStampedModel):
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='skill_gap_reports')
    analysis_data = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=AIRequest.STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True)
    ai_request = models.OneToOneField('AIRequest', on_delete=models.SET_NULL, null=True, blank=True)
    sequence = models.ForeignKey('grades.Sequence', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'skill_gap_reports'
        ordering = ['-created_at']


class StudentGuidanceReport(TimeStampedModel):
    class Audience(models.TextChoices):
        STUDENT = 'student', 'Student'
        PARENT = 'parent', 'Parent'
        TEACHER = 'teacher', 'Teacher'

    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='guidance_reports')
    generated_by = models.ForeignKey('users.User', on_delete=models.CASCADE)
    audience = models.CharField(max_length=20, choices=Audience.choices, default=Audience.STUDENT)
    academic_year = models.CharField(max_length=20)
    term = models.CharField(max_length=20)
    report_data = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=AIRequest.STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True)
    ai_request = models.OneToOneField('AIRequest', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'student_guidance_reports'
        ordering = ['-created_at']


# The credit engine's records live in their own module to keep this one about
# the AI features themselves; they are imported here so Django finds them.
from .credit_models import (  # noqa: E402,F401
    AICreditAccount,
    AICreditConfig,
    AICreditHold,
    AICreditTransaction,
    AIUsageRecord,
)

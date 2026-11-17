import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class MarkingJob(models.Model):
    """One batch of exam scripts marked together against a marking scheme.

    The teacher uploads the scheme and the scripts, sees what it will cost, and authorises it. The AI marks; the
    teacher reviews, adjusts and approves; only then are marks saved and (when the teacher publishes) shown to students.
    The uploaded pictures are kept only until the marking has run, then deleted.
    """

    APPROACHES = [
        ('strict', 'Strict marking'),
        ('idea_based', 'Idea-based marking'),
        ('conceptual', 'Conceptual understanding'),
        ('partial_credit', 'Partial credit'),
        ('custom', 'Custom instructions'),
    ]
    UPLOADED, MARKING, REVIEW, FAILED = 'uploaded', 'marking', 'review', 'failed'
    STATUSES = [(UPLOADED, 'Waiting for authorisation'), (MARKING, 'Marking'), (REVIEW, 'Ready for review'), (FAILED, 'Failed')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='marking_jobs')
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='marking_jobs')
    title = models.CharField(max_length=160)
    scope_key = models.CharField(max_length=120, blank=True, db_index=True)   # which screen / class / subject it came from
    approach = models.CharField(max_length=16, choices=APPROACHES, default='idea_based')
    custom_instructions = models.TextField(blank=True)
    scheme_text = models.TextField(blank=True)
    paper_total = models.DecimalField(max_digits=6, decimal_places=2)
    pages_per_script = models.PositiveSmallIntegerField(default=1)
    roster = models.JSONField(default=list)             # [{id, name, matricule}] students the scripts can belong to
    script_count = models.PositiveIntegerField(default=0)
    page_count = models.PositiveIntegerField(default=0)
    estimate_credits = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUSES, default=UPLOADED)
    progress = models.PositiveIntegerField(default=0)   # scripts finished
    error = models.TextField(blank=True)
    ai_request = models.ForeignKey('ai_features.AIRequest', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ai_marking_jobs'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['school', 'teacher', '-created_at'])]

    def __str__(self):
        return self.title


class MarkingPage(models.Model):
    """A picture of one page, kept only until the job has been marked."""

    SCHEME, SCRIPT = 'scheme', 'script'
    job = models.ForeignKey(MarkingJob, on_delete=models.CASCADE, related_name='pages')
    kind = models.CharField(max_length=8)
    index = models.PositiveIntegerField()
    data = models.BinaryField()

    class Meta:
        db_table = 'ai_marking_pages'
        ordering = ['kind', 'index']


class MarkedScript(models.Model):
    DRAFT, APPROVED = 'marked', 'approved'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(MarkingJob, on_delete=models.CASCADE, related_name='scripts')
    index = models.PositiveIntegerField()
    student = models.ForeignKey('students.Student', null=True, blank=True, on_delete=models.SET_NULL, related_name='marked_scripts')
    detected_name = models.CharField(max_length=160, blank=True)
    detected_matricule = models.CharField(max_length=60, blank=True)
    questions = models.JSONField(default=list)         # [{no, max, awarded, student_answer, comment, correction}]
    total = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal('0'))
    feedback = models.TextField(blank=True)
    warning = models.CharField(max_length=200, blank=True)
    failed = models.BooleanField(default=False)
    edited = models.BooleanField(default=False)
    status = models.CharField(max_length=10, default=DRAFT)
    published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'ai_marking_scripts'
        ordering = ['job_id', 'index']

    @property
    def paper_total(self):
        return self.job.paper_total


class MarkingChallenge(models.Model):
    """A student's question about how one answer was marked, for the teacher to answer."""

    OPEN, RESOLVED = 'open', 'resolved'
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    script = models.ForeignKey(MarkedScript, on_delete=models.CASCADE, related_name='challenges')
    question_no = models.CharField(max_length=20, blank=True)
    message = models.TextField()
    status = models.CharField(max_length=8, default=OPEN)
    response = models.TextField(blank=True)
    new_awarded = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'ai_marking_challenges'
        ordering = ['-created_at']

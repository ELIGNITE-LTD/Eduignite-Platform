import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class MarkSheet(models.Model):
    """A printable sheet for entering marks on paper, and what the system needs to read it back.

    It remembers who the students are (in order), what is being marked and how many digit boxes each mark has, so a
    photo of the filled sheet can be matched to the right student. It stores no marks and no photos: marks are saved
    by the same screens and rules teachers already use, after the teacher has reviewed what the system read.
    """

    KIND_CHOICES = [
        ('grade', 'Secondary marks (one sequence)'),
        ('class_mark', 'Primary marks (CA or exam)'),
        ('he_result', 'Higher education (CA or exam)'),
        ('rating', 'Nursery ratings'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='mark_sheets')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    kind = models.CharField(max_length=12, choices=KIND_CHOICES)
    title = models.CharField(max_length=120)
    subtitle_lines = models.JSONField(default=list, blank=True)
    max_score = models.DecimalField(max_digits=6, decimal_places=2)
    int_digits = models.PositiveSmallIntegerField(default=2)
    decimals = models.PositiveSmallIntegerField(default=2)
    scope = models.JSONField(default=dict, blank=True)    # what the screen needs to save the marks (kept as given)
    rows = models.JSONField(default=list)                 # [{student_id, name, matricule}] in print order
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mark_sheets'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['school', '-created_at'])]

    def __str__(self):
        return f'{self.title} ({self.id})'

    @property
    def school_name(self):
        return self.school.name

    @property
    def max_label(self):
        return format(Decimal(self.max_score).normalize(), 'f')

from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class StaffRemark(TimeStampedModel):
    REMARK_TYPE_CHOICES = [
        ('Commendation', 'Commendation'),
        ('Warning', 'Warning'),
        ('Observation', 'Observation'),
        ('Disciplinary', 'Disciplinary'),
    ]

    staff = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='received_remarks')
    admin = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='given_remarks')
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE)
    text = models.TextField()
    remark_type = models.CharField(max_length=20, choices=REMARK_TYPE_CHOICES)
    is_confidential = models.BooleanField(default=False)
    acknowledged = models.BooleanField(default=False)
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['staff', 'school']),
            models.Index(fields=['admin', 'school']),
        ]

    def __str__(self):
        return f"{self.get_remark_type_display()} for {self.staff.get_full_name()}"

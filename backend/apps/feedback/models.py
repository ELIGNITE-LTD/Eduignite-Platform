from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Feedback(TimeStampedModel):
    STATUS_CHOICES = [
        ('New', 'New'),
        ('In_Progress', 'In Progress'),
        ('Resolved', 'Resolved'),
        ('Closed', 'Closed'),
    ]

    PRIORITY_CHOICES = [
        ('Low', 'Low'),
        ('Medium', 'Medium'),
        ('High', 'High'),
        ('Critical', 'Critical'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE)
    sender = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='sent_feedback')
    subject = models.CharField(max_length=255)
    message = models.TextField()
    category = models.CharField(max_length=80, blank=True, default='general')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='New')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='Medium')
    resolved_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='resolved_feedbacks')
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_note = models.TextField(blank=True)
    attachment = models.FileField(upload_to='feedback/', null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', 'status']),
            models.Index(fields=['sender', 'status']),
        ]

    def __str__(self):
        return f"{self.subject} - {self.get_status_display()}"


class FeedbackResponse(TimeStampedModel):
    feedback = models.ForeignKey(Feedback, on_delete=models.CASCADE, related_name='responses')
    responder = models.ForeignKey('users.User', on_delete=models.CASCADE)
    message = models.TextField()

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['feedback']),
        ]

    def __str__(self):
        return f"Response to {self.feedback.subject}"

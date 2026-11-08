from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Order(TimeStampedModel):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('contacted', 'Contacted'),
        ('processed', 'Processed'),
        ('rejected', 'Rejected'),
    ]

    full_name = models.CharField(max_length=255)
    occupation = models.CharField(max_length=255)
    school_name = models.CharField(max_length=255)
    whatsapp_number = models.CharField(max_length=20)
    email = models.EmailField()
    region = models.CharField(max_length=255)
    division = models.CharField(max_length=255)
    sub_division = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    processed_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, help_text="Internal executive notes")
    # Who sent this school our way. The code is kept exactly as it arrived,
    # even when it matches nobody, so a mistyped or retired link can still be
    # traced rather than silently discarded.
    referral_code = models.CharField(max_length=12, blank=True, default='', db_index=True)
    referred_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='referred_orders',
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['email']),
        ]

    def __str__(self):
        return f"{self.full_name} - {self.school_name}"


class EmailNotificationLog(models.Model):
    """One row per account-request email already sent (or being sent).

    ``key`` is unique, so a retry, a double click or two workers racing for the
    same event can claim it only once: whoever inserts the row sends the email.
    A failed send removes the claim so the event can be retried.
    """

    key = models.CharField(max_length=190, unique=True)
    event = models.CharField(max_length=60)
    recipient = models.CharField(max_length=254, blank=True)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f'{self.event} -> {self.recipient}'

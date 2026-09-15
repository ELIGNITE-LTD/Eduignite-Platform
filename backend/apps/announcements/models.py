from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone

ALLOWED_ATTACHMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif']


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Announcement(TimeStampedModel):
    """A message to an audience. Who may choose which audience, and who
    receives each one, is defined in ``audience.py`` and nowhere else."""

    TARGET_CHOICES = [
        # Platform audiences, used when ``school`` is empty.
        ('EXECUTIVE', 'Executive'),
        ('ALL_SCHOOL_USERS', 'All School Users'),
        ('ALL_EDUIGNITE_USERS', 'All EduIgnite Users'),
        ('PRINCIPAL', 'Principal'),
        # School audiences, used when ``school`` is set. PARENT is shared: on
        # a platform announcement it means parents everywhere, or of
        # ``target_school`` when one is chosen.
        ('ALL', 'All School Members'),
        ('SCHOOL_ALL', 'All School Members'),
        ('STUDENT', 'Students Only'),
        ('TEACHER', 'Teachers Only'),
        ('PARENT', 'Parents'),
        ('BURSAR', 'Bursar Only'),
        ('LIBRARIAN', 'Librarian Only'),
        ('PERSONAL', 'Personal Message'),
        # Retired platform targets. Migration 0006 rewrote every stored row
        # to EXECUTIVE; they remain listed only so old admin history renders.
        ('EXECUTIVE_BOARD', 'Executive Board (retired)'),
        ('STAFF', 'Platform Staff (retired)'),
        ('PARTNER', 'Partners & Investors (retired)'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, null=True, blank=True)
    sender = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='sent_announcements')
    title = models.CharField(max_length=255)
    content = models.TextField()
    target = models.CharField(max_length=20, choices=TARGET_CHOICES)
    target_user = models.ForeignKey('users.User', on_delete=models.CASCADE, null=True, blank=True,
                                     related_name='personal_announcements')
    target_school = models.ForeignKey(
        'schools.School',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='targeted_announcements',
        help_text='Platform parent announcements only: limits delivery to parents of this school.',
    )
    legacy_target = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text='The target this row had before the audience repair migration, kept for audit.',
    )
    is_pinned = models.BooleanField(default=False)
    expires_at = models.DateTimeField(null=True, blank=True)
    # School staff can attach a file that reaches every student/parent/staff
    # member targeted by the announcement; the extension allowlist is what
    # stops an .html/.svg upload from executing when a recipient opens it.
    attachment = models.FileField(
        upload_to='announcements/',
        null=True,
        blank=True,
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_ATTACHMENT_EXTENSIONS)],
    )
    view_count = models.IntegerField(default=0)

    class Meta:
        ordering = ['-is_pinned', '-created_at']
        indexes = [
            models.Index(fields=['school', 'target']),
            models.Index(fields=['sender']),
        ]

    def __str__(self):
        return f"{self.title} - {self.get_target_display()}"

    def is_expired(self):
        if self.expires_at:
            return self.expires_at < timezone.now()
        return False


class AnnouncementAudienceGrant(models.Model):
    """Lets the CEO extend a non-CEO executive's announcement audiences
    beyond the executive audience they always have."""

    AUDIENCE_CHOICES = [
        ('ALL_SCHOOL_USERS', 'All School Users'),
        ('ALL_EDUIGNITE_USERS', 'All EduIgnite Users'),
        ('PRINCIPAL', 'Principal'),
        ('PARENT', 'Parent'),
    ]

    user = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='announcement_audience_grants',
    )
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES)
    granted_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['user', 'audience']]
        ordering = ['user_id', 'audience']

    def __str__(self):
        return f'{self.user_id} may announce to {self.audience}'


class AnnouncementRead(models.Model):
    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name='reads')
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='announcement_reads')
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['announcement', 'user']]
        indexes = [
            models.Index(fields=['user', 'read_at']),
        ]

    def __str__(self):
        return f"{self.user.get_full_name()} read {self.announcement.title}"

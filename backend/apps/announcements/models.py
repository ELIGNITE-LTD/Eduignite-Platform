from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Announcement(TimeStampedModel):
    TARGET_CHOICES = [
        ('ALL', 'All Users'),
        ('EXECUTIVE_BOARD', 'Executive Board'),
        ('STAFF', 'Platform Staff'),
        ('PARTNER', 'Partners & Investors'),
        ('STUDENT', 'Students Only'),
        ('TEACHER', 'Teachers Only'),
        ('PARENT', 'Parents Only'),
        ('BURSAR', 'Bursar Only'),
        ('LIBRARIAN', 'Librarian Only'),
        ('SCHOOL_ALL', 'All School Members'),
        ('PERSONAL', 'Personal Message'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, null=True, blank=True)
    sender = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='sent_announcements')
    title = models.CharField(max_length=255)
    content = models.TextField()
    target = models.CharField(max_length=20, choices=TARGET_CHOICES)
    target_user = models.ForeignKey('users.User', on_delete=models.CASCADE, null=True, blank=True,
                                     related_name='personal_announcements')
    is_pinned = models.BooleanField(default=False)
    expires_at = models.DateTimeField(null=True, blank=True)
    attachment = models.FileField(upload_to='announcements/', null=True, blank=True)
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

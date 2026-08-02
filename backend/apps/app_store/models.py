import uuid

from django.conf import settings
from django.db import models
from django_extensions.db.models import TimeStampedModel


class AppCategory(models.TextChoices):
    ANDROID = 'android', 'Android'
    IPHONE = 'iphone', 'iPhone'
    WINDOWS = 'windows', 'Windows'
    MAC = 'mac', 'Mac'


def app_store_upload_to(instance, filename):
    return f'app-store/{instance.id}/{filename}'


class AppStoreItem(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, db_index=True)
    category = models.CharField(max_length=30, choices=AppCategory.choices, db_index=True)
    short_description = models.CharField(max_length=280)
    full_description = models.TextField(blank=True, default='')
    icon = models.ImageField(upload_to=app_store_upload_to, null=True, blank=True)
    thumbnail = models.ImageField(upload_to=app_store_upload_to, null=True, blank=True)
    screenshots = models.JSONField(default=list, blank=True)
    download_link = models.URLField(max_length=1000, blank=True, default='')
    apk_file = models.FileField(upload_to=app_store_upload_to, null=True, blank=True)
    youtube_video_link = models.URLField(max_length=1000, blank=True, default='')
    version = models.CharField(max_length=50, default='1.0.0')
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    featured = models.BooleanField(default=False, db_index=True)
    active = models.BooleanField(default=True, db_index=True)
    archived = models.BooleanField(default=False, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_app_store_items',
    )

    class Meta:
        ordering = ['-featured', 'title']
        indexes = [
            models.Index(fields=['category', 'active', 'archived']),
            models.Index(fields=['featured', 'active']),
            models.Index(fields=['created_by']),
        ]

    @property
    def created_at(self):
        return self.created

    @property
    def updated_at(self):
        return self.modified

    def __str__(self):
        return f'{self.title} ({self.get_category_display()})'

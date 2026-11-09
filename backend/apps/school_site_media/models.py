"""Public events and photo gallery of a school's website.

Everything here is separate from the internal ``schools.SchoolEvent`` (which is
authenticated and notifies every school user): a PublicEvent is written for the
public, is a draft until a school administrator publishes it, and never sends a
notification. Images are real files under MEDIA (never base64 in the database).
"""

import uuid

from django.conf import settings
from django.db import models

from . import timeutil


class ContentStatus(models.TextChoices):
    DRAFT = 'draft', 'Draft'
    PUBLISHED = 'published', 'Published'


class EventCategory(models.TextChoices):
    ACADEMIC = 'academic', 'Academic'
    CULTURAL = 'cultural', 'Cultural'
    SPORTS = 'sports', 'Sports'
    CEREMONY = 'ceremony', 'Ceremony'
    MEETING = 'meeting', 'Meeting'
    HOLIDAY = 'holiday', 'Holiday'
    OTHER = 'other', 'Other'


class AlbumCategory(models.TextChoices):
    CAMPUS = 'campus', 'Campus'
    CLASSROOMS = 'classrooms', 'Classrooms'
    LABS = 'labs', 'Labs'
    SPORTS = 'sports', 'Sports'
    CULTURAL = 'cultural', 'Cultural'
    EVENTS = 'events', 'Events'
    OTHER = 'other', 'Other'


def site_image_path(instance, filename):
    """Upload path built only from server-side values: the uploader's filename is never used."""
    return f'school_site/{instance.school_id}/{filename}'


class PublicEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='public_events')
    slug = models.SlugField(max_length=120)
    title_en = models.CharField(max_length=200, blank=True, default='')
    title_fr = models.CharField(max_length=200, blank=True, default='')
    description_en = models.TextField(blank=True, default='')
    description_fr = models.TextField(blank=True, default='')
    start_at = models.DateTimeField(db_index=True)
    end_at = models.DateTimeField(null=True, blank=True)
    # End used for upcoming/ongoing/past: end_at, else the end of the start's day
    # in Africa/Douala. Kept in step by save() so the database can classify.
    effective_end = models.DateTimeField(db_index=True, editable=False)
    location = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=20, choices=EventCategory.choices, default=EventCategory.OTHER)
    cover_image = models.ImageField(upload_to=site_image_path, null=True, blank=True, max_length=255)
    status = models.CharField(max_length=10, choices=ContentStatus.choices, default=ContentStatus.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    # Optional reference to the internal event this was created from. Never notifies anyone.
    linked_event = models.ForeignKey(
        'schools.SchoolEvent', null=True, blank=True, on_delete=models.SET_NULL, related_name='public_events')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_at']
        constraints = [models.UniqueConstraint(fields=['school', 'slug'], name='uniq_public_event_slug_per_school')]
        indexes = [models.Index(fields=['school', 'status', 'start_at'])]

    def save(self, *args, **kwargs):
        self.effective_end = timeutil.effective_end(self.start_at, self.end_at)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title_en or self.title_fr or str(self.id)


class PublicAlbum(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='public_albums')
    title_en = models.CharField(max_length=200, blank=True, default='')
    title_fr = models.CharField(max_length=200, blank=True, default='')
    category = models.CharField(max_length=20, choices=AlbumCategory.choices, default=AlbumCategory.OTHER)
    cover = models.ForeignKey(
        'school_site_media.PublicMedia', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    order = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=ContentStatus.choices, default=ContentStatus.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', '-created_at']
        indexes = [models.Index(fields=['school', 'status', 'order'])]

    def __str__(self):
        return self.title_en or self.title_fr or str(self.id)


class PublicMedia(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Denormalised from the album so quota and isolation checks are a single indexed filter.
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='public_media')
    album = models.ForeignKey(PublicAlbum, on_delete=models.CASCADE, related_name='media')
    image = models.ImageField(
        upload_to=site_image_path, width_field='width', height_field='height', max_length=255)
    thumbnail = models.ImageField(upload_to=site_image_path, null=True, blank=True, max_length=255)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    size_bytes = models.PositiveIntegerField(default=0)
    caption_en = models.CharField(max_length=300, blank=True, default='')
    caption_fr = models.CharField(max_length=300, blank=True, default='')
    alt_en = models.CharField(max_length=200, blank=True, default='')
    alt_fr = models.CharField(max_length=200, blank=True, default='')
    order = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']
        indexes = [models.Index(fields=['album', 'order'])]

    def __str__(self):
        return f'{self.album_id}:{self.id}'

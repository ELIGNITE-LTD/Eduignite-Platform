"""Public website settings for a school (additive; reuses the School record).

A school is public only when its SchoolPublicProfile is explicitly PUBLISHED.
Name, logo, banner, motto, description, address, phone and email stay on School.
"""

import uuid

from django.conf import settings
from django.db import models


class PublicationStatus(models.TextChoices):
    DRAFT = 'draft', 'Draft'
    PUBLISHED = 'published', 'Published'
    UNPUBLISHED = 'unpublished', 'Unpublished'


class SchoolPublicProfile(models.Model):
    """Extra public-site content and the publication switch for one school."""

    school = models.OneToOneField('schools.School', on_delete=models.CASCADE, related_name='public_profile')

    # Identity text, English and French variants as sibling columns.
    vision_en = models.TextField(blank=True, default='')
    vision_fr = models.TextField(blank=True, default='')
    mission_en = models.TextField(blank=True, default='')
    mission_fr = models.TextField(blank=True, default='')
    history_en = models.TextField(blank=True, default='')
    history_fr = models.TextField(blank=True, default='')
    # List of {"en": "...", "fr": "..."}.
    core_values = models.JSONField(blank=True, default=list)

    hero_title_en = models.CharField(max_length=200, blank=True, default='')
    hero_title_fr = models.CharField(max_length=200, blank=True, default='')
    hero_subtitle_en = models.CharField(max_length=300, blank=True, default='')
    hero_subtitle_fr = models.CharField(max_length=300, blank=True, default='')
    cta_primary_label_en = models.CharField(max_length=60, blank=True, default='')
    cta_primary_label_fr = models.CharField(max_length=60, blank=True, default='')
    cta_secondary_label_en = models.CharField(max_length=60, blank=True, default='')
    cta_secondary_label_fr = models.CharField(max_length=60, blank=True, default='')
    theme_accent = models.CharField(max_length=7, blank=True, default='')

    # Contact visibility: the school's email / phone / principal are private unless opted in.
    show_email = models.BooleanField(default=False)
    show_phone = models.BooleanField(default=False)
    show_principal = models.BooleanField(default=False)
    enrollment_enabled = models.BooleanField(default=False)

    meta_title_en = models.CharField(max_length=120, blank=True, default='')
    meta_title_fr = models.CharField(max_length=120, blank=True, default='')
    meta_description_en = models.CharField(max_length=300, blank=True, default='')
    meta_description_fr = models.CharField(max_length=300, blank=True, default='')
    og_image = models.URLField(max_length=500, blank=True, default='')
    social_links = models.JSONField(blank=True, default=dict)

    publication_status = models.CharField(
        max_length=12, choices=PublicationStatus.choices, default=PublicationStatus.DRAFT, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True)
    # A founder force-unpublish sets this; the school admin cannot republish until it is lifted.
    locked_by_founder = models.BooleanField(default=False)
    preview_token = models.CharField(max_length=64, blank=True, default='')
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'School public profile'

    def __str__(self):
        return f'{self.school_id} ({self.publication_status})'


class PublicSiteAuditLog(models.Model):
    """Who changed what on a school's public site."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='public_site_audit')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    actor_name = models.CharField(max_length=200, blank=True, default='')
    action = models.CharField(max_length=40)
    # {field: {"before": summary, "after": summary}}
    changes = models.JSONField(blank=True, default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['school', '-created_at'])]

    def __str__(self):
        return f'{self.school_id} {self.action}'

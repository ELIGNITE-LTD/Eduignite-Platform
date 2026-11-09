"""Content for a school's public website: blog posts and the leadership team.

Kept in its own app so these tables ship with their own migration history.
Nothing here duplicates an existing record: a leader points at the school's
existing staff account (``users.User``); the platform blog (``CommunityBlog``)
is a different thing and is not reused.
"""

import uuid

from django.conf import settings
from django.db import models


def _image_path(instance, filename):
    ext = (filename.rsplit('.', 1)[-1] if '.' in filename else 'jpg').lower()
    return f'school_site/{instance.school_id}/{uuid.uuid4().hex}.{ext}'


class SchoolSiteImage(models.Model):
    """An image a school uploaded for its site. Rich text may only embed these."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='site_images')
    image = models.ImageField(upload_to=_image_path, max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class SchoolPostCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='post_categories')
    slug = models.SlugField(max_length=80)
    name_en = models.CharField(max_length=80, blank=True, default='')
    name_fr = models.CharField(max_length=80, blank=True, default='')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'slug']
        constraints = [models.UniqueConstraint(fields=['school', 'slug'], name='uniq_post_category_slug_per_school')]


class PostStatus(models.TextChoices):
    DRAFT = 'draft', 'Draft'
    PUBLISHED = 'published', 'Published'
    UNPUBLISHED = 'unpublished', 'Unpublished'


class SchoolPost(models.Model):
    """One blog article of one school. Body is sanitised HTML (allow-list)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='posts')
    slug = models.SlugField(max_length=120)
    title_en = models.CharField(max_length=200, blank=True, default='')
    title_fr = models.CharField(max_length=200, blank=True, default='')
    excerpt_en = models.CharField(max_length=400, blank=True, default='')
    excerpt_fr = models.CharField(max_length=400, blank=True, default='')
    body_en = models.TextField(blank=True, default='')
    body_fr = models.TextField(blank=True, default='')
    category = models.ForeignKey(
        SchoolPostCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name='posts')
    cover_image = models.ForeignKey(
        SchoolSiteImage, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    status = models.CharField(max_length=12, choices=PostStatus.choices, default=PostStatus.DRAFT, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    author_name = models.CharField(max_length=200, blank=True, default='')
    seo_title_en = models.CharField(max_length=120, blank=True, default='')
    seo_title_fr = models.CharField(max_length=120, blank=True, default='')
    seo_description_en = models.CharField(max_length=300, blank=True, default='')
    seo_description_fr = models.CharField(max_length=300, blank=True, default='')
    preview_token = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-published_at', '-created_at']
        constraints = [models.UniqueConstraint(fields=['school', 'slug'], name='uniq_post_slug_per_school')]
        indexes = [models.Index(fields=['school', 'status', '-published_at'], name='post_school_status_pub_idx')]


class LeaderRole(models.TextChoices):
    PRINCIPAL = 'principal', 'Principal'
    VICE_PRINCIPAL = 'vice_principal', 'Vice Principal'
    HEAD_OF_STUDIES = 'head_of_studies', 'Head of Studies'
    DISCIPLINE_MASTER = 'discipline_master', 'Discipline Master'
    BURSAR = 'bursar', 'Bursar'
    OTHER = 'other', 'Other'


class PublicLeader(models.Model):
    """A member of the school's existing staff presented on the public site."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='public_leaders')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    public_title_en = models.CharField(max_length=120, blank=True, default='')
    public_title_fr = models.CharField(max_length=120, blank=True, default='')
    role_category = models.CharField(max_length=20, choices=LeaderRole.choices, default=LeaderRole.OTHER)
    order = models.PositiveIntegerField(default=0)
    show_photo = models.BooleanField(default=False)
    bio_en = models.TextField(blank=True, default='')
    bio_fr = models.TextField(blank=True, default='')
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'created_at']
        constraints = [models.UniqueConstraint(fields=['school', 'user'], name='uniq_public_leader_per_user')]
        indexes = [models.Index(fields=['school', 'is_visible', 'order'], name='leader_school_vis_order_idx')]

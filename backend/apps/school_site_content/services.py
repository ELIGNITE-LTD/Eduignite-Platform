"""Business rules for school blog posts and the public leadership team.

Views, and other apps (through ``apps.school_site_content.api``), call these
functions. They never read ``request.user.school``: the caller passes the
school, so an executive acting for a school (module ``school_websites``) and a
school administrator go through exactly the same checks.
"""

import io
import math

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from apps.schools import public_site_services as site_svc
from apps.users.models import User, UserRole

from .models import (
    LeaderRole, PostStatus, PublicLeader, SchoolPost, SchoolPostCategory, SchoolSiteImage,
)
from .sanitize import plain_text, sanitize_html

LANGS = ('en', 'fr')
WORDS_PER_MINUTE = 200
MAX_BODY_CHARS = 200_000
MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_FORMATS = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp', 'GIF': 'gif'}

POST_TEXT_LIMITS = {
    'title': 200, 'excerpt': 400, 'seo_title': 120, 'seo_description': 300,
}
POST_TEXT_FIELDS = [f'{base}_{lang}' for base in POST_TEXT_LIMITS for lang in LANGS]
POST_BODY_FIELDS = [f'body_{lang}' for lang in LANGS]
POST_EDITABLE = POST_TEXT_FIELDS + POST_BODY_FIELDS + ['slug', 'category', 'cover_image']

STAFF_ROLES = (UserRole.SCHOOL_ADMIN, UserRole.SUB_ADMIN, UserRole.TEACHER, UserRole.BURSAR, UserRole.LIBRARIAN)


# --------------------------------------------------------------------------- images

def upload_image(school, user, uploaded):
    """Validate and store one image for the school. Returns the SchoolSiteImage."""
    from PIL import Image, UnidentifiedImageError

    if uploaded is None:
        raise ValidationError({'file': 'Choose an image to upload.'})
    if uploaded.size <= 0 or uploaded.size > MAX_IMAGE_BYTES:
        raise ValidationError({'file': 'The image must be smaller than 5 MB.'})
    raw = uploaded.read()
    try:
        image = Image.open(io.BytesIO(raw))
        image.verify()
        fmt = image.format
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ValidationError({'file': 'This file is not a valid image.'})
    if fmt not in IMAGE_FORMATS:
        raise ValidationError({'file': 'Use a JPG, PNG, WebP or GIF image.'})
    record = SchoolSiteImage(school=school, created_by=user)
    # The extension comes from the detected format, never from the uploaded name.
    record.image.save(f'upload.{IMAGE_FORMATS[fmt]}', ContentFile(raw), save=False)
    record.save()
    return record


def allowed_image_urls(school):
    """URLs of the school's own uploaded images: the only ``<img src>`` a post may keep."""
    urls = set()
    for name in SchoolSiteImage.objects.filter(school=school).values_list('image', flat=True):
        if name:
            urls.add(SchoolSiteImage(image=name).image.url)
    return urls


def image_url(image):
    return image.image.url if image is not None and image.image else None


# --------------------------------------------------------------------------- posts

def reading_time(*bodies):
    words = max((len(plain_text(b).split()) for b in bodies if b), default=0)
    return max(1, math.ceil(words / WORDS_PER_MINUTE))


def pick(post, base, lang):
    """Text in ``lang``, falling back to the other language when empty."""
    other = 'fr' if lang == 'en' else 'en'
    return getattr(post, f'{base}_{lang}') or getattr(post, f'{base}_{other}')


def _unique_slug(school, base, exclude_id=None):
    base = (slugify(base) or 'post')[:100].strip('-') or 'post'
    candidate, n = base, 1
    queryset = SchoolPost.objects.filter(school=school)
    if exclude_id:
        queryset = queryset.exclude(pk=exclude_id)
    while queryset.filter(slug=candidate).exists():
        n += 1
        candidate = f'{base}-{n}'
    return candidate


def _clean_post_data(school, data, partial):
    unknown = set(data) - set(POST_EDITABLE) - {'school'}
    if unknown:
        raise ValidationError({k: 'This field cannot be edited here.' for k in sorted(unknown)})
    out, errors = {}, {}
    for name in POST_TEXT_FIELDS:
        if name in data:
            value = site_svc.clean_text(data[name])
            limit = POST_TEXT_LIMITS[name.rsplit('_', 1)[0]]
            if len(value) > limit:
                errors[name] = f'Maximum {limit} characters.'
            out[name] = value
    images = None
    for name in POST_BODY_FIELDS:
        if name in data:
            raw = str(data[name] or '')
            if len(raw) > MAX_BODY_CHARS:
                errors[name] = 'This text is too long.'
                continue
            if images is None:
                images = allowed_image_urls(school)
            out[name] = sanitize_html(raw, images)
    if 'slug' in data:
        slug = slugify(str(data['slug'] or ''))[:110]
        if not slug:
            errors['slug'] = 'Use letters, numbers and dashes.'
        out['slug'] = slug
    if 'category' in data:
        if data['category'] in (None, ''):
            out['category'] = None
        else:
            category = SchoolPostCategory.objects.filter(school=school, pk=str(data['category'])).first() \
                if _is_uuid(data['category']) else None
            if category is None:
                errors['category'] = 'Unknown category.'
            out['category'] = category
    if 'cover_image' in data:
        if data['cover_image'] in (None, ''):
            out['cover_image'] = None
        else:
            cover = SchoolSiteImage.objects.filter(school=school, pk=str(data['cover_image'])).first() \
                if _is_uuid(data['cover_image']) else None
            if cover is None:
                errors['cover_image'] = 'Upload the image to this school first.'
            out['cover_image'] = cover
    if not partial and not (out.get('title_en') or out.get('title_fr')):
        errors['title_en'] = 'Give the article a title (English or French).'
    if errors:
        raise ValidationError(errors)
    return out


def _is_uuid(value):
    import uuid

    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


def _audit(school, request, action, post, changes=None):
    if request is not None:
        site_svc.write_audit(school, request, action, {'post': {'before': '', 'after': post.slug}, **(changes or {})})


@transaction.atomic
def create_post(school, user, data, request=None):
    clean = _clean_post_data(school, data, partial=False)
    slug = clean.pop('slug', '') or _unique_slug(school, clean.get('title_en') or clean.get('title_fr'))
    if SchoolPost.objects.filter(school=school, slug=slug).exists():
        raise ValidationError({'slug': 'Another article already uses this address.'})
    post = SchoolPost.objects.create(
        school=school, slug=slug, author=user, author_name=(getattr(user, 'name', '') or '')[:200],
        preview_token=site_svc.new_preview_token(), **clean)
    _audit(school, request, 'blog_post_created', post)
    return post


@transaction.atomic
def update_post(post, data, request=None):
    clean = _clean_post_data(post.school, data, partial=True)
    if 'slug' in clean and SchoolPost.objects.filter(school=post.school, slug=clean['slug']).exclude(pk=post.pk).exists():
        raise ValidationError({'slug': 'Another article already uses this address.'})
    changed = {k: {'before': '', 'after': 'updated'} for k, v in clean.items() if getattr(post, k) != v}
    for name, value in clean.items():
        setattr(post, name, value)
    if not (post.title_en or post.title_fr):
        raise ValidationError({'title_en': 'Give the article a title (English or French).'})
    post.save()
    if changed:
        _audit(post.school, request, 'blog_post_updated', post, {'fields': {'before': '', 'after': ','.join(sorted(changed))}})
    return post


def publish_errors(post):
    errors = {}
    if not (post.title_en or post.title_fr):
        errors['title'] = 'The article needs a title.'
    if not (plain_text(post.body_en) or plain_text(post.body_fr)):
        errors['body'] = 'Write the article text before publishing.'
    return errors


@transaction.atomic
def publish_post(post, request=None):
    """Draft or Unpublished -> Published. Returns the post; raises if not ready."""
    if post.status == PostStatus.PUBLISHED:
        raise ValidationError({'status': 'This article is already published.'})
    errors = publish_errors(post)
    if errors:
        raise ValidationError(errors)
    post.status = PostStatus.PUBLISHED
    if post.published_at is None:
        post.published_at = timezone.now()
    post.save(update_fields=['status', 'published_at', 'updated_at'])
    _audit(post.school, request, 'blog_post_published', post)
    return post


@transaction.atomic
def unpublish_post(post, request=None):
    """Published -> Unpublished (kept, hidden from the public)."""
    if post.status != PostStatus.PUBLISHED:
        raise ValidationError({'status': 'Only a published article can be unpublished.'})
    post.status = PostStatus.UNPUBLISHED
    post.save(update_fields=['status', 'updated_at'])
    _audit(post.school, request, 'blog_post_unpublished', post)
    return post


@transaction.atomic
def rotate_post_preview_token(post, request=None):
    post.preview_token = site_svc.new_preview_token()
    post.save(update_fields=['preview_token', 'updated_at'])
    _audit(post.school, request, 'blog_post_preview_rotated', post)
    return post


@transaction.atomic
def delete_post(post, request=None):
    _audit(post.school, request, 'blog_post_deleted', post)
    post.delete()


def school_posts(school):
    """Every post of ONE school (management)."""
    return SchoolPost.objects.filter(school=school).select_related('category', 'cover_image')


def published_posts(school):
    return school_posts(school).filter(status=PostStatus.PUBLISHED, published_at__isnull=False)


def neighbours(post):
    """(previous, next) published posts: older and newer than ``post``."""
    base = published_posts(post.school).exclude(pk=post.pk)
    when = post.published_at or post.created_at
    older = base.filter(published_at__lt=when).order_by('-published_at').first()
    newer = base.filter(published_at__gt=when).order_by('published_at').first()
    return older, newer


# --------------------------------------------------------------------------- categories

@transaction.atomic
def save_category(school, data, category=None):
    name_en = site_svc.clean_text(data.get('name_en', category.name_en if category else ''))[:80]
    name_fr = site_svc.clean_text(data.get('name_fr', category.name_fr if category else ''))[:80]
    if not (name_en or name_fr):
        raise ValidationError({'name_en': 'Give the category a name.'})
    if category is None:
        base = slugify(name_en or name_fr)[:70] or 'category'
        slug, n = base, 1
        while SchoolPostCategory.objects.filter(school=school, slug=slug).exists():
            n += 1
            slug = f'{base}-{n}'
        category = SchoolPostCategory(school=school, slug=slug,
                                      order=SchoolPostCategory.objects.filter(school=school).count())
    category.name_en, category.name_fr = name_en, name_fr
    if 'order' in data:
        try:
            category.order = max(0, int(data['order']))
        except (TypeError, ValueError):
            raise ValidationError({'order': 'Must be a number.'})
    category.save()
    return category


# --------------------------------------------------------------------------- leadership

def eligible_staff(school):
    """The school's own active staff accounts that may appear as leaders."""
    return (User.objects
            .filter(school=school, is_active=True, role__in=STAFF_ROLES, is_teacher_twin=False)
            .order_by('name'))


ROLE_GUESS = {
    UserRole.BURSAR: LeaderRole.BURSAR,
}


def guess_role_category(user):
    label = (user.public_title or user.display_role or '').lower()
    if 'vice' in label or 'adjoint' in label:
        return LeaderRole.VICE_PRINCIPAL
    if 'discipline' in label:
        return LeaderRole.DISCIPLINE_MASTER
    if 'studies' in label or 'etudes' in label or 'études' in label:
        return LeaderRole.HEAD_OF_STUDIES
    if user.role == UserRole.SCHOOL_ADMIN:
        return LeaderRole.PRINCIPAL
    return ROLE_GUESS.get(user.role, LeaderRole.OTHER)


def candidate_rows(school):
    taken = set(PublicLeader.objects.filter(school=school).values_list('user_id', flat=True))
    return [{
        'user': str(u.pk),
        'name': u.name,
        'role': u.role,
        'role_label': u.display_role,
        'has_photo': bool(u.avatar),
        'directory_title': u.public_title,
        'in_staff_directory': u.show_in_staff_directory,
        'suggested_role_category': guess_role_category(u),
        'already_added': u.pk in taken,
    } for u in eligible_staff(school)]


LEADER_TEXT_LIMITS = {'public_title': 120, 'bio': 1500}
LEADER_EDITABLE = (
    ['public_title_en', 'public_title_fr', 'bio_en', 'bio_fr', 'role_category', 'show_photo', 'is_visible', 'order']
)


def _clean_leader(data, creating):
    unknown = set(data) - set(LEADER_EDITABLE) - {'user', 'school'}
    if creating is False:
        unknown |= {'user'} & set(data)
    if unknown:
        raise ValidationError({k: 'This field cannot be edited here.' for k in sorted(unknown)})
    out, errors = {}, {}
    for base, limit in LEADER_TEXT_LIMITS.items():
        for lang in LANGS:
            name = f'{base}_{lang}'
            if name in data:
                value = site_svc.clean_text(data[name])
                if len(value) > limit:
                    errors[name] = f'Maximum {limit} characters.'
                out[name] = value
    if 'role_category' in data:
        if data['role_category'] not in LeaderRole.values:
            errors['role_category'] = 'Unknown role.'
        out['role_category'] = data['role_category']
    for flag in ('show_photo', 'is_visible'):
        if flag in data:
            if not isinstance(data[flag], bool):
                errors[flag] = 'Must be true or false.'
            out[flag] = data[flag]
    if 'order' in data:
        try:
            out['order'] = max(0, int(data['order']))
        except (TypeError, ValueError):
            errors['order'] = 'Must be a number.'
    if errors:
        raise ValidationError(errors)
    return out


@transaction.atomic
def add_leader(school, data, request=None):
    clean = _clean_leader(data, creating=True)
    user = eligible_staff(school).filter(pk=data.get('user')).first() if data.get('user') else None
    if user is None:
        raise ValidationError({'user': 'Choose a member of this school\'s staff.'})
    if PublicLeader.objects.filter(school=school, user=user).exists():
        raise ValidationError({'user': 'This person is already on the leadership list.'})
    clean.setdefault('role_category', guess_role_category(user))
    if 'order' not in clean:
        clean['order'] = PublicLeader.objects.filter(school=school).count()
    leader = PublicLeader.objects.create(school=school, user=user, **clean)
    if request is not None:
        site_svc.write_audit(school, request, 'leader_added', {'leader': {'before': '', 'after': user.name}})
    return leader


@transaction.atomic
def update_leader(leader, data, request=None):
    clean = _clean_leader(data, creating=False)
    for name, value in clean.items():
        setattr(leader, name, value)
    leader.save()
    if request is not None:
        site_svc.write_audit(leader.school, request, 'leader_updated',
                             {'leader': {'before': '', 'after': leader.user.name}})
    return leader


@transaction.atomic
def remove_leader(leader, request=None):
    name = leader.user.name
    school = leader.school
    leader.delete()
    if request is not None:
        site_svc.write_audit(school, request, 'leader_removed', {'leader': {'before': name, 'after': ''}})


@transaction.atomic
def reorder_leaders(school, ids, request=None):
    ids = [str(i) for i in ids] if isinstance(ids, list) else None
    existing = {str(l.pk): l for l in PublicLeader.objects.filter(school=school)}
    if ids is None or set(ids) != set(existing) or len(ids) != len(set(ids)):
        raise ValidationError({'ids': 'Send every leader of your list exactly once.'})
    for position, pk in enumerate(ids):
        if existing[pk].order != position:
            existing[pk].order = position
            existing[pk].save(update_fields=['order', 'updated_at'])
    if request is not None:
        site_svc.write_audit(school, request, 'leaders_reordered')
    return list(PublicLeader.objects.filter(school=school).select_related('user'))


def school_leaders(school):
    return PublicLeader.objects.filter(school=school).select_related('user')


def public_leader_row(leader, lang):
    """What a visitor may see of a leader: name, title, photo (only if allowed), bio. Never contacts."""
    other = 'fr' if lang == 'en' else 'en'
    user = leader.user
    title = (getattr(leader, f'public_title_{lang}') or getattr(leader, f'public_title_{other}')
             or user.public_title or user.display_role)
    bio = getattr(leader, f'bio_{lang}') or getattr(leader, f'bio_{other}')
    return {
        'name': user.name,
        'title': title,
        'role_category': leader.role_category,
        'photo': (user.avatar or None) if leader.show_photo else None,
        'bio': bio,
        'order': leader.order,
    }


def public_leaders(school, lang='en'):
    queryset = school_leaders(school).filter(is_visible=True, user__is_active=True, user__school=school)
    return [public_leader_row(l, lang) for l in queryset]

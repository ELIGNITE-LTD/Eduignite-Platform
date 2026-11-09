"""Business rules for public events and the gallery.

Used by the management views and by other modules (executive oversight, the home
page aggregate) through ``apps.school_site_media.api``. Nothing here trusts a
caller to have scoped the school: every function takes the school explicitly.
"""

from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone
from django.utils.text import slugify

from apps.schools import public_site_services as site_svc

from . import timeutil
from .images import ImageRejected, process_upload
from .models import ContentStatus, PublicAlbum, PublicEvent, PublicMedia

IMAGE_QUOTA_PER_SCHOOL = 200
MAX_MEDIA_PER_ALBUM = 100

class QuotaExceeded(ValueError):
    pass


def image_count(school):
    return (PublicMedia.objects.filter(school=school).count()
            + PublicEvent.objects.filter(school=school).exclude(cover_image='').exclude(cover_image=None).count())


def quota_remaining(school):
    return max(0, IMAGE_QUOTA_PER_SCHOOL - image_count(school))


def unique_event_slug(school, title):
    base = (slugify(title)[:100] or 'event')
    slug, n = base, 2
    while PublicEvent.objects.filter(school=school, slug=slug).exists():
        slug = f'{base}-{n}'
        n += 1
    return slug


def event_missing_for_publish(event):
    errors = {}
    if not (event.title_en or event.title_fr):
        errors['title'] = 'Add a title (English or French) before publishing.'
    if not event.start_at:
        errors['start_at'] = 'Set the start date before publishing.'
    return errors


def album_missing_for_publish(album):
    errors = {}
    if not (album.title_en or album.title_fr):
        errors['title'] = 'Add a title (English or French) before publishing.'
    return errors


def publish(obj, request, kind):
    """Publish an event or album. Returns {} on success, else {field: message}."""
    errors = event_missing_for_publish(obj) if kind == 'event' else album_missing_for_publish(obj)
    if errors:
        return errors
    obj.status = ContentStatus.PUBLISHED
    obj.published_at = timezone.now()
    obj.save(update_fields=['status', 'published_at', 'updated_at'])
    site_svc.write_audit(obj.school, request, f'{kind}_published', {kind: {'before': 'draft', 'after': str(obj)[:100]}})
    return {}


def unpublish(obj, request, kind):
    obj.status = ContentStatus.DRAFT
    obj.save(update_fields=['status', 'updated_at'])
    site_svc.write_audit(obj.school, request, f'{kind}_unpublished', {kind: {'before': 'published', 'after': 'draft'}})


# ---- images -----------------------------------------------------------------

def _guard_quota(school):
    if quota_remaining(school) <= 0:
        raise QuotaExceeded(f'Image limit reached ({IMAGE_QUOTA_PER_SCHOOL} per school). Delete some images first.')


def set_event_cover(event, uploaded):
    had_cover = bool(event.cover_image)
    if not had_cover:
        _guard_quota(event.school)
    processed = process_upload(uploaded)
    old = event.cover_image.name if had_cover else None
    event.cover_image.save(processed.main.name, processed.main, save=False)
    event.save(update_fields=['cover_image', 'updated_at'])
    if old:
        event.cover_image.storage.delete(old)
    return event


def clear_event_cover(event):
    if event.cover_image:
        name = event.cover_image.name
        event.cover_image = None
        event.save(update_fields=['cover_image', 'updated_at'])
        event.cover_image.storage.delete(name)
    return event


@transaction.atomic
def add_media(album, uploaded, user, caption_en='', caption_fr='', alt_en='', alt_fr=''):
    school = album.school
    _guard_quota(school)
    if album.media.count() >= MAX_MEDIA_PER_ALBUM:
        raise QuotaExceeded(f'An album can hold at most {MAX_MEDIA_PER_ALBUM} images.')
    processed = process_upload(uploaded)
    last = album.media.aggregate(m=Max('order'))['m']
    media = PublicMedia(
        school=school, album=album, size_bytes=processed.size, order=(last + 1) if last is not None else 0,
        uploaded_by=user if getattr(user, 'is_authenticated', False) else None,
        caption_en=site_svc.clean_text(caption_en)[:300], caption_fr=site_svc.clean_text(caption_fr)[:300],
        alt_en=site_svc.clean_text(alt_en)[:200], alt_fr=site_svc.clean_text(alt_fr)[:200],
    )
    media.image.save(processed.main.name, processed.main, save=False)
    media.thumbnail.save(processed.thumb.name, processed.thumb, save=False)
    media.save()
    if album.cover_id is None:
        album.cover = media
        album.save(update_fields=['cover', 'updated_at'])
    return media


def set_album_cover(album, media_id):
    media = album.media.filter(pk=media_id).first()
    if media is None:
        return False
    album.cover = media
    album.save(update_fields=['cover', 'updated_at'])
    return True


@transaction.atomic
def reorder_albums(school, ids):
    albums = {str(a.id): a for a in PublicAlbum.objects.filter(school=school)}
    if set(map(str, ids)) != set(albums):
        return False
    for position, pk in enumerate(ids):
        PublicAlbum.objects.filter(pk=pk, school=school).update(order=position)
    return True


@transaction.atomic
def reorder_media(album, ids):
    items = {str(m.id) for m in album.media.all()}
    if set(map(str, ids)) != items:
        return False
    for position, pk in enumerate(ids):
        PublicMedia.objects.filter(pk=pk, album=album).update(order=position)
    return True


# ---- classification ---------------------------------------------------------

def bucket_filter(bucket, now=None):
    """Q for 'upcoming' | 'ongoing' | 'past', computed from stored UTC instants."""
    now = now or timezone.now()
    if bucket == 'upcoming':
        return Q(start_at__gt=now)
    if bucket == 'ongoing':
        return Q(start_at__lte=now, effective_end__gte=now)
    if bucket == 'past':
        return Q(effective_end__lt=now)
    return Q()


def event_bucket(event, now=None):
    return timeutil.classify(event.start_at, event.effective_end, now or timezone.now())


def bucket_counts(queryset, now=None):
    now = now or timezone.now()
    return {b: queryset.filter(bucket_filter(b, now)).count() for b in ('upcoming', 'ongoing', 'past')}

"""The module's public surface for other apps (executive oversight, aggregates).

Import from here, not from models/views: ``from apps.school_site_media import api``.
The permission class accepts school administrators of the school AND platform
executives holding the ``school_websites`` module.
"""

from .images import ImageRejected, process_upload
from .models import AlbumCategory, ContentStatus, EventCategory, PublicAlbum, PublicEvent, PublicMedia
from .permissions import IsPublicSiteManager, target_school
from .services import (
    IMAGE_QUOTA_PER_SCHOOL, QuotaExceeded, add_media, bucket_counts, bucket_filter, event_bucket,
    image_count, publish, quota_remaining, unpublish,
)

__all__ = [
    'AlbumCategory', 'ContentStatus', 'EventCategory', 'IMAGE_QUOTA_PER_SCHOOL', 'ImageRejected',
    'IsPublicSiteManager', 'PublicAlbum', 'PublicEvent', 'PublicMedia', 'QuotaExceeded', 'add_media',
    'bucket_counts', 'bucket_filter', 'event_bucket', 'image_count', 'process_upload', 'publish',
    'quota_remaining', 'target_school', 'unpublish',
    'site_content_summary',
]


def site_content_summary(school):
    """Counts of a school's public events and gallery, for oversight dashboards."""
    events = PublicEvent.objects.filter(school=school)
    albums = PublicAlbum.objects.filter(school=school)
    return {
        'events_total': events.count(),
        'events_published': events.filter(status=ContentStatus.PUBLISHED).count(),
        'albums_total': albums.count(),
        'albums_published': albums.filter(status=ContentStatus.PUBLISHED).count(),
        'images': image_count(school),
        'image_quota': IMAGE_QUOTA_PER_SCHOOL,
    }

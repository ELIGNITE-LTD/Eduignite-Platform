"""Public (no sign-in) events and gallery of a published school website.

Only published items of a school whose site is published are returned, and only
descriptive fields: no ids of people, no internal links, no file paths beyond the
image address. Same throttle scope and cache headers as the profile endpoints.
"""

from django.core.paginator import EmptyPage, Paginator
from django.db.models import Count, Prefetch
from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.schools.models import SchoolPublicProfile, SchoolStatus
from apps.schools.public_profile import PUBLIC_CACHE_CONTROL, published_schools
from apps.schools.public_site_services import preview_token_matches

from . import services, timeutil
from .models import AlbumCategory, ContentStatus, PublicAlbum, PublicEvent, PublicMedia

DEFAULT_PAGE_SIZE = 12
MAX_PAGE_SIZE = 48
ALBUM_PREVIEW_MEDIA = 12
BUCKETS = ('upcoming', 'ongoing', 'past')


def _int(value, default, low, high):
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def _respond(data, preview=False):
    response = Response(data)
    if preview:
        response['Cache-Control'] = 'no-store'
        response['X-Robots-Tag'] = 'noindex, nofollow'
    else:
        response['Cache-Control'] = PUBLIC_CACHE_CONTROL
    return response


def _text(row, field, lang):
    other = 'fr' if lang == 'en' else 'en'
    return getattr(row, f'{field}_{lang}') or getattr(row, f'{field}_{other}')


def _lang(request):
    lang = str(request.query_params.get('lang', '')).lower()[:2]
    return lang if lang in ('en', 'fr') else 'en'


def _url(f):
    return f.url if f else None


def _page(queryset, request, serialize):
    size = _int(request.query_params.get('page_size'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    paginator = Paginator(queryset, size)
    number = _int(request.query_params.get('page'), 1, 1, 10 ** 6)
    try:
        rows = [serialize(row) for row in paginator.page(number).object_list]
    except EmptyPage:
        rows = []
    return {'count': paginator.count, 'page': number, 'page_size': size,
            'num_pages': paginator.num_pages, 'results': rows}


class _PublicSiteView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_site'

    def school_for(self, request, slug):
        """(school, is_preview). 404 unless the site is published (or a valid preview token is given)."""
        token = request.query_params.get('preview')
        if token:
            profile = (SchoolPublicProfile.objects.select_related('school')
                       .filter(school__public_slug=slug).first())
            school = profile.school if profile else None
            if (profile and preview_token_matches(profile, token)
                    and school.status == SchoolStatus.ACTIVE and not school.is_drafted):
                return school, True
            raise Http404
        school = published_schools().filter(public_slug=slug).first()
        if school is None:
            raise Http404
        return school, False


def event_card(row, lang):
    return {
        'slug': row.slug,
        'title': _text(row, 'title', lang),
        'title_en': row.title_en, 'title_fr': row.title_fr,
        'description': _text(row, 'description', lang),
        'description_en': row.description_en, 'description_fr': row.description_fr,
        'start_at': row.start_at,
        'end_at': row.end_at,
        'location': row.location,
        'category': row.category,
        'cover': _url(row.cover_image),
        'bucket': timeutil.classify(row.start_at, row.effective_end, timezone.now()),
        'updated_at': row.updated_at,
    }


class PublicEventListView(_PublicSiteView):
    """GET /api/v1/schools/public/<slug>/events/?when=upcoming|ongoing|past|all&page=&page_size=&lang="""

    @extend_schema(tags=['Schools'], description="A published school's public events. No authentication.")
    def get(self, request, slug):
        school, preview = self.school_for(request, slug)
        lang = _lang(request)
        now = timezone.now()
        base = PublicEvent.objects.filter(school=school, status=ContentStatus.PUBLISHED)
        when = request.query_params.get('when', 'upcoming')
        if when in BUCKETS:
            qs = base.filter(services.bucket_filter(when, now))
            qs = qs.order_by('-start_at' if when == 'past' else 'start_at')
        else:
            when = 'all'
            qs = base.order_by('-start_at')
        data = _page(qs, request, lambda row: event_card(row, lang))
        data['when'] = when
        data['counts'] = services.bucket_counts(base, now)
        data['lang'] = lang
        return _respond(data, preview)


class PublicEventDetailView(_PublicSiteView):
    """GET /api/v1/schools/public/<slug>/events/<event-slug>/"""

    @extend_schema(tags=['Schools'], description="One published event of a published school. No authentication.")
    def get(self, request, slug, event_slug):
        school, preview = self.school_for(request, slug)
        row = PublicEvent.objects.filter(
            school=school, slug=event_slug, status=ContentStatus.PUBLISHED).first()
        if row is None:
            raise Http404
        data = event_card(row, _lang(request))
        data['lang'] = _lang(request)
        return _respond(data, preview)


def media_item(row, lang):
    return {
        'id': str(row.id),
        'url': _url(row.image),
        'thumb': _url(row.thumbnail) or _url(row.image),
        'width': row.width, 'height': row.height,
        'caption': _text(row, 'caption', lang),
        'alt': _text(row, 'alt', lang) or _text(row, 'caption', lang),
    }


def album_card(album, lang, media=None, media_count=0):
    cover = album.cover if album.cover_id else None
    data = {
        'id': str(album.id),
        'title': _text(album, 'title', lang),
        'title_en': album.title_en, 'title_fr': album.title_fr,
        'category': album.category,
        'cover': _url(cover.thumbnail or cover.image) if cover else None,
        'media_count': media_count,
        'updated_at': album.updated_at,
    }
    if media is not None:
        data['media'] = [media_item(m, lang) for m in media]
    return data


class PublicGalleryView(_PublicSiteView):
    """GET /api/v1/schools/public/<slug>/gallery/?category=&page=&page_size=&lang=

    Paginated published albums, each with its first images and total count.
    """

    @extend_schema(tags=['Schools'], description="A published school's gallery albums. No authentication.")
    def get(self, request, slug):
        school, preview = self.school_for(request, slug)
        lang = _lang(request)
        base = PublicAlbum.objects.filter(school=school, status=ContentStatus.PUBLISHED)
        category = request.query_params.get('category', '')
        counts = {row['category']: row['n'] for row in base.values('category').annotate(n=Count('id'))}
        qs = base.filter(category=category) if category in AlbumCategory.values else base
        qs = (qs.select_related('cover').annotate(n=Count('media'))
              .prefetch_related(Prefetch('media', queryset=PublicMedia.objects.order_by('order', 'created_at'))))

        def serialize(album):
            return album_card(album, lang, media=list(album.media.all())[:ALBUM_PREVIEW_MEDIA], media_count=album.n)

        data = _page(qs, request, serialize)
        data['category'] = category if category in AlbumCategory.values else ''
        data['category_counts'] = counts
        data['lang'] = lang
        return _respond(data, preview)


class PublicAlbumDetailView(_PublicSiteView):
    """GET /api/v1/schools/public/<slug>/gallery/<album-id>/?page=&page_size= : every image of one album."""

    @extend_schema(tags=['Schools'], description="One published album with paginated images. No authentication.")
    def get(self, request, slug, album_id):
        school, preview = self.school_for(request, slug)
        lang = _lang(request)
        album = (PublicAlbum.objects.select_related('cover')
                 .filter(school=school, status=ContentStatus.PUBLISHED, pk=album_id).first())
        if album is None:
            raise Http404
        media = album.media.order_by('order', 'created_at')
        data = _page(media, request, lambda row: media_item(row, lang))
        data['album'] = album_card(album, lang, media_count=data['count'])
        data['lang'] = lang
        return _respond(data, preview)

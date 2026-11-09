"""Sitemap index of published school events and galleries."""

from django.db.models import Max
from drf_spectacular.utils import extend_schema

from apps.schools.public_profile import published_schools

from .models import ContentStatus, PublicAlbum, PublicEvent
from .public_views import _PublicSiteView, _respond


class PublicContentIndexView(_PublicSiteView):
    """GET /api/v1/schools/public-content/index/ : addresses of published events and galleries.

    Only published items of published school sites; slugs and dates, nothing else.
    """

    LIMIT = 20000

    @extend_schema(tags=['Schools'], description='Sitemap index of published school events and galleries. No authentication.')
    def get(self, request):
        schools = published_schools()
        events = (PublicEvent.objects.filter(status=ContentStatus.PUBLISHED, school__in=schools)
                  .order_by('-updated_at').values('school__public_slug', 'slug', 'updated_at')[:self.LIMIT])
        galleries = (PublicAlbum.objects.filter(status=ContentStatus.PUBLISHED, school__in=schools, media__isnull=False)
                     .values('school__public_slug').annotate(updated_at=Max('updated_at'))
                     .order_by('school__public_slug')[:self.LIMIT])
        return _respond({
            'events': [{'school': e['school__public_slug'], 'slug': e['slug'], 'updated_at': e['updated_at']}
                       for e in events],
            'galleries': [{'school': g['school__public_slug'], 'updated_at': g['updated_at']} for g in galleries],
        })

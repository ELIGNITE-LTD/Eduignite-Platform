"""Public (no sign-in) blog and leadership endpoints of a school website.

Visible only when the school's site is PUBLISHED and live (the same rule as the
profile) and, for the blog, only for PUBLISHED posts. A draft can be read only
with that post's own preview token (never cached, noindex).
"""

import math

from django.db.models import Count, Q
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.schools.models import School, SchoolStatus
from apps.schools.public_profile import _public_response, published_schools, resolve_lang
from apps.schools.public_site_services import preview_token_matches

from . import services as svc
from .models import PostStatus, SchoolPost, SchoolPostCategory
from .sanitize import sanitize_html

DEFAULT_PAGE_SIZE = 9
MAX_PAGE_SIZE = 24
INDEX_MAX = 5000


class _PublicView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_site'


def _int(value, default, low, high):
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def _category(category, lang):
    if category is None:
        return None
    other = 'fr' if lang == 'en' else 'en'
    return {'slug': category.slug,
            'name': getattr(category, f'name_{lang}') or getattr(category, f'name_{other}')}


def _card(post, lang):
    return {
        'slug': post.slug,
        'title': svc.pick(post, 'title', lang),
        'excerpt': svc.pick(post, 'excerpt', lang) or _auto_excerpt(post, lang),
        'cover': svc.image_url(post.cover_image),
        'category': _category(post.category, lang),
        'published_at': post.published_at,
        'author_name': post.author_name,
        'reading_time': svc.reading_time(svc.pick(post, 'body', lang)),
    }


def _auto_excerpt(post, lang):
    from .sanitize import plain_text

    text = plain_text(svc.pick(post, 'body', lang))
    return text if len(text) <= 160 else text[:157].rsplit(' ', 1)[0] + '...'


class PublicBlogListView(_PublicView):
    """GET /api/v1/schools/public/<slug>/blog/?page=&page_size=&category=&lang="""

    @extend_schema(tags=['Schools'], description="Published articles of one school's website. No authentication.")
    def get(self, request, slug):
        school = published_schools().filter(public_slug=slug).first()
        if school is None:
            raise Http404
        lang = resolve_lang(request)
        posts = svc.published_posts(school)
        categories = SchoolPostCategory.objects.filter(school=school).annotate(
            n=Count('posts', filter=Q(posts__status=PostStatus.PUBLISHED, posts__published_at__isnull=False)))
        wanted = request.query_params.get('category')
        if wanted:
            posts = posts.filter(category__slug=wanted)
        total = posts.count()
        size = _int(request.query_params.get('page_size'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
        pages = max(1, math.ceil(total / size))
        page = _int(request.query_params.get('page'), 1, 1, pages)
        rows = posts.order_by('-published_at', '-created_at')[(page - 1) * size:page * size]
        return _public_response({
            'lang': lang, 'count': total, 'page': page, 'page_size': size, 'total_pages': pages,
            'results': [_card(p, lang) for p in rows],
            'categories': [{**_category(c, lang), 'count': c.n} for c in categories if c.n],
        })


class PublicBlogDetailView(_PublicView):
    """GET /api/v1/schools/public/<slug>/blog/<post_slug>/?lang=&preview=<post token>"""

    @extend_schema(tags=['Schools'], description='One published article (or a draft with its preview token).')
    def get(self, request, slug, post_slug):
        lang = resolve_lang(request)
        token = request.query_params.get('post_preview') or request.query_params.get('preview')
        post, preview = None, False
        if token:
            school = School.objects.filter(public_slug=slug, status=SchoolStatus.ACTIVE, is_drafted=False).first()
            candidate = (SchoolPost.objects.select_related('school', 'category', 'cover_image')
                         .filter(school=school, slug=post_slug).first()) if school else None
            if candidate and preview_token_matches(candidate, token):
                post, preview = candidate, True
        if post is None:
            school = published_schools().filter(public_slug=slug).first()
            if school is None:
                raise Http404
            post = svc.published_posts(school).filter(slug=post_slug).first()
            if post is None:
                raise Http404
        images = svc.allowed_image_urls(post.school)
        body_en = sanitize_html(post.body_en, images)  # sanitised again on read
        body_fr = sanitize_html(post.body_fr, images)
        body = body_en if (lang == 'en' and body_en) or not body_fr else body_fr
        data = _card(post, lang)
        older, newer = (None, None) if preview else svc.neighbours(post)

        def link(other):
            return {'slug': other.slug, 'title': svc.pick(other, 'title', lang)} if other else None

        data.update({
            'body': body,
            'updated_at': post.updated_at,
            'seo_title': svc.pick(post, 'seo_title', lang) or svc.pick(post, 'title', lang),
            'seo_description': svc.pick(post, 'seo_description', lang) or data['excerpt'],
            'previous': link(older), 'next': link(newer),
            'is_preview': preview, 'lang': lang,
            'languages': [l for l, b in (('en', body_en), ('fr', body_fr)) if b],
        })
        data['reading_time'] = svc.reading_time(body)
        return _public_response(data, preview=preview)


class PublicBlogIndexView(_PublicView):
    """GET /api/v1/schools/public/blog-index/ : published article addresses, for the sitemap."""

    @extend_schema(tags=['Schools'], description='Addresses of published articles across published school sites.')
    def get(self, request):
        limit = _int(request.query_params.get('limit'), 1000, 1, INDEX_MAX)
        offset = _int(request.query_params.get('offset'), 0, 0, 10 ** 9)
        queryset = (SchoolPost.objects
                    .filter(status=PostStatus.PUBLISHED, published_at__isnull=False,
                            school__in=published_schools())
                    .order_by('-published_at')
                    .values('school__public_slug', 'slug', 'published_at', 'updated_at'))
        response = _public_response([{
            'school': r['school__public_slug'], 'slug': r['slug'],
            'published_at': r['published_at'], 'updated_at': r['updated_at'],
        } for r in queryset[offset:offset + limit]])
        response['X-Total-Count'] = str(queryset.count())
        return response


class PublicLeadershipView(_PublicView):
    """GET /api/v1/schools/public/<slug>/leadership/?lang= : name, title, photo, bio. Never contacts."""

    @extend_schema(tags=['Schools'], description="The school's configured leadership team. No authentication.")
    def get(self, request, slug):
        school = published_schools().filter(public_slug=slug).first()
        if school is None:
            raise Http404
        lang = resolve_lang(request)
        return _public_response({'lang': lang, 'leaders': svc.public_leaders(school, lang)})

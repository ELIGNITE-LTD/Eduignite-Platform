"""Read-only endpoints that feed the public marketing website.

Everything the anonymous internet can read lives in this one module, on
purpose. These views build their own narrow responses instead of relaxing
permissions on the dashboard viewsets: a field added to an internal serializer
later can then never appear on a public page by accident, and the whole public
surface can be audited by reading one file.

Three rules hold for every view here:

* only content a founder has explicitly approved or published is returned;
* only the fields the website renders are serialised — never emails, phone
  numbers, matricules or internal ids of people;
* responses are cached, so public traffic cannot put load on the database.
"""

import re

from django.core.cache import cache
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.community.models import CommunityBlog, Testimony
from .models import ContactMessage, PublicEvent, PublicEventType
from .permissions import IsExecutive

CACHE_SECONDS = 600


class _PublicView(APIView):
    """Anonymous, uncredentialed, cached."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    cache_key = ''

    def cached(self, build):
        data = cache.get(self.cache_key)
        if data is None:
            data = build()
            cache.set(self.cache_key, data, CACHE_SECONDS)
        return Response(data)


def _display_name(user):
    """A person's public-facing name, never their contact details."""
    if user is None:
        return 'EduIgnite user'
    name = (getattr(user, 'name', '') or '').strip()
    return name or 'EduIgnite user'


# EduIgnite has exactly two co-founders: the CEO and the CTO. Everyone else on
# the board is executive staff, and co-founder wording must never attach to
# their name — including via a title somebody typed into their profile.
COFOUNDER_ROLES = {'CEO', 'CTO'}

_COFOUNDER_WORDING = re.compile(r'co[\s\-–—]?founder', re.IGNORECASE)


def _is_cofounder(user):
    return (getattr(user, 'role', '') or '') in COFOUNDER_ROLES


def _strip_cofounder_wording(title):
    """Drop any co-founder phrasing from a title, leaving the rest intact."""
    cleaned = _COFOUNDER_WORDING.sub(' ', title or '')
    # Tidy the separators the removed words left behind ("CTO & " -> "CTO").
    cleaned = re.sub(r'\s*[,&/|]\s*', ' & ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip(' &,-–—/|')
    return cleaned


def _role_label(user):
    """
    The readable platform role of a poster ("Teacher", "School Administrator").
    Board members keep their own title when they have one, except that
    co-founder wording is stripped from anyone who is not the CEO or CTO.
    """
    if user is None:
        return ''
    profile = getattr(user, 'founder_profile', None)
    title = (getattr(profile, 'founder_title', '') or '').strip() if profile else ''
    if title and not _is_cofounder(user):
        title = _strip_cofounder_wording(title)
    if title:
        return title
    try:
        return user.get_role_display()
    except Exception:  # noqa: BLE001
        return (getattr(user, 'role', '') or '').replace('_', ' ').title()


def _author_block(user):
    """Public-safe author identity for a post: who wrote it and their role."""
    return {
        'author': _display_name(user),
        'author_avatar': (getattr(user, 'avatar', '') or '') if user else '',
        'author_role': _role_label(user),
    }


class PublicPlatformStatsView(_PublicView):
    """
    GET /platform/public-stats/
    Headline platform counts for the marketing site.

    Counts every school that exists and has not been deleted or suspended.
    Status is deliberately not narrowed to Active: schools are created with a
    Pending status and only moved to Active by hand, so filtering on Active
    reported zero while the platform was full of real schools.
    """

    cache_key = 'public_site:stats'

    @extend_schema(tags=['Public site'], description='Headline platform statistics.')
    def get(self, request):
        def build():
            from django.contrib.auth import get_user_model

            from apps.schools.models import School, SchoolStatus

            schools = School.objects.filter(is_drafted=False).exclude(
                status=SchoolStatus.SUSPENDED
            )
            users = get_user_model().objects.filter(is_drafted=False, is_suspended=False)

            return {
                'schools': schools.count(),
                'students': users.filter(role='STUDENT').count(),
                'teachers': users.filter(role='TEACHER').count(),
                'users': users.count(),
                'regions': schools.exclude(region='').values('region').distinct().count(),
            }

        return self.cached(build)


class PublicTestimonialsView(_PublicView):
    """
    GET /platform/public-testimonials/
    Testimonies a founder has approved. Pending and rejected ones never appear.
    """

    cache_key = 'public_site:testimonials'

    @extend_schema(tags=['Public site'], description='Approved testimonials.')
    def get(self, request):
        def build():
            rows = (
                Testimony.objects.filter(status='approved')
                .select_related('user')
                .order_by('-approved_at', '-created_at')[:24]
            )
            return [
                {
                    'id': str(t.id),
                    'name': _display_name(t.user),
                    'role': t.role_display or '',
                    'school': t.school_name or '',
                    'message': t.message,
                    'rating': t.rating,
                    'avatar': getattr(t.user, 'avatar', '') or '',
                }
                for t in rows
            ]

        return self.cached(build)


class PublicBlogListView(_PublicView):
    """
    GET /platform/public-blog/
    Published community posts, newest first.
    """

    cache_key = 'public_site:blog'

    @extend_schema(tags=['Public site'], description='Published blog posts.')
    def get(self, request):
        def build():
            rows = (
                CommunityBlog.objects.filter(is_published=True)
                .select_related('author', 'author__founder_profile')
                .order_by('-published_at', '-created_at')[:36]
            )
            return [
                {
                    'slug': post.slug,
                    'title': post.title,
                    'image': post.image or '',
                    'video_url': post.video_url or '',
                    'excerpt': _excerpt(post.paragraphs),
                    **_author_block(post.author),
                    'published_at': (post.published_at or post.created_at).isoformat(),
                }
                for post in rows
            ]

        return self.cached(build)


def _excerpt(paragraphs, limit=190):
    """First paragraph, trimmed on a word boundary for a card."""
    if not isinstance(paragraphs, list):
        return ''
    first = next((str(p).strip() for p in paragraphs if str(p).strip()), '')
    if len(first) <= limit:
        return first
    return first[:limit].rsplit(' ', 1)[0] + '…'


class PublicBlogDetailView(_PublicView):
    """
    GET /platform/public-blog/<slug>/
    One published post, with its full body.
    """

    @extend_schema(tags=['Public site'], description='A single published blog post.')
    def get(self, request, slug):
        self.cache_key = f'public_site:blog:{slug}'

        def build():
            post = (
                CommunityBlog.objects.filter(is_published=True, slug=slug)
                .select_related('author', 'author__founder_profile')
                .first()
            )
            if post is None:
                return None
            return {
                'slug': post.slug,
                'title': post.title,
                'image': post.image or '',
                'video_url': post.video_url or '',
                'paragraphs': post.paragraphs if isinstance(post.paragraphs, list) else [],
                **_author_block(post.author),
                'published_at': (post.published_at or post.created_at).isoformat(),
            }

        data = cache.get(self.cache_key)
        if data is None:
            data = build()
            cache.set(self.cache_key, data, CACHE_SECONDS)
        if data is None:
            return Response({'detail': 'Not found.'}, status=404)
        return Response(data)


class PublicGalleryView(_PublicView):
    """
    GET /platform/public-gallery/
    Founder-curated images and videos, in the order they set.

    Backed by PublicEvent, which the Executive Console already manages, so a
    founder adding a photo or a video there publishes it straight to the site.
    """

    cache_key = 'public_site:gallery'

    @extend_schema(tags=['Public site'], description='Curated gallery images and videos.')
    def get(self, request):
        def build():
            rows = PublicEvent.objects.filter(
                is_active=True
            ).filter(
                Q(type=PublicEventType.IMAGE) | Q(type=PublicEventType.VIDEO)
            ).order_by('order', '-created_at')[:48]

            return [
                {
                    'id': str(item.id),
                    'type': item.type,
                    'title': item.title,
                    'description': item.description or '',
                    'url': item.url,
                }
                for item in rows
            ]

        return self.cached(build)


class PublicFoundersView(_PublicView):
    """
    GET /platform/public-founders/
    The founding team for the public About page — public-safe fields only
    (display name, title, role and avatar), never contact details or share data.
    """

    cache_key = 'public_site:founders'

    @extend_schema(tags=['Public site'], description='Founding team for the public site.')
    def get(self, request):
        def build():
            from apps.users.models import FounderProfile

            rows = (
                FounderProfile.objects.select_related('user')
                .filter(user__is_drafted=False, user__is_suspended=False)
                .order_by('-is_primary_founder', 'user__date_joined')
            )
            founders = []
            for profile in rows:
                user = profile.user
                if not user:
                    continue
                founders.append({
                    'name': _display_name(user),
                    'title': _role_label(user),
                    'role': getattr(user, 'role', '') or '',
                    'avatar': getattr(user, 'avatar', '') or '',
                    'is_primary': bool(profile.is_primary_founder),
                    # Only the CEO and CTO co-founded EduIgnite; the rest of the
                    # board is executive staff.
                    'is_cofounder': _is_cofounder(user),
                })
            # Co-founders lead the list, then executive staff.
            founders.sort(key=lambda f: (not f['is_cofounder'],))
            return founders

        return self.cached(build)


class PublicContactView(APIView):
    """
    POST /platform/public-contact/
    Receives a message from the public contact form and stores it for founders
    to read in the Executive dashboard. Anonymous and uncredentialed.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=['Public site'], description='Submit a public contact message.')
    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        name = str(data.get('name') or '').strip()[:150]
        email = str(data.get('email') or '').strip()[:254]
        subject = str(data.get('subject') or '').strip()[:200]
        message = str(data.get('message') or '').strip()

        if not name or not email or not message:
            return Response(
                {'detail': 'Please provide your name, email and a message.'},
                status=400,
            )
        if '@' not in email or '.' not in email.split('@')[-1]:
            return Response({'detail': 'Please provide a valid email address.'}, status=400)
        if len(message) > 5000:
            message = message[:5000]

        ContactMessage.objects.create(
            name=name, email=email, subject=subject, message=message,
        )

        # Let the founders know a message arrived (best-effort).
        try:
            from django.contrib.auth import get_user_model
            from apps.notifications.utils import notify_users

            User = get_user_model()
            executives = list(User.objects.filter(role__in=['SUPER_ADMIN', 'CEO', 'CTO', 'COO']))
            if executives:
                notify_users(
                    executives,
                    'New contact message',
                    f'{name} sent a message through the website: "{subject or message[:60]}"',
                    notification_type='platform',
                )
        except Exception:  # noqa: BLE001
            pass

        return Response(
            {'detail': 'Thank you — your message has been received. We will get back to you soon.'},
            status=201,
        )


class ContactMessagesView(APIView):
    """
    GET /platform/contact-messages/   — founders read the website inbox
    Executives only; not cached (it is a live inbox).
    """

    permission_classes = [IsExecutive]

    @extend_schema(tags=['Public site'], description='Contact messages sent from the website (founders only).')
    def get(self, request):
        rows = ContactMessage.objects.all()[:200]
        return Response([
            {
                'id': str(m.id),
                'name': m.name,
                'email': m.email,
                'subject': m.subject,
                'message': m.message,
                'status': m.status,
                'created_at': m.created_at.isoformat(),
            }
            for m in rows
        ])


class PublicSiteControlView(APIView):
    """
    GET  /platform/public-site/   — what is currently live on the marketing site
    POST /platform/public-site/   — publish pending changes immediately

    Founders only. The public endpoints above cache for ten minutes, which
    means a founder who approves a testimony or adds a photo would not see it
    on the site straight away and could reasonably think it failed. This gives
    them the count of what is live and a way to push changes out at once.
    """

    permission_classes = [IsExecutive]

    CACHE_KEYS = [
        'public_site:stats',
        'public_site:testimonials',
        'public_site:blog',
        'public_site:gallery',
    ]

    @extend_schema(tags=['Public site'], description='What is currently live on the public website.')
    def get(self, request):
        gallery = PublicEvent.objects.filter(is_active=True)
        return Response({
            'testimonials': {
                'live': Testimony.objects.filter(status='approved').count(),
                'awaiting_review': Testimony.objects.filter(status='pending').count(),
            },
            'blog': {
                'live': CommunityBlog.objects.filter(is_published=True).count(),
                'drafts': CommunityBlog.objects.filter(is_published=False).count(),
            },
            'gallery': {
                'photos': gallery.filter(type=PublicEventType.IMAGE).count(),
                'videos': gallery.filter(type=PublicEventType.VIDEO).count(),
            },
            'cache_seconds': CACHE_SECONDS,
        })

    @extend_schema(tags=['Public site'], description='Clear the public site cache so changes appear now.')
    def post(self, request):
        cache.delete_many(self.CACHE_KEYS)
        # Blog detail pages are cached per slug, so clear those individually.
        for slug in CommunityBlog.objects.values_list('slug', flat=True):
            cache.delete(f'public_site:blog:{slug}')
        return Response({'detail': 'The public website will show your latest changes now.'})

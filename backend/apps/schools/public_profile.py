"""Public school profile pages: readable by anyone, indexable by search engines.

Only a school's own descriptive and contact details are exposed. Nothing about
its students, staff, parents, finances or accounts is, including the school
matricule, which is also the principal's sign-in identifier.
"""

import base64
import binascii
import hashlib
import hmac
import re

from django.conf import settings
from django.db.models import BooleanField, Case, Q, Value, When
from django.http import Http404, HttpResponse, HttpResponseRedirect
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import PublicationStatus, School, SchoolPublicProfile, SchoolStatus
from .public_site_services import LANGS, TEXT_FIELDS, preview_token_matches

PUBLIC_DIRECTORY_DEFAULT_LIMIT = 1000
PUBLIC_DIRECTORY_MAX_LIMIT = 5000
PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=120'
# "All schools" directory cards (?scope=all): 24 per page by default, 60 at most.
PUBLIC_CARDS_DEFAULT_LIMIT = 24
PUBLIC_CARDS_MAX_LIMIT = 60
LOGO_MAX_BYTES = 3 * 1024 * 1024
LOGO_CACHE_CONTROL = 'public, max-age=86400'
LOGO_HANDLE_LENGTH = 24
_DATA_URL = re.compile(r'^data:(?P<mime>[\w.+-]+/[\w.+-]+)?(?:;[^,;]+)*?(?P<b64>;base64)?,(?P<body>.*)$', re.S)
_LOGO_MIME = {'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'}
_MAGIC = ((b'\x89PNG\r\n\x1a\n', 'image/png'), (b'\xff\xd8\xff', 'image/jpeg'),
          (b'GIF8', 'image/gif'), (b'RIFF', 'image/webp'))


def live_schools():
    """Every school that is operating: Active and not drafted (pending, suspended and drafted are excluded).

    Used by the "all schools" public directory. Listing a school here only exposes
    non-personal card fields; its website is linked only if it is also published.
    """
    return School.objects.filter(status=SchoolStatus.ACTIVE, is_drafted=False)


def school_public_handle(school_id):
    """Opaque, stable public handle for a school, used in logo URLs.

    HMAC-SHA256 of the school id keyed with SECRET_KEY, truncated to 24 hex chars
    (96 bits). It is not the matricule (which is also a sign-in identifier), cannot be
    computed without the server secret, and is resolved server-side by recomputing it
    over the live schools that have a logo. Rotating SECRET_KEY changes every handle,
    which is harmless: handles are only handed out in fresh list responses.
    """
    digest = hmac.new(str(settings.SECRET_KEY).encode(), f'school-public-handle:{school_id}'.encode(),
                      hashlib.sha256).hexdigest()
    return digest[:LOGO_HANDLE_LENGTH]


def published_schools():
    """Schools whose public site is live.

    Publication is explicit opt-in: the school's profile must be PUBLISHED, the
    platform kill switch (public_profile_enabled) must be on, and the school
    must be live (active, not drafted).
    """
    return School.objects.filter(
        public_profile_enabled=True,
        status=SchoolStatus.ACTIVE,
        is_drafted=False,
        public_slug__isnull=False,
        public_profile__publication_status=PublicationStatus.PUBLISHED,
    )


def school_levels(school):
    """Education levels shown as badges: nursery/primary for basic schools, else the category."""
    category = school.education_category
    if category == School.EDUCATION_CATEGORY_BASIC:
        settings_row = getattr(school, 'settings', None)
        raw = getattr(settings_row, 'sections', None) or []
        enabled = {str(item).strip().lower() for item in raw if isinstance(item, str)}
        levels = [name for name in School.BASIC_EDUCATION_SECTIONS if name in enabled]
        return levels or list(School.BASIC_EDUCATION_SECTIONS)
    return [category]


def _public_response(data, preview=False):
    response = Response(data)
    if preview:
        response['Cache-Control'] = 'no-store'
        response['X-Robots-Tag'] = 'noindex, nofollow'
    else:
        response['Cache-Control'] = PUBLIC_CACHE_CONTROL
    return response


def resolve_lang(request):
    lang = str(request.query_params.get('lang', '')).lower()[:2]
    return lang if lang in LANGS else 'en'


def resolve_text(profile, field, lang):
    """Requested language, falling back to the other one when empty."""
    other = 'fr' if lang == 'en' else 'en'
    return getattr(profile, f'{field}_{lang}') or getattr(profile, f'{field}_{other}')


class PublicSchoolProfileSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(source='public_slug', read_only=True)
    school_type = serializers.SerializerMethodField()
    subsystem = serializers.SerializerMethodField()
    region = serializers.SerializerMethodField()
    levels = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = [
            'levels', 'slug', 'name', 'short_name', 'motto', 'description', 'logo', 'banner', 'principal',
            'location', 'region', 'division', 'sub_division', 'city_village', 'address', 'postal_code',
            'phone', 'email', 'school_type', 'subsystem', 'founded_year', 'updated_at',
        ]

    @staticmethod
    def _display(obj, field):
        display = getattr(obj, f'get_{field}_display', None)
        return display() if callable(display) else getattr(obj, field, '')

    def to_representation(self, obj):
        data = super().to_representation(obj)
        profile = self.context.get('profile')
        request = self.context.get('request')
        lang = resolve_lang(request) if request is not None else 'en'
        show_email = bool(profile and profile.show_email)
        show_phone = bool(profile and profile.show_phone)
        show_principal = bool(profile and profile.show_principal)
        if not show_principal:
            data.pop('principal', None)
        if not show_email:
            data.pop('email', None)
        if not show_phone:
            data.pop('phone', None)
        data['lang'] = lang
        data['contact_visibility'] = {'email': show_email, 'phone': show_phone, 'principal': show_principal}
        if profile is None:
            return data
        text = {}
        for field in TEXT_FIELDS:
            for code in LANGS:
                data[f'{field}_{code}'] = getattr(profile, f'{field}_{code}')
            text[field] = resolve_text(profile, field, lang)
        data['text'] = text
        data['core_values'] = profile.core_values or []
        data['theme_accent'] = profile.theme_accent
        data['og_image'] = profile.og_image
        data['social_links'] = profile.social_links or {}
        data['enrollment_enabled'] = profile.enrollment_enabled
        data['noindex'] = bool(self.context.get('preview'))
        data['is_preview'] = bool(self.context.get('preview'))
        return data

    def get_school_type(self, obj):
        return self._display(obj, 'school_type')

    def get_subsystem(self, obj):
        return self._display(obj, 'subsystem')

    def get_region(self, obj):
        return self._display(obj, 'region')

    def get_levels(self, obj):
        return school_levels(obj)


class PublicSchoolProfileView(APIView):
    """GET /api/v1/schools/public/<slug>/ : one published school's public profile.

    ``?preview=<token>`` returns the draft content (noindex, no-store) only when the
    token matches the one the school admin generated.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_site'

    @extend_schema(tags=['Schools'], description='Public profile of one published school. No authentication.')
    def get(self, request, slug):
        token = request.query_params.get('preview')
        if token:
            profile = (SchoolPublicProfile.objects.select_related('school')
                       .filter(school__public_slug=slug).first())
            school = profile.school if profile else None
            if (profile and preview_token_matches(profile, token)
                    and school.status == SchoolStatus.ACTIVE and not school.is_drafted):
                data = PublicSchoolProfileSerializer(
                    school, context={'request': request, 'profile': profile, 'preview': True}).data
                return _public_response(data, preview=True)
            raise Http404
        school = published_schools().select_related('public_profile').filter(public_slug=slug).first()
        if school is None:
            raise Http404
        data = PublicSchoolProfileSerializer(
            school, context={'request': request, 'profile': school.public_profile}).data
        return _public_response(data)


class PublicStaffDirectoryView(APIView):
    """GET /api/v1/schools/public/<slug>/staff/ : a school's opt-in staff list.

    Double opt-in and privacy-safe: returns people only when the school turned
    its directory on, and only staff who personally allowed it. Exposes name,
    public title (or role) and photo - never email, phone or any identifier.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_site'

    STAFF_ROLES = ('SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN')

    @extend_schema(tags=['Schools'], description='Opt-in public staff directory of one school. No authentication.')
    def get(self, request, slug):
        school = published_schools().filter(public_slug=slug).first()
        if school is None:
            raise Http404
        if not school.public_staff_directory_enabled:
            return _public_response({'enabled': False, 'staff': []})

        from apps.users.models import User

        staff = (User.objects
                 .filter(school=school, is_active=True,
                         show_in_staff_directory=True,
                         role__in=self.STAFF_ROLES)
                 .order_by('name'))
        people = [{
            'name': u.name,
            'title': u.public_title or u.display_role,
            'avatar': u.avatar or None,
        } for u in staff]
        return _public_response({'enabled': True, 'staff': people})


class PublicSchoolDirectoryView(APIView):
    """GET /api/v1/schools/public/ : published profile addresses, for the sitemap.

    Returns a plain list (sitemap consumers unchanged). ``?limit=`` (default 1000,
    max 5000) and ``?offset=`` page through it; ``X-Total-Count`` carries the total.

    ``?scope=all`` (card directory) lists EVERY live school as a privacy-safe card
    instead of only published sites; see ``_card``.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_site'

    @staticmethod
    def _int(value, default, low, high):
        try:
            return max(low, min(high, int(value)))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _apply_filters(queryset, params):
        region = str(params.get('region', '')).strip()[:100]
        if region:
            queryset = queryset.filter(region__iexact=region)
        level = str(params.get('level', '')).strip().lower()
        if level in ('nursery', 'primary'):
            queryset = queryset.filter(education_category=School.EDUCATION_CATEGORY_BASIC)
        elif level == 'secondary':
            queryset = queryset.filter(education_category=School.EDUCATION_CATEGORY_SECONDARY)
        elif level == 'higher':
            queryset = queryset.filter(education_category=School.EDUCATION_CATEGORY_HIGHER)
        return queryset

    @staticmethod
    def _card(school, request):
        """Public card for one live school. Fixed key set, nothing personal.

        Always: handle, name, short_name, city_village, region, subsystem, levels,
        logo_url, site_published. Only when the site is published and live (and not
        force-blocked): slug and site_url (``/schools/<slug>``). Never: id, matricule,
        principal, email, phone, address, counts, status.
        """
        handle = school_public_handle(school.id)
        card = {
            'handle': handle,
            'name': school.name,
            'short_name': school.short_name,
            'city_village': school.city_village,
            'region': school.region,
            'subsystem': school.get_subsystem_display(),
            'levels': school_levels(school),
            'logo_url': (request.build_absolute_uri(f'/api/v1/schools/public/logo/{handle}/')
                         if school.has_logo else None),
            'site_published': bool(school.site_published),
        }
        if school.site_published:
            card['slug'] = school.public_slug
            card['site_url'] = f'/schools/{school.public_slug}'
        return card

    def _all_schools(self, request, limit, offset):
        published_q = Q(public_profile_enabled=True, public_slug__isnull=False,
                        public_profile__publication_status=PublicationStatus.PUBLISHED)
        has_logo_q = Q(logo__isnull=False) & ~Q(logo='')
        queryset = live_schools().annotate(
            site_published=Case(When(published_q, then=Value(True)), default=Value(False),
                                output_field=BooleanField()),
            has_logo=Case(When(has_logo_q, then=Value(True)), default=Value(False),
                          output_field=BooleanField()),
        )
        queryset = self._apply_filters(queryset, request.query_params)
        term = str(request.query_params.get('q', '')).strip()[:80]
        if term:
            queryset = queryset.filter(Q(name__icontains=term) | Q(city_village__icontains=term))
        # Published sites first, then alphabetical by name; id is the deterministic tie-break.
        queryset = queryset.order_by('-site_published', 'name', 'id')
        total = queryset.count()
        schools = list(queryset.defer('logo').select_related('settings')[offset:offset + limit])
        response = _public_response([self._card(s, request) for s in schools])
        response['X-Total-Count'] = str(total)
        return response

    @extend_schema(tags=['Schools'], description=(
        'Slugs of published public school sites. No authentication. With ``?detail=1`` each row also carries '
        'name, place, region, logo and education levels, and ``q``, ``region`` and ``level`` '
        '(nursery|primary|secondary|higher) filter the list. Only published schools are returned unless '
        '``scope=all``: then every live school is returned as a non-personal card (published sites first, '
        'then by name), with ``slug``/``site_url`` only for published sites; limit defaults to 24, max 60.'))
    def get(self, request):
        offset = self._int(request.query_params.get('offset'), 0, 0, 10 ** 9)
        if str(request.query_params.get('scope', '')).lower() == 'all':
            limit = self._int(request.query_params.get('limit'), PUBLIC_CARDS_DEFAULT_LIMIT, 1, PUBLIC_CARDS_MAX_LIMIT)
            return self._all_schools(request, limit, offset)
        limit = self._int(request.query_params.get('limit'), PUBLIC_DIRECTORY_DEFAULT_LIMIT,
                          1, PUBLIC_DIRECTORY_MAX_LIMIT)
        queryset = published_schools().order_by('public_slug')
        detail = str(request.query_params.get('detail', '')).lower() in ('1', 'true', 'yes')
        if not detail:
            total = queryset.count()
            rows = queryset.values('public_slug', 'updated_at')[offset:offset + limit]
            response = _public_response(
                [{'slug': row['public_slug'], 'updated_at': row['updated_at']} for row in rows])
            response['X-Total-Count'] = str(total)
            return response

        queryset = self._apply_filters(queryset, request.query_params)
        term = str(request.query_params.get('q', '')).strip()[:80]
        if term:
            queryset = queryset.filter(
                Q(name__icontains=term) | Q(city_village__icontains=term) | Q(location__icontains=term))
        total = queryset.count()
        schools = list(queryset.select_related('settings')[offset:offset + limit])
        data = [{
            'slug': s.public_slug,
            'updated_at': s.updated_at,
            'name': s.name,
            'city_village': s.city_village,
            'location': s.location,
            'region': s.region,
            'logo': s.logo,
            'levels': school_levels(s),
        } for s in schools]
        response = _public_response(data)
        response['X-Total-Count'] = str(total)
        return response


def _decode_logo(value):
    """Returns (content_type, bytes) for a stored base64/data-URL logo, or None when unusable."""
    value = (value or '').strip()
    mime, body = None, value
    match = _DATA_URL.match(value)
    if match:
        if not match.group('b64'):
            return None
        mime = (match.group('mime') or '').lower()
        body = match.group('body')
    if len(body) > (LOGO_MAX_BYTES * 4) // 3 + 8:
        return None
    try:
        raw = base64.b64decode(re.sub(r'\s+', '', body), validate=True)
    except (binascii.Error, ValueError):
        return None
    if not raw or len(raw) > LOGO_MAX_BYTES:
        return None
    if mime not in _LOGO_MIME:
        mime = next((m for magic, m in _MAGIC if raw.startswith(magic)), None)
        if mime is None and raw.lstrip()[:5] in (b'<?xml', b'<svg '):
            mime = 'image/svg+xml'
    if mime not in _LOGO_MIME:
        return None
    return ('image/jpeg' if mime == 'image/jpg' else mime), raw


class PublicSchoolLogoView(APIView):
    """GET /api/v1/schools/public/logo/<handle>/ : a live school's logo image.

    Logos are stored as base64 text, so the card list carries this URL instead of
    inlining them. http(s) or site-relative values redirect (302); base64 data is
    decoded and served with its content type, ETag and a one-day public cache.
    404 for unknown handles, non-live schools, missing/oversized (> 3 MB) or unusable logos.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_site'

    @extend_schema(tags=['Schools'], description='Logo of a live school by opaque public handle. No authentication.')
    def get(self, request, handle):
        if len(handle) != LOGO_HANDLE_LENGTH:
            raise Http404
        logo = None
        candidates = live_schools().filter(logo__isnull=False).exclude(logo='').values_list('id', flat=True)
        for school_id in candidates:
            if hmac.compare_digest(school_public_handle(school_id), handle):
                logo = School.objects.filter(pk=school_id).values_list('logo', flat=True).first()
                break
        value = (logo or '').strip()
        if not value:
            raise Http404
        if re.match(r'^https?://', value, re.I) or (value.startswith('/') and not value.startswith('//')):
            response = HttpResponseRedirect(value)
            response['Cache-Control'] = LOGO_CACHE_CONTROL
            return response
        decoded = _decode_logo(value)
        if decoded is None:
            raise Http404
        content_type, raw = decoded
        etag = '"%s"' % hashlib.sha256(raw).hexdigest()[:32]
        if request.META.get('HTTP_IF_NONE_MATCH') == etag:
            response = HttpResponse(status=304)
        else:
            response = HttpResponse(raw, content_type=content_type)
        response['ETag'] = etag
        response['Cache-Control'] = LOGO_CACHE_CONTROL
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
        return response

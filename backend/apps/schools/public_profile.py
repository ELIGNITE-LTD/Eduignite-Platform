"""Public school profile pages: readable by anyone, indexable by search engines.

Only a school's own descriptive and contact details are exposed. Nothing about
its students, staff, parents, finances or accounts is, including the school
matricule, which is also the principal's sign-in identifier.
"""

from django.http import Http404
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

    class Meta:
        model = School
        fields = [
            'slug', 'name', 'short_name', 'motto', 'description', 'logo', 'banner', 'principal',
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

    @extend_schema(tags=['Schools'], description='Slugs of published public school sites. No authentication.')
    def get(self, request):
        limit = self._int(request.query_params.get('limit'), PUBLIC_DIRECTORY_DEFAULT_LIMIT,
                          1, PUBLIC_DIRECTORY_MAX_LIMIT)
        offset = self._int(request.query_params.get('offset'), 0, 0, 10 ** 9)
        queryset = published_schools().order_by('public_slug')
        total = queryset.count()
        rows = queryset.values('public_slug', 'updated_at')[offset:offset + limit]
        response = _public_response(
            [{'slug': row['public_slug'], 'updated_at': row['updated_at']} for row in rows])
        response['X-Total-Count'] = str(total)
        return response

"""Management API for a school's public website (admins) and founder oversight.

Always scoped server-side: a school admin only ever reaches their own school.
Executives may pass ``school`` (query or body) to act on any school. Founders
(CEO/CTO) can list publication status for every school and force-unpublish.
"""

from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import public_site_services as svc
from .models import PublicationStatus, PublicSiteAuditLog, School, SchoolPublicProfile

FOUNDER_ROLES = ('CEO', 'CTO')
WRITABLE_FIELDS = (
    svc.BILINGUAL_FIELDS + [
        'core_values', 'theme_accent', 'show_email', 'show_phone', 'show_principal',
        'enrollment_enabled', 'og_image', 'social_links',
    ]
)


class IsPublicSiteManager(BasePermission):
    """School admins / sub-admins of a school, or platform executives."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (
            user.is_platform_executive or (user.is_school_admin and user.school_id)))


class IsFounder(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in FOUNDER_ROLES)


class PublicProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolPublicProfile
        fields = WRITABLE_FIELDS

    def to_internal_value(self, data):
        # Reject fields that are not editable here (status, token, ...) rather than ignore silently.
        unknown = set(data) - set(self.fields) - {'school'}
        if unknown:
            raise ValidationError({k: 'This field cannot be edited here.' for k in sorted(unknown)})
        return super().to_internal_value(data)

    def validate(self, attrs):
        for name in svc.BILINGUAL_FIELDS:
            if name in attrs:
                attrs[name] = svc.clean_text(attrs[name])
        for name in ('vision_en', 'vision_fr', 'mission_en', 'mission_fr'):
            if len(attrs.get(name, '')) > 5000:
                raise ValidationError({name: 'Maximum 5000 characters.'})
        for name in ('history_en', 'history_fr'):
            if len(attrs.get(name, '')) > 20000:
                raise ValidationError({name: 'Maximum 20000 characters.'})
        if 'theme_accent' in attrs and not svc.valid_hex_color(attrs['theme_accent']):
            raise ValidationError({'theme_accent': 'Use a hex colour such as #1a73e8.'})
        if 'og_image' in attrs and attrs['og_image'] and not attrs['og_image'].lower().startswith('https://'):
            raise ValidationError({'og_image': 'The image address must start with https://'})
        if 'core_values' in attrs:
            attrs['core_values'] = self._clean_values(attrs['core_values'])
        if 'social_links' in attrs:
            attrs['social_links'] = self._clean_social(attrs['social_links'])
        return attrs

    @staticmethod
    def _clean_values(values):
        if not isinstance(values, list) or len(values) > 12:
            raise ValidationError({'core_values': 'Provide a list of at most 12 values.'})
        cleaned = []
        for item in values:
            if not isinstance(item, dict):
                raise ValidationError({'core_values': 'Each value must be {"en": "...", "fr": "..."}.'})
            entry = {lang: svc.clean_text(item.get(lang, ''))[:120] for lang in svc.LANGS}
            if any(entry.values()):
                cleaned.append(entry)
        return cleaned

    @staticmethod
    def _clean_social(links):
        if not isinstance(links, dict):
            raise ValidationError({'social_links': 'Provide an object of platform to address.'})
        cleaned = {}
        for key, url in links.items():
            if key not in svc.SOCIAL_KEYS:
                raise ValidationError({'social_links': f'Unsupported platform: {key}.'})
            url = str(url or '').strip()
            if not url:
                continue
            if not url.lower().startswith(('https://', 'http://')) or len(url) > 300:
                raise ValidationError({'social_links': f'{key} must be an http(s) address.'})
            cleaned[key] = url
        return cleaned


def _school_summary(school):
    return {
        'id': school.id, 'slug': school.public_slug, 'name': school.name, 'short_name': school.short_name,
        'motto': school.motto, 'description': school.description, 'email': school.email,
        'phone': school.phone, 'address': school.address, 'has_logo': bool(school.logo),
        'has_banner': bool(school.banner), 'status': school.status,
    }


def _profile_payload(profile):
    data = dict(PublicProfileSerializer(profile).data)
    data.update({
        'publication_status': profile.publication_status,
        'published_at': profile.published_at,
        'locked_by_founder': profile.locked_by_founder,
        'preview_token': profile.preview_token,
        'is_live': (profile.publication_status == PublicationStatus.PUBLISHED and svc.is_live(profile.school)),
        'publish_blockers': svc.publish_errors(profile.school),
        'school': _school_summary(profile.school),
        'updated_at': profile.updated_at,
    })
    return data


class _ManagerView(APIView):
    permission_classes = [IsPublicSiteManager]

    def target_school(self, request):
        user = request.user
        requested = request.query_params.get('school') or (
            request.data.get('school') if isinstance(request.data, dict) else None)
        if user.is_platform_executive:
            if not requested:
                raise ValidationError({'school': 'Executives must specify which school.'})
            try:
                return School.objects.get(pk=requested)
            except School.DoesNotExist:
                raise ValidationError({'school': 'Unknown school.'})
        if requested and str(requested) != str(user.school_id):
            raise PermissionDenied('You can only manage your own school.')
        return user.school


class PublicSiteProfileView(_ManagerView):
    """GET / PATCH /api/v1/schools/public-site/profile/"""

    @extend_schema(tags=['Public site'], description="The school's public site settings.")
    def get(self, request):
        school = self.target_school(request)
        return Response(_profile_payload(svc.get_profile(school)))

    @extend_schema(tags=['Public site'], description="Edit the school's public site settings (plain text only).")
    @transaction.atomic
    def patch(self, request):
        school = self.target_school(request)
        profile = svc.get_profile(school)
        body = {k: v for k, v in request.data.items() if k != 'school'}
        serializer = PublicProfileSerializer(profile, data=body, partial=True)
        serializer.is_valid(raise_exception=True)
        before = svc.snapshot(profile, serializer.validated_data.keys())
        for name, value in serializer.validated_data.items():
            setattr(profile, name, value)
        profile.updated_by = request.user
        profile.save()
        changes = svc.diff_fields(before, serializer.validated_data)
        if changes:
            svc.write_audit(school, request, 'profile_updated', changes)
        return Response(_profile_payload(profile))


class PublicSitePublishView(_ManagerView):
    """POST /api/v1/schools/public-site/publish/"""

    @extend_schema(tags=['Public site'], description='Publish the public site after validating minimum content.')
    @transaction.atomic
    def post(self, request):
        school = self.target_school(request)
        profile = svc.get_profile(school)
        if profile.locked_by_founder:
            return Response({'detail': 'Publication was disabled by the platform. Contact EduIgnite support.',
                             'errors': {'locked': 'Locked by the platform.'}}, status=status.HTTP_403_FORBIDDEN)
        errors = svc.publish_errors(school)
        if errors:
            return Response({'detail': 'The site cannot be published yet.', 'errors': errors},
                            status=status.HTTP_400_BAD_REQUEST)
        svc.set_status(profile, PublicationStatus.PUBLISHED, request, 'published', request.user)
        return Response(_profile_payload(profile))


class PublicSiteUnpublishView(_ManagerView):
    """POST /api/v1/schools/public-site/unpublish/"""

    @extend_schema(tags=['Public site'], description='Take the public site offline.')
    @transaction.atomic
    def post(self, request):
        school = self.target_school(request)
        profile = svc.get_profile(school)
        svc.set_status(profile, PublicationStatus.UNPUBLISHED, request, 'unpublished', request.user)
        return Response(_profile_payload(profile))


class PublicSitePreviewTokenRotateView(_ManagerView):
    """POST /api/v1/schools/public-site/preview-token/rotate/"""

    @extend_schema(tags=['Public site'], description='Create a new preview token (the old link stops working).')
    @transaction.atomic
    def post(self, request):
        school = self.target_school(request)
        profile = svc.get_profile(school)
        profile.preview_token = svc.new_preview_token()
        profile.updated_by = request.user
        profile.save()
        svc.write_audit(school, request, 'preview_token_rotated')
        return Response({'preview_token': profile.preview_token,
                         'preview_path': f'/schools/public/{school.public_slug}/?preview={profile.preview_token}'})


class PublicSiteAuditView(_ManagerView):
    """GET /api/v1/schools/public-site/audit/?limit=&offset="""

    @extend_schema(tags=['Public site'], description="Who changed the school's public site and when.")
    def get(self, request):
        school = self.target_school(request)
        try:
            limit = max(1, min(200, int(request.query_params.get('limit', 50))))
            offset = max(0, int(request.query_params.get('offset', 0)))
        except ValueError:
            raise ValidationError({'limit': 'Must be a number.'})
        queryset = PublicSiteAuditLog.objects.filter(school=school)
        rows = [{
            'id': str(r.id), 'action': r.action, 'actor_name': r.actor_name, 'changes': r.changes,
            'ip_address': r.ip_address, 'created_at': r.created_at,
        } for r in queryset[offset:offset + limit]]
        return Response({'count': queryset.count(), 'results': rows})


class PublicSiteMineView(APIView):
    """GET /api/v1/schools/public-site/mine/ : is my school's public site live? (any school user)

    Lets teachers, students and parents open their school's page, or be told it is
    not published yet, without exposing any management data.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['Public site'], description="Whether the caller's school website is live, and its address.")
    def get(self, request):
        school = request.user.school
        if school is None:
            return Response({'slug': None, 'is_live': False, 'publication_status': None})
        profile = SchoolPublicProfile.objects.filter(school=school).first()
        published = bool(profile and profile.publication_status == PublicationStatus.PUBLISHED)
        return Response({
            'slug': school.public_slug,
            'is_live': bool(published and svc.is_live(school)),
            'publication_status': profile.publication_status if profile else PublicationStatus.DRAFT,
        })


class FounderPublicSiteListView(APIView):
    """GET /api/v1/schools/public-site/schools/ : publication status per school (CEO/CTO)."""

    permission_classes = [IsFounder]

    @extend_schema(tags=['Public site'], description='Publication status of every school (founders only).')
    def get(self, request):
        try:
            limit = max(1, min(500, int(request.query_params.get('limit', 100))))
            offset = max(0, int(request.query_params.get('offset', 0)))
        except ValueError:
            raise ValidationError({'limit': 'Must be a number.'})
        schools = School.objects.select_related('public_profile').order_by('name')
        wanted = request.query_params.get('status')
        if wanted:
            if wanted == PublicationStatus.DRAFT:
                schools = schools.filter(Q(public_profile__isnull=True)
                                         | Q(public_profile__publication_status=PublicationStatus.DRAFT))
            else:
                schools = schools.filter(public_profile__publication_status=wanted)
        total = schools.count()
        rows = []
        for school in schools[offset:offset + limit]:
            profile = getattr(school, 'public_profile', None)
            rows.append({
                'id': school.id, 'name': school.name, 'slug': school.public_slug,
                'publication_status': profile.publication_status if profile else PublicationStatus.DRAFT,
                'published_at': profile.published_at if profile else None,
                'locked_by_founder': bool(profile and profile.locked_by_founder),
                'kill_switch_on': not school.public_profile_enabled,
                'is_live': bool(profile and profile.publication_status == PublicationStatus.PUBLISHED
                                and svc.is_live(school)),
            })
        return Response({'count': total, 'results': rows})


class FounderForceUnpublishView(APIView):
    """POST /api/v1/schools/public-site/schools/<school_id>/force-unpublish/ (and /unlock/)."""

    permission_classes = [IsFounder]
    lock = True

    @extend_schema(tags=['Public site'], description='Force a school site offline (founders only).')
    @transaction.atomic
    def post(self, request, school_id):
        try:
            school = School.objects.get(pk=school_id)
        except School.DoesNotExist:
            return Response({'detail': 'Unknown school.'}, status=status.HTTP_404_NOT_FOUND)
        profile = svc.get_profile(school)
        if self.lock:
            profile.locked_by_founder = True
            svc.set_status(profile, PublicationStatus.UNPUBLISHED, request, 'force_unpublished', request.user)
        else:
            profile.locked_by_founder = False
            profile.updated_by = request.user
            profile.save()
            svc.write_audit(school, request, 'publication_unlocked')
        return Response({'id': school.id, 'publication_status': profile.publication_status,
                         'locked_by_founder': profile.locked_by_founder})


class FounderUnlockView(FounderForceUnpublishView):
    lock = False


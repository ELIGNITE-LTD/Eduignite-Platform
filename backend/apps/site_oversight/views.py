"""Endpoints under /api/v1/site-oversight/.

Staff endpoints are gated by the ``school_websites`` executive module. The
school endpoint reads only the caller's own school.
"""

from django.db.models import Q
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.schools import public_site_services as site_svc
from apps.schools.models import PublicationStatus, School

from . import services as svc
from .models import CaseState, SiteOversightCase
from .permissions import CanOverseeWebsites, IsSchoolAdminOfSchool


def _school_or_404(school_id):
    school = School.objects.filter(pk=school_id).first()
    if school is None:
        raise Http404('Unknown school.')
    return school


def _state(school, profile, case):
    return {
        'id': school.id,
        'publication_status': profile.publication_status if profile else PublicationStatus.DRAFT,
        'blocked': bool(profile and profile.locked_by_founder),
        'case': svc.serialize_case(case),
    }


class SchoolListView(APIView):
    """GET schools/?status=&blocked=1&q=&limit=&offset= : every school's site state."""

    permission_classes = [CanOverseeWebsites]

    @extend_schema(tags=['Site oversight'], description="Every school's website state (school_websites module).")
    def get(self, request):
        try:
            limit = max(1, min(500, int(request.query_params.get('limit', 100))))
            offset = max(0, int(request.query_params.get('offset', 0)))
        except ValueError:
            raise ValidationError({'limit': 'Must be a number.'})
        schools = School.objects.select_related('public_profile').order_by('name')
        wanted = request.query_params.get('status')
        if wanted == 'blocked' or request.query_params.get('blocked') in ('1', 'true'):
            schools = schools.filter(public_profile__locked_by_founder=True)
        elif wanted == PublicationStatus.DRAFT:
            schools = schools.filter(Q(public_profile__isnull=True)
                                     | Q(public_profile__publication_status=PublicationStatus.DRAFT)
                                     ).exclude(public_profile__locked_by_founder=True)
        elif wanted in (PublicationStatus.PUBLISHED, PublicationStatus.UNPUBLISHED):
            schools = schools.filter(public_profile__publication_status=wanted,
                                     public_profile__locked_by_founder=False)
        q = (request.query_params.get('q') or '').strip()
        if q:
            schools = schools.filter(Q(name__icontains=q) | Q(id__icontains=q))
        total = schools.count()
        page = list(schools[offset:offset + limit])
        cases = {c.school_id: c for c in SiteOversightCase.objects.filter(
            school__in=page, state=CaseState.OPEN)}
        rows = []
        for school in page:
            profile = getattr(school, 'public_profile', None)
            row = _state(school, profile, cases.get(school.id))
            row.update({
                'name': school.name, 'slug': school.public_slug,
                'published_at': profile.published_at if profile else None,
                'kill_switch_on': not school.public_profile_enabled,
                'is_live': bool(profile and profile.publication_status == PublicationStatus.PUBLISHED
                                and site_svc.is_live(school)),
            })
            rows.append(row)
        return Response({'count': total, 'results': rows})


class _SchoolAction(APIView):
    permission_classes = [CanOverseeWebsites]

    def post(self, request, school_id):
        school = _school_or_404(school_id)
        data = request.data if isinstance(request.data, dict) else {}
        self.perform(school, request, data)
        profile = site_svc.get_profile(school)
        return Response(_state(school, profile, svc.open_case(school)))


class BlockView(_SchoolAction):
    @extend_schema(tags=['Site oversight'], description='Block a school website (reason and steps required).')
    def perform(self, school, request, data):
        svc.block(school, request.user, request, data.get('reason'), data.get('resolution_steps'))


class UnblockView(_SchoolAction):
    @extend_schema(tags=['Site oversight'], description='Unblock: restores the previous publication status.')
    def perform(self, school, request, data):
        svc.unblock(school, request.user, request, data.get('reason'))


class ResolutionStepsView(_SchoolAction):
    @extend_schema(tags=['Site oversight'], description='Add / update the steps on an open block and re-notify.')
    def perform(self, school, request, data):
        svc.update_steps(school, request.user, request, data.get('reason'), data.get('resolution_steps'))


class PublishView(_SchoolAction):
    @extend_schema(tags=['Site oversight'], description='Publish on behalf of a school (reason required).')
    def perform(self, school, request, data):
        svc.staff_set_publication(school, request.user, request, data.get('reason'), publish=True)


class UnpublishView(_SchoolAction):
    @extend_schema(tags=['Site oversight'], description='Unpublish on behalf of a school (reason required).')
    def perform(self, school, request, data):
        svc.staff_set_publication(school, request.user, request, data.get('reason'), publish=False)


class TimelineView(APIView):
    permission_classes = [CanOverseeWebsites]

    @extend_schema(tags=['Site oversight'], description="A school's oversight timeline.")
    def get(self, request, school_id):
        school = _school_or_404(school_id)
        profile = site_svc.get_profile(school)
        return Response({**_state(school, profile, svc.open_case(school)), 'timeline': svc.timeline(school)})


class MineView(APIView):
    """GET mine/ : the caller's school block state, steps and timeline (school admins)."""

    permission_classes = [IsSchoolAdminOfSchool]

    @extend_schema(tags=['Site oversight'], description="Block state and messages for the caller's school.")
    def get(self, request):
        school = request.user.school
        profile = site_svc.get_profile(school)
        case = svc.open_case(school)
        last_resolved = None
        if case is None:
            last_resolved = SiteOversightCase.objects.filter(
                school=school, state=CaseState.RESOLVED).order_by('-unblocked_at').first()
        return Response({
            **_state(school, profile, case),
            'last_resolved': svc.serialize_case(last_resolved),
            'timeline': svc.timeline(school),
        })

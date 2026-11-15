"""Public (no sign-in) programmes and departments of a published higher-education site.

Same visibility rule as the rest of the school website: the school's site must be
PUBLISHED and live, and the school must be a higher-education institution. Only
active programmes and the active departments that hold one are returned; nothing
personal or financial is exposed.
"""

from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.schools.public_profile import _public_response, published_schools

from .api import is_higher_school
from .models import OrganizationalUnit, Programme


class _PublicHigherView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_site'

    def _school(self, slug):
        school = published_schools().filter(public_slug=slug).first()
        if school is None or not is_higher_school(school):
            raise Http404
        return school


class PublicProgrammesView(_PublicHigherView):
    """GET /api/v1/schools/public/<slug>/programmes/"""

    @extend_schema(tags=['Schools'], description='Active programmes of a published higher-education institution.')
    def get(self, request, slug):
        school = self._school(slug)
        rows = (Programme.objects.filter(school=school, is_active=True, department__is_active=True)
                .select_related('department').order_by('award_level', 'name'))
        data = [{
            'id': str(p.id),
            'name': p.name,
            'award_level': p.award_level,
            'award_level_label': p.get_award_level_display(),
            'duration_years': p.duration_years,
            'required_credits': p.required_credits or None,
            'department_name': p.department.name,
            'description': p.description,
        } for p in rows]
        return _public_response(data)


class PublicDepartmentsView(_PublicHigherView):
    """GET /api/v1/schools/public/<slug>/departments/ : active departments that hold an active programme."""

    @extend_schema(tags=['Schools'], description='Departments (with their faculty) of a published institution.')
    def get(self, request, slug):
        school = self._school(slug)
        holding = (Programme.objects.filter(school=school, is_active=True)
                   .values_list('department_id', flat=True).distinct())
        rows = (OrganizationalUnit.objects
                .filter(school=school, unit_type=OrganizationalUnit.DEPARTMENT, is_active=True, id__in=list(holding))
                .select_related('parent').order_by('name'))
        data = [{
            'id': str(u.id),
            'name': u.name,
            'parent_name': u.parent.name if u.parent_id else '',
        } for u in rows]
        return _public_response(data)

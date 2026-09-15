"""Public school profile pages: readable by anyone, indexable by search engines.

Only a school's own descriptive and contact details are exposed. Nothing about
its students, staff, parents, finances or accounts is, including the school
matricule, which is also the principal's sign-in identifier.
"""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import School, SchoolStatus

PUBLIC_DIRECTORY_LIMIT = 5000


def published_schools():
    """Schools whose public profile is live."""
    return School.objects.filter(
        public_profile_enabled=True,
        status=SchoolStatus.ACTIVE,
        is_drafted=False,
        public_slug__isnull=False,
    )


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

    def get_school_type(self, obj):
        return self._display(obj, 'school_type')

    def get_subsystem(self, obj):
        return self._display(obj, 'subsystem')

    def get_region(self, obj):
        return self._display(obj, 'region')


class PublicSchoolProfileView(APIView):
    """GET /api/v1/schools/public/<slug>/ : one school's public profile."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=['Schools'], description='Public profile of one school. No authentication.')
    def get(self, request, slug):
        school = get_object_or_404(published_schools(), public_slug=slug)
        return Response(PublicSchoolProfileSerializer(school).data)


class PublicSchoolDirectoryView(APIView):
    """GET /api/v1/schools/public/ : every live profile address, for the sitemap."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=['Schools'], description='Slugs of every public school profile. No authentication.')
    def get(self, request):
        rows = published_schools().order_by('name').values('public_slug', 'updated_at')[:PUBLIC_DIRECTORY_LIMIT]
        return Response([{'slug': row['public_slug'], 'updated_at': row['updated_at']} for row in rows])

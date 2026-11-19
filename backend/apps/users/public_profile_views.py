"""A founder or executive edits their own public card from their own account."""

from django.core.cache import cache
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FounderProfile
from .public_profile import (
    LINK_TYPES,
    MAX_BIO_LENGTH,
    MAX_LINKS,
    FounderPublicProfileSerializer,
    public_links_for_display,
)

FOUNDERS_CACHE_KEY = 'public_site:founders'  # keep in step with PublicFoundersView.cache_key


class HasFounderProfile(BasePermission):
    """Only people who appear on the public leadership list can edit a card, and only their own."""

    message = 'Only founders and executive staff have a public profile.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return FounderProfile.objects.filter(user=user, user__is_drafted=False).exists()


def _payload(profile):
    return {
        'bio': profile.public_bio or '',
        'links': public_links_for_display(profile.public_links),
        'max_bio_length': MAX_BIO_LENGTH,
        'max_links': MAX_LINKS,
        'link_types': [{'type': key, 'label': label} for key, (label, _) in LINK_TYPES.items()],
    }


class FounderPublicProfileView(APIView):
    """
    GET   /users/founder-public-profile/   your bio and links as they appear on the public site
    PATCH /users/founder-public-profile/   change them; the public site shows the change at once
    """

    permission_classes = [IsAuthenticated, HasFounderProfile]

    @extend_schema(tags=['Users'], description='Your public bio and links (founders and executives only).')
    def get(self, request):
        profile = FounderProfile.objects.get(user=request.user)
        return Response(_payload(profile))

    @extend_schema(tags=['Users'], request=FounderPublicProfileSerializer, description='Update your public bio and links.')
    def patch(self, request):
        profile = FounderProfile.objects.get(user=request.user)
        serializer = FounderPublicProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        fields = []
        if 'bio' in data:
            profile.public_bio = data['bio']
            fields.append('public_bio')
        if 'links' in data:
            profile.public_links = data['links']
            fields.append('public_links')
        if fields:
            profile.save(update_fields=fields + ['updated_at'])
            cache.delete(FOUNDERS_CACHE_KEY)
        return Response(_payload(profile), status=status.HTTP_200_OK)

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import public_profile as pp
from .models import FounderProfile


def _payload(profile: FounderProfile) -> dict:
    user = profile.user
    return {
        'name': user.name, 'title': profile.founder_title, 'role': user.role, 'avatar': getattr(user, 'avatar', '') or '',
        'is_cofounder': user.role in ('CEO', 'CTO'),
        'bio': profile.public_bio, 'links': pp.public_links(profile.social_links),
        'limits': {'bio': pp.BIO_MAX, 'links': pp.MAX_LINKS},
        'link_kinds': [{'kind': k, 'label': v['label'], 'hint': v['hint']} for k, v in pp.LINK_KINDS.items()],
    }


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def public_profile(request):
    """A founder or executive reads and edits their own public bio and links. Nobody can edit anyone else's."""
    profile = FounderProfile.objects.select_related('user').filter(user=request.user).first()
    if profile is None:
        return Response({'detail': 'Only founders and executive staff have a public profile.'}, status=status.HTTP_403_FORBIDDEN)
    if request.method == 'PUT':
        data = request.data
        bio = pp.clean_bio(data.get('bio', profile.public_bio))
        links = pp.clean_links(data.get('links', profile.social_links))
        profile.public_bio, profile.social_links = bio, links
        profile.save(update_fields=['public_bio', 'social_links'])   # the post_save signal refreshes the public site at once
    return Response(_payload(profile))

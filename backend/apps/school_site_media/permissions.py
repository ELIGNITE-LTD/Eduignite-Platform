"""Who may manage a school's public events and gallery.

Same rule as the rest of the public-site management API: school administrators
(and sub-administrators) of that school, or platform executives holding the
``school_websites`` module. A school user is always pinned to their own school.
"""

from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.schools.models import School
from apps.schools.public_site_views import IsPublicSiteManager

__all__ = ['IsPublicSiteManager', 'target_school']


def target_school(request):
    """The school this request may act on; raises if the caller reaches for another."""
    user = request.user
    requested = request.query_params.get('school')
    if not requested and hasattr(request.data, 'get'):
        requested = request.data.get('school')
    if user.is_platform_executive:
        if not requested:
            raise ValidationError({'school': 'Executives must specify which school.'})
        school = School.objects.filter(pk=requested).first()
        if school is None:
            raise ValidationError({'school': 'Unknown school.'})
        return school
    if requested and str(requested) != str(user.school_id):
        raise PermissionDenied('You can only manage your own school.')
    return user.school

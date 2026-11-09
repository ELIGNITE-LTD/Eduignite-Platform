from rest_framework.permissions import SAFE_METHODS, BasePermission

from .api import is_higher_school


class IsHigherEdInstitution(BasePermission):
    """Signed-in member of a higher-education institution (403 for any other category).

    Reading is open to every member of the institution; writing is limited to the
    institution administrator (the SCHOOL_ADMIN role).
    """

    message = 'This feature is only available to higher education institutions.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        school = getattr(user, 'school', None)
        if not is_higher_school(school):
            return False
        if request.method in SAFE_METHODS:
            return True
        if user.role != 'SCHOOL_ADMIN':
            self.message = 'Only the institution administrator can change this.'
            return False
        return True

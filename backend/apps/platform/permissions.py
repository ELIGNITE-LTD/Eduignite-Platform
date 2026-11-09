from rest_framework.permissions import BasePermission


class IsExecutive(BasePermission):
    """
    Permission for platform executives.
    """

    def has_permission(self, request, view):
        """Check if user is a platform executive."""
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_platform_executive
        )


class IsCEOOrCTO(BasePermission):
    """Restrict sensitive platform identity/license changes to the founders (CEO, CTO)."""

    allowed_roles = {'CEO', 'CTO'}

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )


class IsFounderCEOOrCTO(BasePermission):
    """The system log is for the two founders only, with equal rights.

    Checked on the role itself, so it can never be granted through
    ``allowed_modules`` and SUPER_ADMIN (unlike ``IsCEOOrCTO``) is not included.
    """

    allowed_roles = frozenset({'CEO', 'CTO'})
    message = 'Only the CEO and CTO can open the system log.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated
            and str(getattr(user, 'role', '') or '').upper() in self.allowed_roles
        )

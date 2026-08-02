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
    """Restrict sensitive platform identity/license changes to CEO, CTO, or Super Admin."""

    allowed_roles = {'CEO', 'CTO', 'SUPER_ADMIN'}

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )

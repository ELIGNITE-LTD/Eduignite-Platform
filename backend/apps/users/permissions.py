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
    """Permission for CEO, CTO, or Super Admin sensitive platform actions."""

    allowed_roles = {'CEO', 'CTO', 'SUPER_ADMIN'}

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


class IsExecutiveOrSchoolAdmin(BasePermission):
    """
    Permission for platform executives or school admins.
    """

    def has_permission(self, request, view):
        """Check if user is executive or school admin."""
        return (
            request.user
            and request.user.is_authenticated
            and (request.user.is_platform_executive or request.user.is_school_admin)
        )


class IsOwnerOrExecutive(BasePermission):
    """
    Permission for user to edit their own profile or executives to edit any.
    """

    def has_object_permission(self, request, view, obj):
        """Check if user is owner or executive."""
        return (
            obj == request.user or request.user.is_platform_executive
        )


class IsPrimaryFounder(BasePermission):
    """
    Permission for CEO/CTO founder management.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in ['CEO', 'CTO']
        )

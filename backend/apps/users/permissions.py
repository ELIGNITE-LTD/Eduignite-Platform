from rest_framework.permissions import BasePermission


class HasCapability(BasePermission):
    """Allow a user who holds a given capability, by role or by explicit grant.

    Set ``required_capability`` on the view (one of User.CAP_TEACHER /
    CAP_PARTNER / CAP_LEARNER). This is how a single identity with more than one
    authorized role is checked: a school admin granted the teacher capability
    passes a teacher-capability check without changing their primary role.
    """

    def has_permission(self, request, view):
        capability = getattr(view, 'required_capability', None)
        user = request.user
        return bool(
            capability
            and user
            and user.is_authenticated
            and user.has_capability(capability)
        )


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

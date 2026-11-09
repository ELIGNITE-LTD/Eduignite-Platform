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

    allowed_roles = {'CEO', 'CTO'}

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


class CanEditSchoolUser(BasePermission):
    """Edit a user: the user themselves, a platform executive, or a school
    administrator acting within their own school.

    A school admin (or sub-admin) may update the profile, including the email
    address, of users in their school. A sub-admin is limited to the sub-schools
    they manage. No one here may act on a platform executive, and this never
    grants a role change (that stays on its own executive-only action).
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if obj == user or user.is_platform_executive:
            return True
        if user.is_school_admin:
            # A platform executive is never edited by a school admin.
            if getattr(obj, 'is_platform_executive', False):
                return False
            if not getattr(user, 'school_id', None) or getattr(obj, 'school_id', None) != user.school_id:
                return False
            if user.role == 'SUB_ADMIN':
                from apps.schools.scoping import managed_sub_school_ids
                allowed = managed_sub_school_ids(user)
                if allowed and getattr(obj, 'sub_school_id', None) not in allowed:
                    return False
            return True
        return False


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

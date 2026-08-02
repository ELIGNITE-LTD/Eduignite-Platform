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

    def has_object_permission(self, request, view, obj):
        """Check if user is executive or admin of the school."""
        if request.user.is_platform_executive:
            return True
        if request.user.is_school_admin:
            user_school = getattr(request.user, 'school', None)
            object_school_id = getattr(obj, 'school_id', None)
            if not object_school_id:
                object_school = getattr(obj, 'school', None)
                object_school_id = getattr(object_school, 'id', None)
            if not object_school_id:
                object_school_id = getattr(obj, 'id', None)
            return bool(user_school and str(user_school.id) == str(object_school_id))
        return False

from rest_framework.permissions import BasePermission

from apps.users.executive_access import user_has_module


class CanOverseeWebsites(BasePermission):
    """The ``school_websites`` module decides (CEO/CTO always), never the role label."""

    def has_permission(self, request, view):
        return user_has_module(request.user, 'school_websites')


class IsSchoolAdminOfSchool(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_school_admin and user.school_id)

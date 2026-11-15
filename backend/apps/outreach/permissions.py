from rest_framework.permissions import BasePermission

from apps.users.executive_access import user_has_module


class CanUseOutreach(BasePermission):
    """The ``outreach`` module decides: CEO/CTO always; any other executive only when the founders assigned it."""

    message = 'Outreach is available to the founders and to executives they assign it to.'

    def has_permission(self, request, view):
        return user_has_module(request.user, 'outreach')

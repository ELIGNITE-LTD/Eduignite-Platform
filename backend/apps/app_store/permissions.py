from rest_framework import permissions

from apps.users.executive_access import user_has_module


class IsAppStoreManagerOrReadOnly(permissions.BasePermission):
    """Anyone may read; changing store items needs the App registry module
    (CEO/CTO always hold it), whatever the role label."""

    message = 'Your account has not been given access to the application store.'

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return user_has_module(request.user, 'app_registry')

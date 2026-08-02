from rest_framework import permissions


EXECUTIVE_APP_STORE_ROLES = {'SUPER_ADMIN', 'CEO', 'CTO'}


class IsAppStoreManagerOrReadOnly(permissions.BasePermission):
    message = 'Only CEO, CTO, or Super Admin can manage application store items.'

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in EXECUTIVE_APP_STORE_ROLES
        )

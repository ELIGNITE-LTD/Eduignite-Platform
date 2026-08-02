from rest_framework import permissions


class CanManagePlatformNotifications(permissions.BasePermission):
    message = 'Only CEO, CTO, Super Admin, or school administrators can create managed notifications.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if getattr(view, 'action', None) in ['mark_read', 'mark_all_read', 'unread_count']:
            return True
        return request.user.role in ['SUPER_ADMIN', 'CEO', 'CTO', 'SCHOOL_ADMIN', 'SUB_ADMIN']

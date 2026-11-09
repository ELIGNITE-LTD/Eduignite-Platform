from rest_framework import permissions


class CanManagePlatformNotifications(permissions.BasePermission):
    message = 'Only executives holding the Announcements module, or school administrators can create managed notifications.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if getattr(view, 'action', None) in ['mark_read', 'mark_all_read', 'unread_count']:
            return True
        from apps.users.executive_access import user_has_module

        if request.user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return True
        return user_has_module(request.user, 'announcements')

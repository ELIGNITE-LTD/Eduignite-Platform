from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsPostOwnerOrFounder(BasePermission):
    """Allow founders to manage any post and authors to manage their own posts."""

    FOUNDER_ROLES = {'CEO', 'CTO', 'SUPER_ADMIN'}
    message = 'You can only modify your own community posts.'

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'role', None) in self.FOUNDER_ROLES:
            return True
        return str(getattr(obj, 'author_id', '')) == str(user.id)

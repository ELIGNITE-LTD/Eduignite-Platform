from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsPostOwnerOrFounder(BasePermission):
    """Allow founders (and executives holding the module) to manage any post and authors to manage their own posts."""

    message = 'You can only modify your own community posts.'

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        # Founders, and executives given the Log posts / Community module, manage
        # any post - whatever their role label.
        from apps.users.executive_access import user_has_any_module

        if user_has_any_module(user, ('log_post', 'community')):
            return True
        return str(getattr(obj, 'author_id', '')) == str(user.id)

"""Server-side enforcement that a school actually has the app it is using.

Hiding a feature in the navigation is presentation, not security — the endpoint
is still there and still reachable with a token and curl. This permission is
what actually stops it, so every app-owned endpoint should carry it.

Usage on a viewset or APIView:

    from apps.registry.permissions import RequiresApp

    class AttendanceViewSet(viewsets.ModelViewSet):
        permission_classes = [permissions.IsAuthenticated, RequiresApp('attendance')]

The factory returns a class rather than an instance because DRF instantiates
whatever it finds in ``permission_classes``.
"""

from rest_framework.permissions import BasePermission

from . import api as registry_api


def RequiresApp(app_key: str):  # noqa: N802 - reads as a class in permission_classes
    """Build a permission class that requires ``app_key`` to be installed."""

    class _RequiresApp(BasePermission):
        message = 'This app is not available for your school.'

        def has_permission(self, request, view):
            user = getattr(request, 'user', None)
            if user is None or not getattr(user, 'is_authenticated', False):
                return False
            allowed = registry_api.is_installed_for_user(user, app_key)
            if not allowed:
                manifest = registry_api.get_app(app_key)
                name = manifest.name if manifest else app_key
                self.message = (
                    f'{name} is not part of your school\'s subscription. '
                    'Ask your administrator to request it.'
                )
            return allowed

        def has_object_permission(self, request, view, obj):
            return self.has_permission(request, view)

    _RequiresApp.__name__ = f'RequiresApp_{app_key}'
    _RequiresApp.__qualname__ = _RequiresApp.__name__
    return _RequiresApp

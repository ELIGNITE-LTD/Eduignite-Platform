"""DRF permission classes for EduIgnite Academy.

Every scope check here is enforced server-side regardless of what the
frontend hides — per the spec's "Developer Notice", this is a hard
requirement, not a nice-to-have.
"""

from rest_framework.permissions import BasePermission

from .models import AcademyPermission


def user_has_scope(user, scope) -> bool:
    """Shared check used both by the permission classes below and directly
    inside views that need to combine several scope checks (e.g. course
    create also requires the assigning user to hold COURSE_ASSIGN)."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return AcademyPermission.objects.filter(user=user, scope=scope).exists()


def HasAcademyScope(scope):
    """Class factory: ``HasAcademyScope(AcademyPermission.Scope.PROFILE_EDIT)``
    returns a DRF permission class gated on that single scope. A class
    factory (rather than a constructor arg) because DRF's
    ``permission_classes`` list expects classes, not instances.
    """

    class _HasAcademyScope(BasePermission):
        required_scope = scope
        message = f'You need the {scope} Academy scope to perform this action.'

        def has_permission(self, request, view):
            return user_has_scope(request.user, self.required_scope)

    _HasAcademyScope.__name__ = f'HasAcademyScope_{scope}'
    return _HasAcademyScope

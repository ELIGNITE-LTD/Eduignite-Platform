"""DRF permission classes for EduIgnite Academy.

Every scope check here is enforced server-side regardless of what the
frontend hides — per the spec's "Developer Notice", this is a hard
requirement, not a nice-to-have.
"""

from rest_framework.permissions import BasePermission

from apps.users.executive_access import ALWAYS_FULL_ACCESS_ROLES, user_has_module

from .models import AcademyPermission

# An executive the founders gave the ``academy`` module (see
# apps/users/executive_modules.py) runs the Academy CMS without needing a
# per-user grant row for each of these. Course governance (COURSE_CREATE,
# COURSE_PUBLISH, COURSE_ASSIGN, COURSE_APPROVE) deliberately stays a per-user
# grant: it is not implied by the module.
ACADEMY_MODULE_SCOPES = frozenset({
    AcademyPermission.Scope.PROFILE_EDIT,
    AcademyPermission.Scope.ACM_READ,
    AcademyPermission.Scope.ACM_WRITE,
    AcademyPermission.Scope.ANALYTICS_VIEW,
})


def user_has_scope(user, scope) -> bool:
    """Shared check used both by the permission classes below and directly
    inside views that need to combine several scope checks (e.g. course
    create also requires the assigning user to hold COURSE_ASSIGN)."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if AcademyPermission.objects.filter(user=user, scope=scope).exists():
        return True
    return (
        scope in ACADEMY_MODULE_SCOPES
        and getattr(user, 'role', None) not in ALWAYS_FULL_ACCESS_ROLES
        and user_has_module(user, 'academy')
    )


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

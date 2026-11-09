from rest_framework.permissions import BasePermission

# The wire contract calls this actor "the technician" — the companion mobile
# app is used by "the school's designated technical person" (spec section 2B).
# There is no dedicated TECHNICIAN role on the platform yet, so school admins
# and sub-admins (who already carry out this kind of account/hardware
# administration in the rest of the API) stand in for it, same as
# ``core.permissions.IsSchoolAdmin``. Platform executives are also allowed,
# for EduIgnite Office support staff handling activations on a school's
# behalf.
TECHNICIAN_ROLES = ['SCHOOL_ADMIN', 'SUB_ADMIN']


def _platform_staff(user) -> bool:
    """Founders, or an executive the founders gave the Schools module."""
    from apps.users.executive_access import has_platform_school_access

    return has_platform_school_access(user)


class IsSchoolTechnician(BasePermission):
    """Authenticated school technician (admin/sub-admin) or platform executive.

    This is "the same authentication the rest of the API uses for
    authenticated school-technician actions" per the task brief: JWT bearer
    auth (already the project default) plus a role check, mirroring
    ``core.permissions.IsSchoolAdmin``.
    """

    message = 'Only a school administrator or EduIgnite platform staff can perform this action.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return user.role in TECHNICIAN_ROLES or _platform_staff(user)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if _platform_staff(user):
            return True
        school_id = getattr(obj, 'school_id', None)
        return school_id is not None and school_id == user.school_id


def user_may_act_for_school(user, school_id) -> bool:
    """Shared check used inside views before touching a specific school's data."""
    if _platform_staff(user):
        return True
    return user.role in TECHNICIAN_ROLES and user.school_id == school_id

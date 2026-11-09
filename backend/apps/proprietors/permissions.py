from rest_framework.permissions import BasePermission

class IsFounderForProprietors(BasePermission):
    """Whoever the founders gave the ``proprietors`` module (CEO/CTO always hold it).

    The name is kept for the existing imports. Creating proprietors and linking
    schools to them is power over other schools' administrators, so it is an
    explicit, separately assignable module - holding ``schools`` does not imply it.
    """

    message = 'Your account has not been given access to proprietors.'

    def has_permission(self, request, view):
        from apps.users.executive_access import user_has_module

        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_drafted
            and user_has_module(user, 'proprietors')
        )


class IsProprietor(BasePermission):
    """An active PROPRIETOR who has already replaced the temporary password."""

    message = 'This area is for proprietor accounts.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.role == 'PROPRIETOR'):
            return False
        if not user.is_active or user.is_drafted or user.is_currently_suspended:
            return False
        if user.must_change_password:
            # Enforced here, not only in the UI: a temporary password must be
            # replaced before it can be used for anything.
            self.message = 'You must choose a new password before continuing.'
            return False
        return True

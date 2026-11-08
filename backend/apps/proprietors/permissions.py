from rest_framework.permissions import BasePermission

#: Who may create proprietors and link schools to them. Deliberately NOT every
#: executive with the schools module: this grants power over other schools'
#: administrators, so it stays with the two founders.
FOUNDER_ROLES = frozenset({'CEO', 'CTO'})


class IsFounderForProprietors(BasePermission):
    """CEO or CTO (who always hold the ``schools`` module). Everyone else: 403."""

    message = 'Only the CEO or CTO can manage proprietors.'

    def has_permission(self, request, view):
        from apps.users.executive_access import user_has_module

        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_drafted
            and user.role in FOUNDER_ROLES and user_has_module(user, 'schools')
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

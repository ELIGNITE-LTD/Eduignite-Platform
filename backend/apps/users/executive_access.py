"""Server-side enforcement of the executive modules a founder can assign.

CEO and CTO always have every module. The assignable executive roles
(``ASSIGNABLE_EXECUTIVE_ROLES``) hold only the module keys stored in
``User.allowed_modules`` (see ``executive_modules.py``). Everybody else holds
none. This mirrors ``canAccessModule`` in the frontend
(``apps/website/src/lib/executive-modules.ts``), so a tab that is visible is
backed by endpoints that answer, and a tab that is hidden is not reachable by
calling the API directly.
"""

from rest_framework.permissions import BasePermission

from .executive_modules import EXECUTIVE_MODULE_KEYS

ALWAYS_FULL_ACCESS_ROLES = frozenset({'CEO', 'CTO'})
ASSIGNABLE_EXECUTIVE_ROLES = frozenset({'SUPER_ADMIN', 'COO', 'INV', 'DESIGNER', 'SYSTEM_DEV'})


def _role(user) -> str:
    return str(getattr(user, 'role', '') or '').strip().upper()


def is_executive_user(user) -> bool:
    return bool(user and getattr(user, 'is_authenticated', False)) and (
        _role(user) in ALWAYS_FULL_ACCESS_ROLES or _role(user) in ASSIGNABLE_EXECUTIVE_ROLES
    )


def user_has_module(user, module: str) -> bool:
    """True when ``user`` may use the executive module ``module``."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    role = _role(user)
    if role in ALWAYS_FULL_ACCESS_ROLES:
        return True
    if role in ASSIGNABLE_EXECUTIVE_ROLES:
        allowed = getattr(user, 'allowed_modules', None)
        return isinstance(allowed, (list, tuple)) and module in allowed
    return False


def user_has_any_module(user, modules) -> bool:
    return any(user_has_module(user, m) for m in modules)


def executive_module_required(module: str, *, allow_non_executives: bool = False, also=(),
                              self_lookup_kwarg: str | None = None):
    """Build a DRF permission class gating an endpoint behind ``module``.

    * An executive passes iff ``user_has_module`` (``also`` lists further
      modules that unlock the same endpoint, for screens two modules share).
    * A non-executive is denied, unless ``allow_non_executives`` is set. That
      flag is for endpoints shared with school-level users: the permission then
      stays out of their way (neither widening nor narrowing their access), and
      the view must combine it with its own permission in ``get_permissions``
      so school users are still judged by the existing rules.
    * ``self_lookup_kwarg`` names the URL kwarg holding a user id; an executive
      acting on their own record (profile edits) is let through without the
      module.
    """
    modules = (module, *also)
    for key in modules:
        if key not in EXECUTIVE_MODULE_KEYS:
            raise ValueError(f'Unknown executive module: {key!r}')

    class ExecutiveModuleRequired(BasePermission):
        required_module = module
        required_modules = modules
        message = 'Your account has not been given access to this module.'

        def has_permission(self, request, view):
            user = getattr(request, 'user', None)
            if not user or not user.is_authenticated:
                return False
            if is_executive_user(user) or getattr(user, 'is_platform_executive', False):
                if self_lookup_kwarg and str(getattr(view, 'kwargs', {}).get(self_lookup_kwarg)) == str(user.pk):
                    return True
                return user_has_any_module(user, modules)
            return allow_non_executives

        def has_object_permission(self, request, view, obj):
            return self.has_permission(request, view)

    ExecutiveModuleRequired.__name__ = f'ExecutiveModuleRequired_{module}'
    ExecutiveModuleRequired.__qualname__ = ExecutiveModuleRequired.__name__
    return ExecutiveModuleRequired

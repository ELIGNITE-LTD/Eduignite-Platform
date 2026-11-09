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

from .executive_modules import EXECUTIVE_MODULE_KEYS, GENERAL_EXECUTIVE_ROUTES, modules_for_path
from .role_groups import EXECUTIVE_ROLES, FOUNDER_ROLES

# The founders hold every module. Every OTHER executive role (including any
# added to EXECUTIVE_ROLES later) holds exactly the modules assigned to the
# account, whatever its role label.
ALWAYS_FULL_ACCESS_ROLES = FOUNDER_ROLES
ASSIGNABLE_EXECUTIVE_ROLES = EXECUTIVE_ROLES - FOUNDER_ROLES


def _role(user) -> str:
    return str(getattr(user, 'role', '') or '').strip().upper()


def is_executive_user(user) -> bool:
    return bool(user and getattr(user, 'is_authenticated', False)) and (
        _role(user) in ALWAYS_FULL_ACCESS_ROLES or _role(user) in ASSIGNABLE_EXECUTIVE_ROLES
    )


def is_founder(user) -> bool:
    """CEO or CTO. Founder-only activities (see ``FounderOnly``) check this."""
    return bool(user and getattr(user, 'is_authenticated', False)) and _role(user) in ALWAYS_FULL_ACCESS_ROLES


class FounderOnly(BasePermission):
    """CEO / CTO only, however many modules an executive has been given."""

    message = 'Only the CEO or CTO can do this.'

    def has_permission(self, request, view):
        return is_founder(getattr(request, 'user', None))

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


def has_platform_school_access(user) -> bool:
    """May ``user`` work on any school (not only their own)? Founders, or an
    executive given the ``schools`` module."""
    return user_has_module(user, 'schools')


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


def executive_may_open_route(user, path: str) -> bool:
    """May ``user`` see/open the dashboard route ``path``?

    Founders and non-executives are not restricted here. Every other executive
    sees only the general tabs plus the routes of the modules assigned to them.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if _role(user) not in ASSIGNABLE_EXECUTIVE_ROLES:
        return True
    clean = path.split('?')[0].split('#')[0].rstrip('/') or '/'
    for general in GENERAL_EXECUTIVE_ROUTES:
        if clean == general or (general != '/dashboard' and clean.startswith(general + '/')):
            return True
    needed = modules_for_path(clean)
    return bool(needed) and user_has_any_module(user, needed)


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

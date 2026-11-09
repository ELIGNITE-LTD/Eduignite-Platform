"""Who may do what in Customer Care. Every check reads the database state per request.

* Founders (CEO and CTO, equal rights) always have access and see everything.
* Any other executive needs the executive module ``customer_care``
  (``User.allowed_modules``), granted by a founder. Revoking it blocks every
  endpoint on the next request; nothing is cached and nothing is deleted.
* An executive sees only conversations assigned to them, plus unassigned
  conversations in a customer group they are assigned to.
"""

from django.db.models import Q
from rest_framework.permissions import BasePermission

from apps.users.executive_access import executive_module_required, user_has_module

MODULE_KEY = 'customer_care'
FOUNDER_ROLES = frozenset({'CEO', 'CTO'})

# Standard executive-module permission: also what the executive activity log hooks into.
CustomerCareModule = executive_module_required(MODULE_KEY)


def is_founder(user) -> bool:
    return bool(user and getattr(user, 'is_authenticated', False)
                and str(getattr(user, 'role', '') or '').upper() in FOUNDER_ROLES)


def has_customer_care_access(user) -> bool:
    return bool(user and getattr(user, 'is_active', True) and user_has_module(user, MODULE_KEY))


class IsFounder(BasePermission):
    """CEO or CTO only (equal rights)."""

    message = 'Only the CEO or CTO can do this.'

    def has_permission(self, request, view):
        return is_founder(getattr(request, 'user', None))


def active_group_ids(user):
    from .models import GroupAssignment

    return GroupAssignment.objects.filter(
        executive=user, is_active=True, group__is_active=True).values_list('group_id', flat=True)


def visible_conversations(user, queryset=None):
    """Conversations ``user`` may see as staff. Empty for anyone without access."""
    from .models import Conversation

    qs = queryset if queryset is not None else Conversation.objects.all()
    if is_founder(user):
        return qs
    if not has_customer_care_access(user):
        return qs.none()
    return qs.filter(
        Q(assigned_to=user) | Q(assigned_to__isnull=True, group_id__in=list(active_group_ids(user)))
    )


def customer_conversations(user):
    """The customer's own conversations. Strictly their own data."""
    from .models import Conversation

    return Conversation.objects.filter(customer=user)

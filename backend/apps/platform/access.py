from decimal import Decimal, InvalidOperation

from .models import PlatformFees, PlatformSettings


EXECUTIVE_ROLES = {'SUPER_ADMIN', 'CEO', 'CTO', 'COO', 'INV', 'DESIGNER'}


def _to_decimal(value) -> Decimal:
    try:
        amount = Decimal(str(value if value is not None else '0'))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal('0')
    return amount if amount > Decimal('0') else Decimal('0')


def get_role_platform_fee(role: str | None) -> Decimal:
    if not role:
        return Decimal('0')
    normalized_role = str(role).upper()
    platform_fee = PlatformFees.objects.filter(role=normalized_role).values_list('amount', flat=True).first()
    if platform_fee is not None:
        return _to_decimal(platform_fee)

    settings = PlatformSettings.load()
    fees = settings.fees or {}
    return _to_decimal(fees.get(normalized_role) or fees.get(normalized_role.lower()))


def role_platform_charge_is_required(role: str | None) -> bool:
    normalized_role = str(role or '').upper()
    if normalized_role in EXECUTIVE_ROLES:
        return False
    return get_role_platform_fee(normalized_role) > Decimal('0')


def platform_charge_grace_active() -> bool:
    """True while platform-charge restrictions must NOT apply yet.

    Mirrors the frontend rule (``lib/license.ts``): access stays open until the
    founders' payment deadline actually passes. If no deadline is set, the grace
    period is open-ended (nothing is restricted). Once the deadline is past,
    unpaid users become restricted.
    """
    try:
        settings = PlatformSettings.load()
    except Exception:  # noqa: BLE001 — never let settings loading break access checks
        return True
    deadline = getattr(settings, 'payment_deadline', None)
    if not deadline:
        return True
    from django.utils import timezone

    return timezone.localdate() <= deadline


def platform_charge_restriction_active(role: str | None = 'STUDENT') -> bool:
    """Restrictions apply only when a fee is set for the role AND the deadline has passed."""
    return role_platform_charge_is_required(role) and not platform_charge_grace_active()


def user_platform_charge_is_paid(user) -> bool:
    if not user:
        return True
    # No fee for this role (e.g. fee is zero) or executive → never restricted.
    if not role_platform_charge_is_required(getattr(user, 'role', None)):
        return True
    # Still inside the grace window (before/at the deadline, or no deadline set).
    if platform_charge_grace_active():
        return True
    return bool(getattr(user, 'is_license_paid', False))


def student_platform_charge_is_paid(student) -> bool:
    return user_platform_charge_is_paid(getattr(student, 'user', None))


def filter_students_by_platform_access(queryset):
    if platform_charge_restriction_active('STUDENT'):
        # A learner without a login has no licence to pay for.
        from django.db.models import Q

        return queryset.filter(Q(user__isnull=True) | Q(user__is_license_paid=True))
    return queryset


def filter_student_related_by_platform_access(queryset, student_user_path='student__user'):
    if platform_charge_restriction_active('STUDENT'):
        from django.db.models import Q

        return queryset.filter(
            Q(**{f'{student_user_path}__isnull': True})
            | Q(**{f'{student_user_path}__is_license_paid': True})
        )
    return queryset


# --- School-level one-time subscription --------------------------------------
#
# A school can settle a single subscription that activates all of its users
# except parents. The founders own the status; the school admin can pay to move
# it to 'paid'. This gates login for the school's non-parent members, so it is
# written to fail *open* — any doubt resolves to "allowed" — because wrongly
# locking a paying school out of its own account is far worse than briefly
# letting an unpaid one in.

def school_subscription_state(school) -> str:
    """The effective state of a school's subscription: free, paid or unpaid.

    The subscription is yearly. A 'paid' school whose expiry has passed, or a
    'free' school whose free period has elapsed, is treated as unpaid — either
    way it must renew.
    """
    if school is None:
        return 'free'
    status = getattr(school, 'subscription_status', 'free') or 'free'
    from django.utils import timezone

    today = timezone.localdate()
    if status == 'paid':
        expires = getattr(school, 'subscription_expires_on', None)
        if expires is not None and today > expires:
            return 'unpaid'
    elif status == 'free':
        free_until = getattr(school, 'subscription_free_until', None)
        if free_until is not None and today > free_until:
            return 'unpaid'
    return status


def school_access_allowed(school) -> bool:
    """Whether a school's users may use the platform, subscription-wise."""
    return school_subscription_state(school) in ('free', 'paid')


# Roles that keep access even when their school is unpaid. School admins must,
# or the person who has to settle the subscription could not even sign in to do
# it. Parents follow their own rules; executives run the platform.
SCHOOL_SUBSCRIPTION_EXEMPT = EXECUTIVE_ROLES | {'PARENT', 'SCHOOL_ADMIN', 'SUB_ADMIN'}


def user_school_access_blocked(user) -> bool:
    """Whether this user must be turned away because their school has not paid.

    A school administrator is never blocked here — they need to get in to pay.
    Everyone else at an unpaid school is blocked until the subscription is
    settled or a founder changes the status.
    """
    if user is None:
        return False
    role = str(getattr(user, 'role', '') or '').upper()
    if role in SCHOOL_SUBSCRIPTION_EXEMPT:
        return False
    school = getattr(user, 'school', None)
    if school is None:
        return False
    return not school_access_allowed(school)

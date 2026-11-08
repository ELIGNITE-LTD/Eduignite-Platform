"""Business rules for proprietor accounts. Views stay thin; every rule is here.

Security notes
--------------
* A proprietor reaches a school ONLY through a ``ProprietorSchoolLink`` made by
  a CEO/CTO. ``linked_schools`` is the single place that expresses that and
  every proprietor query starts from it.
* The credential reset re-verifies the proprietor's OWN matricule and password
  server-side on every call. Failures are stored (``ProprietorActionLog``) and
  counted from the database, so the lockout is shared by all workers.
* Nothing here ever stores or returns a password except the one-time temporary
  password handed to a founder at creation / re-issue.
"""

import hmac
import logging
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.users.matricules import generate_founder_matricule

from .models import ProprietorActionLog, ProprietorSchoolLink

User = get_user_model()
logger = logging.getLogger(__name__)

#: Roles of a school's administrators: the only accounts a proprietor may touch.
ADMIN_ROLES = ('SCHOOL_ADMIN', 'SUB_ADMIN')
MAX_LINKED_SCHOOLS = 300

REAUTH_MAX_FAILURES = 5
REAUTH_MAX_FAILURES_PER_IP = 20
REAUTH_WINDOW = timedelta(minutes=15)
#: The marker written for never-activated accounts; it must never work as a password.
PENDING_ACTIVATION_MARKER = '!pending_activation'

GENERIC_REAUTH_MESSAGE = 'We could not verify your identity. Check your matricule and password.'


class ServiceError(Exception):
    """A rule was broken. ``errors`` maps field -> list of messages."""

    def __init__(self, message, errors=None, code='validation_error'):
        super().__init__(message)
        self.message = message
        self.errors = errors or {}
        self.code = code


def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip() or None
    return request.META.get('REMOTE_ADDR') or None


def audit(action, *, actor=None, proprietor=None, school=None, target_user=None, ip=None, detail=''):
    return ProprietorActionLog.objects.create(
        actor=actor, proprietor=proprietor, school=school, target_user=target_user,
        action=action, ip_address=ip, detail=(detail or '')[:500],
    )


def temporary_password() -> str:
    # Unambiguous characters so it can be read aloud or copied by hand; same
    # convention as the principal's student password reset.
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    return 'EI-' + ''.join(secrets.choice(alphabet) for _ in range(10))


# -- scoping ---------------------------------------------------------------


def linked_schools(proprietor):
    """Schools linked to ``proprietor`` that are live (not drafted). THE scope."""
    from apps.schools.models import School

    return School.objects.filter(
        proprietor_links__proprietor_id=proprietor.pk, is_drafted=False,
    )


def linked_school_ids(proprietor) -> list:
    return list(linked_schools(proprietor).values_list('id', flat=True))


def get_linked_school(proprietor, school_id):
    """The school if it is linked to ``proprietor``, else None (same for 'unknown')."""
    return linked_schools(proprietor).filter(pk=school_id).first()


def eligible_admins(school):
    """The only accounts of ``school`` a proprietor may see / reset."""
    return (
        User.objects.filter(
            school_id=school.pk, role__in=ADMIN_ROLES, is_drafted=False, is_teacher_twin=False,
        )
        .select_related('school')
        .order_by('role', 'name')
    )


# -- founder side ----------------------------------------------------------


def create_proprietor(*, actor, name, email, phone, ip=None):
    """Create a PROPRIETOR. Returns ``(user, temporary_password)``."""
    for _ in range(5):
        try:
            with transaction.atomic():
                password = temporary_password()
                user = User.objects.create_user(
                    matricule=generate_founder_matricule('PROPRIETOR'),
                    name=name, email=email, role='PROPRIETOR', phone=phone or None,
                    password=password, must_change_password=True, is_active=True,
                    # No per-user licence fee applies to this role.
                    is_license_paid=True,
                )
                audit(ProprietorActionLog.ACTION_CREATED, actor=actor, proprietor=user, ip=ip,
                      detail=f'created by {actor.matricule}')
            return user, password
        except IntegrityError:
            if User.objects.filter(email__iexact=email).exists():
                raise ServiceError('Invalid input.', {'email': ['This email is already in the system.']})
            continue  # matricule race: generate the next one
    raise ServiceError('Could not allocate a matricule. Please retry.', code='conflict')


def reissue_password(*, actor, proprietor, ip=None):
    password = temporary_password()
    with transaction.atomic():
        proprietor = User.objects.select_for_update().get(pk=proprietor.pk)
        proprietor.set_password(password)
        proprietor.must_change_password = True
        proprietor.sessions_valid_after = timezone.now()
        proprietor.save(update_fields=['password', 'must_change_password', 'sessions_valid_after'])
        audit(ProprietorActionLog.ACTION_PASSWORD_ISSUED, actor=actor, proprietor=proprietor, ip=ip,
              detail='temporary password re-issued')
    return password


def update_proprietor(*, actor, proprietor, data, ip=None):
    changed = []
    with transaction.atomic():
        proprietor = User.objects.select_for_update().get(pk=proprietor.pk)
        if 'email' in data and data['email'].lower() != proprietor.email.lower():
            if User.objects.filter(email__iexact=data['email']).exclude(pk=proprietor.pk).exists():
                raise ServiceError('Invalid input.', {'email': ['This email is already in the system.']})
            proprietor.email = data['email']
            changed.append('email')
        if 'name' in data and data['name'] != proprietor.name:
            proprietor.name = data['name']
            changed.append('name')
        if 'phone' in data and (data['phone'] or None) != proprietor.phone:
            proprietor.phone = data['phone'] or None
            changed.append('phone')
        if 'is_active' in data and bool(data['is_active']) != proprietor.is_active:
            proprietor.is_active = bool(data['is_active'])
            if not proprietor.is_active:
                proprietor.sessions_valid_after = timezone.now()
            changed.append('activated' if proprietor.is_active else 'deactivated')
        if changed:
            proprietor.save()
            action = ProprietorActionLog.ACTION_UPDATED
            if changed == ['deactivated']:
                action = ProprietorActionLog.ACTION_DEACTIVATED
            elif changed == ['activated']:
                action = ProprietorActionLog.ACTION_ACTIVATED
            audit(action, actor=actor, proprietor=proprietor, ip=ip, detail='changed: ' + ', '.join(changed))
    return proprietor, changed


def set_linked_schools(*, actor, proprietor, school_ids, ip=None):
    """REPLACE the proprietor's linked set with exactly ``school_ids``, atomically.

    Idempotent. Validates every id before changing anything. Returns
    ``(added_ids, removed_ids)``.
    """
    from apps.schools.models import School

    wanted = []
    for raw in school_ids:
        sid = str(raw).strip()
        if sid and sid not in wanted:
            wanted.append(sid)
    if len(wanted) > MAX_LINKED_SCHOOLS:
        raise ServiceError('Too many schools.', {'school_ids': [f'At most {MAX_LINKED_SCHOOLS} schools.']})

    with transaction.atomic():
        # Serialise concurrent replacements for the same proprietor.
        locked = User.objects.select_for_update().get(pk=proprietor.pk, role='PROPRIETOR')
        found = set(School.objects.filter(pk__in=wanted, is_drafted=False).values_list('id', flat=True))
        missing = [sid for sid in wanted if sid not in found]
        if missing:
            raise ServiceError(
                'Invalid input.',
                {'school_ids': [f'Unknown or unavailable school: {", ".join(missing[:10])}']},
            )
        current = set(ProprietorSchoolLink.objects.filter(proprietor=locked).values_list('school_id', flat=True))
        target = set(wanted)
        removed = sorted(current - target)
        added = sorted(target - current)
        if removed:
            ProprietorSchoolLink.objects.filter(proprietor=locked, school_id__in=removed).delete()
        if added:
            ProprietorSchoolLink.objects.bulk_create(
                [ProprietorSchoolLink(proprietor=locked, school_id=sid, created_by=actor) for sid in added],
                ignore_conflicts=True,
            )
        if added or removed:
            audit(ProprietorActionLog.ACTION_SCHOOLS_SET, actor=actor, proprietor=locked, ip=ip,
                  detail=f'added={",".join(added)[:200]} removed={",".join(removed)[:200]}')
    return added, removed


# -- proprietor side: credential reset --------------------------------------


def reauth_locked(user, ip) -> bool:
    """True when too many recent failed re-authentications (per account or per IP)."""
    since = timezone.now() - REAUTH_WINDOW
    failures = ProprietorActionLog.objects.filter(
        action=ProprietorActionLog.ACTION_REAUTH_FAILED, created_at__gte=since,
    )
    if failures.filter(proprietor=user).count() >= REAUTH_MAX_FAILURES:
        return True
    return bool(ip) and failures.filter(ip_address=ip).count() >= REAUTH_MAX_FAILURES_PER_IP


def verify_own_credentials(user, matricule, password) -> bool:
    """Check the proprietor's OWN matricule + password the way login does.

    The password hash is always checked (even when the matricule is wrong) and
    the matricule is compared in constant time, so neither the timing nor the
    answer says which of the two was wrong.
    """
    password_ok = user.check_password(password or '') and password != PENDING_ACTIVATION_MARKER
    submitted = (matricule or '').strip().encode()
    matricule_ok = hmac.compare_digest(submitted, (user.matricule or '').encode())
    return bool(password_ok and matricule_ok)


def validate_new_credentials(target, *, new_password, email=None, phone=None):
    """Field errors for a prospective change, as ``{field: [messages]}`` (empty = fine)."""
    errors = {}
    try:
        validate_password(new_password, user=target)
    except DjangoValidationError as exc:
        errors['new_password'] = list(exc.messages)
    if email is not None and email.lower() != target.email.lower():
        if User.objects.filter(email__iexact=email).exclude(pk=target.pk).exists():
            errors['email'] = ['This email is already in the system.']
    return errors


def reset_admin_credentials(*, proprietor, school, target, new_password, email=None, phone=None,
                            is_active=None, require_password_change=True, ip=None):
    """Apply the change. Returns ``(log_row, changed_fields, notify_addresses)``.

    The caller has already authorised everything; this re-checks that the target
    is still an eligible admin of ``school`` under a row lock.
    """
    with transaction.atomic():
        locked = User.objects.select_for_update().filter(
            pk=target.pk, school_id=school.pk, role__in=ADMIN_ROLES, is_drafted=False, is_teacher_twin=False,
        ).first()
        if locked is None:
            raise ServiceError('Not found.', code='not_found')
        old_email = locked.email
        changed = ['password']
        locked.set_password(new_password)
        locked.must_change_password = bool(require_password_change)
        # Every token issued before now (access and refresh) stops working.
        locked.sessions_valid_after = timezone.now()
        fields = ['password', 'must_change_password', 'sessions_valid_after']
        if email is not None and email.lower() != old_email.lower():
            locked.email = email
            fields.append('email')
            changed.append('email')
        if phone is not None and (phone or None) != locked.phone:
            locked.phone = phone or None
            fields.append('phone')
            changed.append('phone')
        if is_active is not None and bool(is_active) != locked.is_active:
            locked.is_active = bool(is_active)
            fields.append('is_active')
            changed.append('activated' if locked.is_active else 'deactivated')
        locked.save(update_fields=fields)
        log = audit(
            ProprietorActionLog.ACTION_CREDENTIALS_RESET, actor=proprietor, proprietor=proprietor,
            school=school, target_user=locked, ip=ip, detail='changed: ' + ', '.join(changed),
        )
        addresses = [locked.email]
        if 'email' in changed:
            addresses.append(old_email)  # the previous owner of the address is told too
    return log, changed, addresses, locked

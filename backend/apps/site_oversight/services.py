"""Block / unblock and the audit timeline for school public websites.

Blocking keeps the site's previous ``publication_status`` on the case so an
unblock puts the site back exactly as it was (published goes live again, a
draft stays a draft). While blocked the profile is ``unpublished`` (so the
public pages answer 404 through the existing queries) and ``locked_by_founder``
is set (so the school administrator cannot publish).
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from apps.platform.api import department_label
from apps.schools import public_site_services as site_svc
from apps.schools.models import PublicationStatus, SchoolPublicProfile

from .models import CaseState, OversightAction, SiteOversightCase, SiteOversightEvent

REASON_MIN = 10
REASON_MAX = 1000


class Conflict(APIException):
    status_code = 409
    default_detail = 'This action is not possible in the current state.'
    default_code = 'conflict'


def clean_reason(value, field='reason', required=True):
    """Plain text, 10 to 1000 characters. Raises a 400 naming ``field``."""
    text = site_svc.clean_text(value)
    if not text and not required:
        return ''
    if len(text) < REASON_MIN:
        raise ValidationError({field: f'Give at least {REASON_MIN} characters.'})
    if len(text) > REASON_MAX:
        raise ValidationError({field: f'Maximum {REASON_MAX} characters.'})
    return text


def _actor(user):
    role = str(getattr(user, 'role', '') or '')
    return {
        'actor': user if getattr(user, 'pk', None) else None,
        'actor_name': (getattr(user, 'name', '') or str(user))[:200],
        'actor_role': role[:32],
        'actor_department': department_label(role)[:80],
    }


def open_case(school):
    return SiteOversightCase.objects.filter(school=school, state=CaseState.OPEN).first()


def is_blocked(school):
    profile = SchoolPublicProfile.objects.filter(school=school).only('locked_by_founder').first()
    return bool(profile and profile.locked_by_founder)


def _event(school, case, action, reason, steps, user):
    return SiteOversightEvent.objects.create(
        school=school, case=case, action=action, reason=reason, resolution_steps=steps or '', **_actor(user))


def _locked_profile(school):
    site_svc.get_profile(school)
    return SchoolPublicProfile.objects.select_for_update().get(school=school)


@transaction.atomic
def block(school, user, request, reason, steps):
    reason = clean_reason(reason)
    steps = clean_reason(steps, 'resolution_steps')
    profile = _locked_profile(school)
    if profile.locked_by_founder or open_case(school):
        raise Conflict('This website is already blocked.')
    previous = profile.publication_status
    actor = _actor(user)
    case = SiteOversightCase.objects.create(
        school=school, previous_status=previous, block_reason=reason, resolution_steps=steps,
        blocked_by=actor['actor'], blocked_by_name=actor['actor_name'],
        blocked_by_role=actor['actor_role'], blocked_by_department=actor['actor_department'])
    profile.locked_by_founder = True
    profile.publication_status = PublicationStatus.UNPUBLISHED
    profile.updated_by = user
    profile.save()
    site_svc.write_audit(school, request, 'force_unpublished', {
        'publication_status': {'before': previous, 'after': PublicationStatus.UNPUBLISHED},
        'reason': {'before': '', 'after': reason[:120]}})
    event = _event(school, case, OversightAction.BLOCK, reason, steps, user)
    _notify(event, case)
    return case, event


@transaction.atomic
def unblock(school, user, request, reason):
    reason = clean_reason(reason)
    profile = _locked_profile(school)
    case = open_case(school)
    if not profile.locked_by_founder and not case:
        raise Conflict('This website is not blocked.')
    previous = case.previous_status if case else PublicationStatus.UNPUBLISHED
    before = profile.publication_status
    profile.locked_by_founder = False
    profile.publication_status = previous
    if previous == PublicationStatus.PUBLISHED and not profile.published_at:
        profile.published_at = timezone.now()
    profile.updated_by = user
    profile.save()
    if case:
        actor = _actor(user)
        case.state = CaseState.RESOLVED
        case.unblocked_at = timezone.now()
        case.unblocked_by = actor['actor']
        case.unblocked_by_name = actor['actor_name']
        case.unblock_reason = reason
        case.restored_status = previous
        case.save()
    site_svc.write_audit(school, request, 'publication_unlocked', {
        'publication_status': {'before': before, 'after': previous},
        'reason': {'before': '', 'after': reason[:120]}})
    event = _event(school, case, OversightAction.UNBLOCK, reason, '', user)
    _notify(event, case)
    return case, event


@transaction.atomic
def update_steps(school, user, request, reason, steps):
    reason = clean_reason(reason)
    steps = clean_reason(steps, 'resolution_steps')
    _locked_profile(school)
    case = open_case(school)
    if not case:
        raise Conflict('This website is not blocked, so there is nothing to update.')
    case.resolution_steps = steps
    case.save(update_fields=['resolution_steps'])
    event = _event(school, case, OversightAction.STEPS_UPDATED, reason, steps, user)
    _notify(event, case)
    return case, event


def log_staff_action(school, user, action, reason, *, notify=True):
    """Record an executive edit / content deletion with its reason."""
    reason = clean_reason(reason)
    case = open_case(school)
    event = _event(school, case, action, reason, '', user)
    if notify:
        _notify(event, case)
    return event


@transaction.atomic
def staff_set_publication(school, user, request, reason, publish):
    """Executive publish / unpublish with a reason. Not allowed while blocked."""
    reason = clean_reason(reason)
    profile = _locked_profile(school)
    if profile.locked_by_founder:
        raise Conflict('This website is blocked. Unblock it first.')
    if publish:
        errors = site_svc.publish_errors(school)
        if errors:
            raise ValidationError({'detail': 'The site cannot be published yet.', 'errors': errors})
        site_svc.set_status(profile, PublicationStatus.PUBLISHED, request, 'published', user)
        action = OversightAction.PUBLISH
    else:
        site_svc.set_status(profile, PublicationStatus.UNPUBLISHED, request, 'unpublished', user)
        action = OversightAction.UNPUBLISH
    event = _event(school, None, action, reason, '', user)
    _notify(event, None)
    return profile, event


def serialize_event(event):
    return {
        'id': str(event.id), 'action': event.action, 'reason': event.reason,
        'resolution_steps': event.resolution_steps, 'actor_name': event.actor_name,
        'actor_role': event.actor_role, 'actor_department': event.actor_department,
        'created_at': event.created_at,
    }


def serialize_case(case):
    if case is None:
        return None
    return {
        'id': str(case.id), 'state': case.state, 'previous_status': case.previous_status,
        'block_reason': case.block_reason, 'resolution_steps': case.resolution_steps,
        'blocked_at': case.blocked_at, 'blocked_by_name': case.blocked_by_name,
        'blocked_by_department': case.blocked_by_department,
        'unblocked_at': case.unblocked_at, 'unblocked_by_name': case.unblocked_by_name,
        'unblock_reason': case.unblock_reason, 'restored_status': case.restored_status,
        'migrated': case.migrated,
    }


def timeline(school, limit=200):
    rows = SiteOversightEvent.objects.filter(school=school).order_by('-created_at')[:limit]
    return [serialize_event(e) for e in rows]


def _notify(event, case):
    from .notifications import notify_school_admins
    notify_school_admins(event, case)

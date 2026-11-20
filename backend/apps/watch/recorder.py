"""Where every sensor reports. ``record`` groups a problem with its earlier occurrences and decides whether the
founders must be told now.

It is built to be called from anywhere, including the middle of a failing request, so it never raises and never waits
on anything slow: the email goes out through the background queue (or a thread if the queue itself is the problem).
"""

from __future__ import annotations

import hashlib
import logging

from django.db import transaction
from django.utils import timezone

from . import counters
from .models import WatchIncident
from .sanitize import clean_details, clean_text

logger = logging.getLogger(__name__)

MAX_USERS = 100
MAX_SCHOOLS = 50
REOPEN_WINDOW_HOURS = 24


def fingerprint_of(*parts) -> str:
    return hashlib.sha1('|'.join(str(p) for p in parts).encode()).hexdigest()


def _bigger(a: str, b: str) -> str:
    return a if WatchIncident.RANK[a] >= WatchIncident.RANK[b] else b


def record(category, title, *, message='', severity='warning', source='api', fingerprint=None, user=None, school=None,
           details=None, escalate_after=None, alert=True):
    """Record one occurrence of a problem. Returns the incident, or None when recording itself failed.

    ``escalate_after`` = (count, window_minutes, distinct_users, distinct_schools): the problem becomes critical when
    it happens that often (the first number), or reaches that many people or schools.
    """
    try:
        return _record(category, title, message, severity, source, fingerprint, user, school, details, escalate_after, alert)
    except Exception:  # noqa: BLE001 - never turn a monitoring failure into the user's failure
        logger.exception('Watch: could not record "%s"', title)
        return None


def _school_of(user, school):
    school = school or getattr(user, 'school', None)
    return school if getattr(school, 'pk', None) else None


@transaction.atomic
def _record(category, title, message, severity, source, fingerprint, user, school, details, escalate_after, alert):
    now = timezone.now()
    school = _school_of(user, school)
    fingerprint = fingerprint or fingerprint_of(category, title)
    incident = (WatchIncident.objects.select_for_update()
                .filter(fingerprint=fingerprint).order_by('-last_seen').first())
    created = reopened = False
    previous_severity = None
    if incident is not None and incident.status in ('resolved',) and incident.resolved_at \
            and (now - incident.resolved_at).total_seconds() < REOPEN_WINDOW_HOURS * 3600:
        incident.status, incident.resolved_at, reopened = 'open', None, True
        incident.notes = (incident.notes or []) + [{'at': now.isoformat(), 'by': 'system', 'text': 'It happened again, so this was reopened.'}]
    if incident is None or incident.status == 'resolved':
        incident = WatchIncident(
            fingerprint=fingerprint, category=category, severity=severity, source=source or '', title=clean_text(title, 200),
            message=clean_text(message, 1500), details=clean_details(details or {}), last_seen=now, count=0,
        )
        created = True
    else:
        previous_severity = incident.severity
    if incident.status == 'ignored':
        # Ignored problems keep counting quietly; nobody is told.
        incident.count += 1
        incident.last_seen = now
        incident.save(update_fields=['count', 'last_seen'])
        return incident

    incident.count += 1
    incident.last_seen = now
    incident.severity = _bigger(incident.severity, severity)
    if details and not created:
        incident.details = {**incident.details, **clean_details(details)}
    if message and not created:
        incident.message = clean_text(message, 1500)
    if user is not None and getattr(user, 'pk', None):
        ids = incident.user_ids or []
        if str(user.pk) not in ids and len(ids) < MAX_USERS:
            ids.append(str(user.pk))
            incident.user_ids = ids
        incident.affected_users = max(incident.affected_users, len(ids))
    if school is not None:
        schools = incident.affected_schools or []
        if all(s.get('id') != str(school.pk) for s in schools) and len(schools) < MAX_SCHOOLS:
            schools.append({'id': str(school.pk), 'name': clean_text(getattr(school, 'name', ''), 80)})
            incident.affected_schools = schools
        if not incident.school_id:
            incident.school, incident.school_name = school, clean_text(getattr(school, 'name', ''), 200)

    # Escalation: the same problem, often enough or widely enough, stops being a warning.
    if escalate_after and incident.severity != 'critical':
        count, minutes, users, schools = escalate_after
        key_kind = f'inc:{fingerprint}'
        recent = _window_count(key_kind, minutes)
        if (count and recent >= count) or (users and incident.affected_users >= users) or (schools and len(incident.affected_schools or []) >= schools):
            incident.severity = 'critical'
    incident.save()
    if alert:
        from .alerts import maybe_alert

        maybe_alert(incident, created=created, reopened=reopened, previous_severity=previous_severity)
    return incident


def _window_count(kind: str, minutes: int) -> int:
    """Occurrences of one problem inside a sliding window, counted in the cache."""
    from django.core.cache import cache

    try:
        key = f'watch:win:{kind}'
        now = timezone.now().timestamp()
        stamps = [t for t in (cache.get(key) or []) if now - t < minutes * 60]
        stamps.append(now)
        cache.set(key, stamps[-500:], minutes * 60 + 60)
        return len(stamps)
    except Exception:  # noqa: BLE001
        return 0


def resolve(fingerprint, *, note='It recovered by itself.', notify=True):
    """Close the open incident with this fingerprint (a health check that went green again)."""
    incident = WatchIncident.objects.filter(fingerprint=fingerprint, status__in=('open', 'acknowledged')).first()
    if incident is None:
        return None
    incident.status, incident.resolved_at = 'resolved', timezone.now()
    incident.notes = (incident.notes or []) + [{'at': incident.resolved_at.isoformat(), 'by': 'system', 'text': note}]
    incident.save(update_fields=['status', 'resolved_at', 'notes'])
    if notify and incident.severity == 'critical' and incident.alert_count:
        from .alerts import send_recovery

        send_recovery(incident)
    return incident

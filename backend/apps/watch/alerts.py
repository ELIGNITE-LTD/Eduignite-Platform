"""Telling the founders. Urgent problems email both the CEO and the CTO the moment they are found.

Three rules keep the inbox useful instead of noisy: the same problem is emailed once and then again only if it gets
much worse or after a cooldown; at most a fixed number of alert emails go out per hour (the rest are summarised in
one message); and when a critical problem fixes itself the founders are told that too.
"""

from __future__ import annotations

import logging
import threading
from html import escape

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .models import WatchAlertLog, WatchIncident

logger = logging.getLogger(__name__)

COOLDOWN_MINUTES = 60
WORSE_FACTOR = 5                     # re-alert earlier when the count has grown this many times since the last alert
MAX_ALERTS_PER_HOUR = 15

GUIDE = {
    'server': 'Open the incident for the failing route and the last lines of the error. Check the latest deploy first: a '
              'new release is the most common cause. The backend log on the server has the full trace.',
    'client': 'Many devices report the same error, which usually means a broken release or a script that failed to load. '
              'Check the web and app builds that went out most recently.',
    'security': 'Look at the sign-in details in the incident. If an executive or school administrator account is involved, '
                'reset that password and sign out its sessions from the Staff page.',
    'health': 'A part of the system itself is failing. Check the server (disk, memory, database and cache services) and '
              'the worker process; the Health panel shows which check failed and since when.',
    'payments': 'Payments are failing for several people. Check the payment provider status and the callback logs before '
                'schools notice.',
    'ai': 'The AI provider is failing for many requests. Check the provider status page and the API key balance. '
          'Credits are refunded automatically for failed work.',
    'email': 'Emails are not leaving the system. Check the email provider account (key, quota, sender) in Settings.',
    'jobs': 'A background job keeps failing or is stuck. Check the worker log; stuck marking jobs and credit holds are '
            'released automatically after a while.',
    'traffic': 'Errors are unusually high compared with the traffic. Check the server and the latest deploy.',
}


def recipients() -> list[dict]:
    """The CEO and CTO (and any extra addresses in WATCH_ALERT_EXTRA_EMAILS) who can actually receive email."""
    from apps.users.models import User
    from core.email_service import _is_deliverable_email

    people, seen = [], set()
    for user in User.objects.filter(role__in=('CEO', 'CTO'), is_active=True, is_suspended=False).order_by('role', 'name'):
        email = (user.email or '').strip().lower()
        if email and email not in seen and _is_deliverable_email(email):
            seen.add(email)
            people.append({'name': user.name, 'email': email, 'role': user.role, 'user': user})
    for email in getattr(settings, 'WATCH_ALERT_EXTRA_EMAILS', []) or []:
        email = str(email).strip().lower()
        if email and email not in seen and _is_deliverable_email(email):
            seen.add(email)
            people.append({'name': 'EduIgnite team', 'email': email, 'role': '', 'user': None})
    return people


def _under_hourly_cap() -> bool:
    try:
        key = f'watch:alerts:{timezone.now().strftime("%Y%m%d%H")}'
        cache.add(key, 0, 4000)
        return cache.incr(key) <= MAX_ALERTS_PER_HOUR
    except Exception:  # noqa: BLE001
        return True


def maybe_alert(incident: WatchIncident, *, created: bool, reopened: bool, previous_severity):
    """Decide whether this occurrence must reach the founders now, and send it in the background if so."""
    if incident.status == 'ignored' or incident.severity != 'critical':
        return None
    now = timezone.now()
    escalated = previous_severity is not None and previous_severity != 'critical'
    if created or escalated or reopened:
        kind = 'critical' if created else ('escalation' if escalated else 'recurrence')
    else:
        # Same problem, already told: again only if it got much worse or the cooldown passed with it still going.
        if not incident.last_alerted_at:
            kind = 'critical'
        else:
            quiet = (now - incident.last_alerted_at).total_seconds() / 60
            worse = incident.count >= max(incident.last_alerted_count, 1) * WORSE_FACTOR
            if incident.status == 'acknowledged' and not worse:
                return None
            if not (worse or quiet >= COOLDOWN_MINUTES * 6 or (quiet >= COOLDOWN_MINUTES and incident.count > incident.last_alerted_count)):
                return None
            kind = 'escalation' if worse else 'recurrence'
    if not _under_hourly_cap():
        logger.warning('Watch: alert cap reached, "%s" will be in the next summary', incident.title)
        return None
    WatchIncident.objects.filter(pk=incident.pk).update(last_alerted_at=now, last_alerted_count=incident.count, alert_count=incident.alert_count + 1)
    dispatch(str(incident.pk), kind)
    return kind


def dispatch(incident_id: str, kind: str):
    """Send through the background queue; if the queue is the very thing that is down, send from a thread instead."""
    try:
        from .tasks import send_alert_task

        if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
            send_alert_task(incident_id, kind)
            return
        send_alert_task.apply_async(args=[incident_id, kind], retry=False, ignore_result=True)
    except Exception:  # noqa: BLE001
        threading.Thread(target=send_incident_email, args=(incident_id, kind), daemon=True).start()


def _facts(incident: WatchIncident) -> list[tuple[str, str]]:
    schools = ', '.join(s.get('name') or s.get('id', '') for s in (incident.affected_schools or [])[:5])
    if len(incident.affected_schools or []) > 5:
        schools += f' and {len(incident.affected_schools) - 5} more'
    rows = [
        ('Area', dict(WatchIncident.CATEGORIES).get(incident.category, incident.category)),
        ('Happened', f'{incident.count} time{"s" if incident.count != 1 else ""} since {timezone.localtime(incident.first_seen).strftime("%d %b %H:%M")}'),
        ('Last seen', timezone.localtime(incident.last_seen).strftime('%d %b %Y, %H:%M')),
    ]
    if incident.affected_users:
        rows.append(('People affected', str(incident.affected_users)))
    if schools:
        rows.append(('Schools affected', schools))
    for key, label in (('route', 'Where'), ('app', 'App'), ('check', 'Check'), ('exception', 'Error')):
        value = (incident.details or {}).get(key)
        if value:
            rows.append((label, str(value)[:200]))
    return rows


def _body(incident: WatchIncident, intro: str) -> tuple[str, str]:
    from core.email_service import _button, _front_end_url

    rows = ''.join(
        f'<tr><td style="padding:8px 12px;border-bottom:1px solid #e6eef5;color:#60748b;font-size:13px;width:150px;">{escape(k)}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #e6eef5;font-size:14px;font-weight:700;">{escape(v)}</td></tr>'
        for k, v in _facts(incident))
    link = _front_end_url(f'dashboard/system-watch?incident={incident.pk}')
    guide = GUIDE.get(incident.category, '')
    html = (
        f'<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">{escape(intro)}</p>'
        f'<p style="font-size:17px;font-weight:800;margin:0 0 6px;">{escape(incident.title)}</p>'
        f'<p style="font-size:14px;line-height:1.6;color:#334a63;margin:0 0 16px;">{escape(incident.message or "")}</p>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6eef5;border-radius:12px;margin-bottom:18px;">{rows}</table>'
        + (f'<p style="font-size:13px;line-height:1.6;color:#334a63;margin:0 0 18px;"><b>Where to start:</b> {escape(guide)}</p>' if guide else '')
        + _button('Open in System Watch', link, '#b42318' if incident.severity == 'critical' else '#0b3a73'))
    text = f'{intro}\n\n{incident.title}\n{incident.message}\n\n' + '\n'.join(f'{k}: {v}' for k, v in _facts(incident)) + f'\n\nOpen: {link}\n'
    return html, text


def send_incident_email(incident_id: str, kind: str = 'critical') -> int:
    """Email the incident to every founder. Returns how many emails the provider accepted."""
    from core.email_service import EmailEvent, _layout, send_transactional_email

    incident = WatchIncident.objects.filter(pk=incident_id).first()
    if incident is None:
        return 0
    people = recipients()
    intros = {
        'critical': 'The system found a problem that needs attention now. Nobody had to report it.',
        'escalation': 'A problem has got worse and now needs attention now.',
        'recurrence': 'A problem that was already reported is still happening.',
        'test': 'This is a test alert from Security & System Watch. If you can read it, alerts reach you.',
    }
    prefix = {'critical': 'CRITICAL', 'escalation': 'WORSE', 'recurrence': 'STILL HAPPENING', 'test': 'TEST'}.get(kind, 'ALERT')
    subject = f'[EduIgnite {prefix}] {incident.title}'[:240]
    inner, text = _body(incident, intros.get(kind, intros['critical']))
    html = _layout(f'{prefix.title()}: {incident.title}'[:90], incident.title, inner, 'EduIgnite · Security & System Watch', '#7a1f16' if kind != 'test' else '#0b3a73')
    delivered = 0
    for person in people:
        try:
            if send_transactional_email(event=EmailEvent.SYSTEM_ALERT, to_email=person['email'], to_name=person['name'], subject=subject, html=html, text=text):
                delivered += 1
        except Exception:  # noqa: BLE001
            logger.exception('Watch: alert email to %s failed', person['email'])
    _log(incident, kind, subject, people, delivered)
    if delivered == 0:
        logger.error('Watch: NO alert email could be delivered for "%s" (recipients: %d)', incident.title, len(people))
    return delivered


def send_recovery(incident: WatchIncident) -> int:
    from core.email_service import EmailEvent, _layout, send_transactional_email

    people = recipients()
    inner, text = _body(incident, 'A critical problem has recovered by itself. No action is needed, but it may be worth a look.')
    subject = f'[EduIgnite RECOVERED] {incident.title}'[:240]
    html = _layout(f'Recovered: {incident.title}'[:90], incident.title, inner, 'EduIgnite · Security & System Watch', '#0b6b3a')
    delivered = 0
    for person in people:
        try:
            if send_transactional_email(event=EmailEvent.SYSTEM_ALERT, to_email=person['email'], to_name=person['name'], subject=subject, html=html, text=text):
                delivered += 1
        except Exception:  # noqa: BLE001
            logger.exception('Watch: recovery email failed')
    _log(incident, 'recovery', subject, people, delivered)
    return delivered


def send_digest() -> int:
    """One morning email listing what is still open at warning level, so nothing quiet is forgotten."""
    from core.email_service import EmailEvent, _button, _front_end_url, _layout, send_transactional_email

    open_items = list(WatchIncident.objects.filter(status='open', severity__in=('warning', 'critical')).order_by('-severity', '-last_seen')[:25])
    if not open_items:
        return 0
    rows = ''.join(
        f'<tr><td style="padding:8px 12px;border-bottom:1px solid #e6eef5;font-size:12px;font-weight:800;color:{"#b42318" if i.severity == "critical" else "#b54708"};">{i.severity.upper()}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #e6eef5;font-size:14px;">{escape(i.title)}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #e6eef5;font-size:13px;color:#60748b;">{i.count}×</td></tr>' for i in open_items)
    html = _layout('Open problems this morning', f'{len(open_items)} open', (
        f'<p style="font-size:15px;line-height:1.6;">{len(open_items)} problem(s) are still open in System Watch.</p>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6eef5;border-radius:12px;margin:14px 0 18px;">{rows}</table>'
        + _button('Open System Watch', _front_end_url('dashboard/system-watch'))), 'EduIgnite · Security & System Watch')
    text = '\n'.join(f'{i.severity.upper()}: {i.title} ({i.count}x)' for i in open_items)
    people = recipients()
    delivered = 0
    subject = f'[EduIgnite] {len(open_items)} open problem(s) this morning'
    for person in people:
        try:
            if send_transactional_email(event=EmailEvent.SYSTEM_ALERT, to_email=person['email'], to_name=person['name'], subject=subject, html=html, text=text):
                delivered += 1
        except Exception:  # noqa: BLE001
            logger.exception('Watch: digest email failed')
    WatchAlertLog.objects.create(kind='digest', subject=subject, recipients=[p['email'] for p in people], delivered=delivered)
    return delivered


def _log(incident, kind, subject, people, delivered):
    try:
        WatchAlertLog.objects.create(incident=incident, kind=kind, subject=subject[:250], recipients=[p['email'] for p in people], delivered=delivered)
    except Exception:  # noqa: BLE001
        logger.exception('Watch: could not log the alert')

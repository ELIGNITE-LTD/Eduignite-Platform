"""The system looks at itself every couple of minutes. Each check says ok, warn or fail; a check that goes red raises a
critical incident (and emails the founders), and one that goes green again closes it and says so.
"""

from __future__ import annotations

import logging
import shutil
import time
from datetime import timedelta

from django.core.cache import cache
from django.db import connection
from django.utils import timezone

from . import counters, recorder
from .models import WatchCheck

logger = logging.getLogger(__name__)

OK, WARN, FAIL = 'ok', 'warn', 'fail'


def _database():
    started = time.monotonic()
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
        cursor.fetchone()
    ms = int((time.monotonic() - started) * 1000)
    if ms > 1500:
        return WARN, f'The database answers slowly ({ms} ms).', ms
    return OK, 'The database answers.', ms


def _cache():
    started = time.monotonic()
    token = str(time.time())
    cache.set('watch:probe', token, 30)
    if cache.get('watch:probe') != token:
        return FAIL, 'The cache (Redis) did not return what was stored.', None
    return OK, 'The cache answers.', int((time.monotonic() - started) * 1000)


def _disk():
    usage = shutil.disk_usage('/')
    free = usage.free / usage.total * 100
    detail = f'{free:.0f}% of the disk is free ({usage.free // (1024 ** 3)} GB).'
    if free < 7:
        return FAIL, detail, None
    if free < 15:
        return WARN, detail, None
    return OK, detail, None


def _error_rate():
    requests, errors = counters.recent('requests', 15), counters.recent('errors_5xx', 15)
    if requests < 30:
        return OK, f'Quiet: {requests} requests in the last quarter hour.', None
    rate = errors / requests * 100
    detail = f'{errors} server errors in {requests} requests in the last quarter hour ({rate:.1f}%).'
    if errors >= 20 and rate >= 5:
        return FAIL, detail, None
    if errors >= 5 and rate >= 2:
        return WARN, detail, None
    return OK, detail, None


def _ai_provider():
    from apps.ai_features.credit_models import AIUsageRecord

    since = timezone.now() - timedelta(minutes=20)
    rows = AIUsageRecord.objects.filter(created_at__gte=since)
    total = rows.count()
    if total < 10:
        return OK, f'{total} AI requests in the last 20 minutes.', None
    failed = rows.filter(status=AIUsageRecord.FAILED).count()
    detail = f'{failed} of {total} AI requests failed in the last 20 minutes.'
    if failed / total >= 0.5:
        return FAIL, detail, None
    if failed / total >= 0.25:
        return WARN, detail, None
    return OK, detail, None


def _payments():
    from apps.fees.models import GatewayTransaction

    since = timezone.now() - timedelta(minutes=30)
    failed = GatewayTransaction.objects.filter(status=GatewayTransaction.STATUS_FAILED, created__gte=since).count()
    detail = f'{failed} payment(s) failed in the last 30 minutes.'
    if failed >= 8:
        return FAIL, detail, None
    if failed >= 4:
        return WARN, detail, None
    return OK, detail, None


def _stuck_jobs():
    from apps.ai_marking.models import MarkingJob

    stuck = MarkingJob.objects.filter(status=MarkingJob.MARKING, created_at__lt=timezone.now() - timedelta(minutes=45)).count()
    detail = f'{stuck} AI marking job(s) have been running for over 45 minutes.' if stuck else 'No stuck background jobs.'
    return (WARN if stuck else OK), detail, None


def _email_delivery():
    failed = _email_failed_recent()
    detail = f'{failed} email(s) failed to send in the last hour.' if failed else 'Emails are leaving normally.'
    if failed >= 15:
        return FAIL, detail, None
    if failed >= 5:
        return WARN, detail, None
    return OK, detail, None


def _email_failed_recent() -> int:
    try:
        return int(cache.get('watch:email_fail:count') or 0)
    except Exception:  # noqa: BLE001
        return 0


# (key, label, function name, severity). Looked up by name when they run, so each can be replaced in a test.
CHECKS = [
    ('database', 'Database', '_database', 'critical'),
    ('cache', 'Cache (Redis)', '_cache', 'critical'),
    ('disk', 'Server disk space', '_disk', 'critical'),
    ('error_rate', 'Server error rate', '_error_rate', 'critical'),
    ('ai_provider', 'AI service', '_ai_provider', 'critical'),
    ('payments', 'Payments', '_payments', 'critical'),
    ('email', 'Email delivery', '_email_delivery', 'critical'),
    ('jobs', 'Background jobs', '_stuck_jobs', 'warning'),
]


def run_all() -> list[WatchCheck]:
    """Run every check, store the results, and raise or close incidents on a change."""
    now = timezone.now()
    results = []
    for key, label, fn_name, severity in CHECKS:
        try:
            status, detail, latency = globals()[fn_name]()
        except Exception as exc:  # noqa: BLE001 - a check that cannot run is itself a finding
            status, detail, latency = FAIL, f'{label} could not be checked: {type(exc).__name__}.', None
            logger.warning('Watch check %s crashed: %s', key, exc)
        row, created = WatchCheck.objects.get_or_create(key=key, defaults={'label': label, 'status': status, 'detail': detail, 'latency_ms': latency, 'checked_at': now, 'since': now})
        changed = not created and row.status != status
        row.label, row.detail, row.latency_ms, row.checked_at = label, detail, latency, now
        if changed:
            row.status, row.since = status, now
        row.save()
        results.append(row)
        fingerprint = f'check:{key}'
        if status == FAIL:
            recorder.record(_category(key), f'{label} is failing', message=detail, severity='critical', source='monitor',
                            fingerprint=fingerprint, details={'check': label})
        elif status == WARN:
            recorder.record(_category(key), f'{label} needs attention', message=detail, severity='warning', source='monitor',
                            fingerprint=fingerprint, details={'check': label})
        elif _has_open(fingerprint):
            recorder.resolve(fingerprint, note=f'{label} is healthy again.')
    row = WatchCheck.objects.get_or_create(key='monitor', defaults={'label': 'Monitoring itself', 'status': OK, 'detail': 'Checks are running.', 'checked_at': now, 'since': now})[0]
    row.checked_at, row.status, row.detail = now, OK, 'Checks are running.'
    row.save()
    cache.set('watch:beat', now.timestamp(), 3600)
    return results


def _category(key: str) -> str:
    return {'error_rate': 'traffic', 'ai_provider': 'ai', 'payments': 'payments', 'email': 'email', 'jobs': 'jobs'}.get(key, 'health')


def _has_open(fingerprint: str) -> bool:
    from .models import WatchIncident

    return WatchIncident.objects.filter(fingerprint=fingerprint, status__in=('open', 'acknowledged')).exists()


def monitor_is_stale(minutes: int = 10) -> bool:
    """True when the scheduled checks have not run lately: the background worker or its scheduler is down."""
    row = WatchCheck.objects.filter(key='monitor').first()
    return bool(row and timezone.now() - row.checked_at > timedelta(minutes=minutes))

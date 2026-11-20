from celery import shared_task
from datetime import timedelta

from django.utils import timezone


@shared_task(name='apps.watch.tasks.send_alert_task')
def send_alert_task(incident_id, kind='critical'):
    from .alerts import send_incident_email

    return send_incident_email(incident_id, kind)


@shared_task(name='apps.watch.tasks.run_checks_task')
def run_checks_task():
    from . import counters
    from .checks import run_all

    counters.flush_hours()
    return len(run_all())


@shared_task(name='apps.watch.tasks.flush_counters_task')
def flush_counters_task():
    from . import counters

    return counters.flush_hours()


@shared_task(name='apps.watch.tasks.daily_digest_task')
def daily_digest_task():
    from .alerts import send_digest

    return send_digest()


@shared_task(name='apps.watch.tasks.prune_task')
def prune_task():
    """Keep the records useful and small: solved problems for 60 days, counts for 35, alert log for 90."""
    from .models import WatchAlertLog, WatchHourly, WatchIncident

    now = timezone.now()
    a = WatchIncident.objects.filter(status__in=('resolved', 'ignored'), last_seen__lt=now - timedelta(days=60)).delete()[0]
    b = WatchHourly.objects.filter(hour__lt=now - timedelta(days=35)).delete()[0]
    c = WatchAlertLog.objects.filter(sent_at__lt=now - timedelta(days=90)).delete()[0]
    return a + b + c

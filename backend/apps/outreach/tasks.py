from celery import shared_task

from . import services


@shared_task
def send_queued_outreach():
    """Hourly: send what today's allowance still permits (see services.daily_cap)."""
    # Spread the daily allowance over the day instead of sending it in one burst.
    per_run = max(1, -(-services.daily_cap() // 8))
    return services.process_queue(limit=per_run)

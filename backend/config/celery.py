import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.production')

app = Celery('eduignite')

app.config_from_object('django.conf:settings', namespace='CELERY')

app.autodiscover_tasks()

app.conf.beat_schedule = {
    'reset-daily-ai-requests': {
        'task': 'apps.users.tasks.reset_daily_ai_requests',
        'schedule': crontab(hour=0, minute=0),
    },
    # Daily 07:00 UTC: remind parents (per child, by name) and students while a
    # child's platform subscription is set and unpaid.
    'remind-unpaid-subscription-parents': {
        'task': 'apps.fees.tasks.remind_unpaid_subscription_parents',
        'schedule': crontab(hour=7, minute=0),
    },
    # Share governance: auto-remove expired share allocations every day at 03:00 UTC
    'expire-founder-shares': {
        'task': 'apps.users.tasks.expire_founder_shares',
        'schedule': crontab(hour=3, minute=0),
    },
    # Founder renewal enforcement: deactivate / delete founders past their
    # renewable-shares grace period every day at 03:30 UTC
    'enforce-founder-renewal': {
        'task': 'apps.users.tasks.enforce_founder_renewal',
        'schedule': crontab(hour=3, minute=30),
    },
    # Assignment retention: clear uploaded assignment and submission files
    # after 90 days while preserving the assignment records and marks.
    'cleanup-expired-assignment-files': {
        'task': 'apps.assignments.tasks.cleanup_expired_assignment_files',
        'schedule': crontab(hour=2, minute=15),
    },
    # Draft lifecycle: remind affected users monthly and permanently delete
    # unrecovered schools/users after six months in Draft.
    'process-draft-deletion-lifecycle': {
        'task': 'apps.users.tasks.process_draft_deletion_lifecycle',
        'schedule': crontab(hour=2, minute=45),
    },
    # Chat retention: wipe chat/group attachment payloads after one month
    # (keeps the message + file name so the UI can ask the sender to resend).
    # AI credits: give back credits held by AI requests that died without
    # finishing (a killed worker, a lost connection).
    'release-stale-ai-credit-holds': {
        'task': 'apps.ai_features.tasks.release_stale_ai_credit_holds',
        'schedule': crontab(minute='*/10'),
    },
    # Chat bots: forget handled Telegram update ids and expired link codes.
    'cleanup-bot-records': {
        'task': 'apps.bots.tasks.cleanup_bot_records',
        'schedule': crontab(hour=4, minute=10),
    },
    'cleanup-expired-chat-files': {
        'task': 'apps.chat.tasks.cleanup_expired_chat_files',
        'schedule': crontab(hour=3, minute=15),
    },
}

app.conf.timezone = 'UTC'

# --- Reliability / memory hardening for the single production box ---
app.conf.update(
    # Keep retrying the broker on startup (also silences the Celery 6 warning).
    broker_connection_retry_on_startup=True,
    # Recycle each worker process after N tasks so a slow memory leak can't
    # grow unbounded on the ~2 GB server.
    worker_max_tasks_per_child=200,
    # Fair dispatch — don't let one worker prefetch/hoard the whole queue.
    worker_prefetch_multiplier=1,
    # A stuck task is signalled then hard-killed instead of hanging a worker.
    task_soft_time_limit=600,   # 10 min -> SoftTimeLimitExceeded
    task_time_limit=660,        # 11 min -> hard kill
)


@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')

import logging

from celery.signals import task_failure

logger = logging.getLogger(__name__)


@task_failure.connect
def background_task_failed(sender=None, task_id=None, exception=None, **kwargs):
    """Any background task that raises is a finding: the founders see which task, how often, and since when."""
    try:
        name = getattr(sender, 'name', '') or 'a task'
        if name.startswith('apps.watch.'):
            return          # the monitor does not report on itself, or a failure here would feed itself
        from . import recorder

        kind = type(exception).__name__ if exception else 'Error'
        recorder.record(
            'jobs', f'Background task failed: {name.rsplit(".", 1)[-1]}'[:200], severity='warning', source='worker',
            message=f'{kind}: {str(exception)[:300]}', fingerprint=recorder.fingerprint_of('task', name, kind),
            details={'task': name, 'exception': f'{kind}: {str(exception)[:200]}'}, escalate_after=(5, 60, 0, 0),
        )
    except Exception:  # noqa: BLE001
        logger.exception('Watch: could not record a failed task')

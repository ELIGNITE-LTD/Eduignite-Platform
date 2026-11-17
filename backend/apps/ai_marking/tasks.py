from celery import shared_task


@shared_task
def mark_job_task(job_id):
    from .services import run_job

    run_job(job_id)

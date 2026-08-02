from celery import shared_task
from django.utils import timezone

from .models import Assignment, AssignmentSubmission


@shared_task
def cleanup_expired_assignment_files():
    """Purge assignment materials older than 90 days, keeping only the scores.

    After three months every assignment "material" (uploaded files, the
    instructions/brief and each student's submitted work) is wiped from the
    database. The graded outcome — score, feedback and who graded it — is kept
    so the marks remain available forever.
    """
    cutoff = timezone.now() - timezone.timedelta(days=90)

    assignment_count = Assignment.objects.filter(
        created__lt=cutoff,
    ).exclude(
        attachment_data='', instructions='',
    ).update(
        attachment_name='',
        attachment_mime_type='',
        attachment_data='',
        instructions='',
    )

    submission_count = AssignmentSubmission.objects.filter(
        created__lt=cutoff,
    ).exclude(
        attachment_data='', content='',
    ).update(
        attachment_name='',
        attachment_data='',
        content='',
    )

    return {
        'assignment_materials_cleared': assignment_count,
        'submission_materials_cleared': submission_count,
    }

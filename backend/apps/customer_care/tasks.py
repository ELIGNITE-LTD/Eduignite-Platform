import logging

from celery import shared_task
from django.utils import timezone

from . import emailing
from .models import Conversation, ConversationStatus

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=emailing.MAX_ATTEMPTS)
def send_email_message(self, message_id):
    """Send one Customer Care email; a failed attempt is retried with backoff, then stays failed."""
    status = emailing.deliver_email_message(message_id)
    if status == 'queued':  # a failed attempt was released for retry
        try:
            raise self.retry(countdown=60 * (2 ** self.request.retries))
        except self.MaxRetriesExceededError:
            from .models import DeliveryStatus, Message
            message = Message.objects.get(pk=message_id)
            if message.delivery_status == DeliveryStatus.QUEUED:
                message.transition(DeliveryStatus.FAILED, detail='retries exhausted', error_code='retries_exhausted')
    return status


@shared_task
def send_follow_up_reminders():
    """Remind the assignee (or the founders) once when a follow-up date has passed."""
    from django.contrib.auth import get_user_model

    from .services import _notify, log_event

    now = timezone.now()
    due = Conversation.objects.filter(follow_up_at__lte=now, follow_up_reminded_at__isnull=True).exclude(
        status__in=[ConversationStatus.RESOLVED, ConversationStatus.CLOSED]).select_related('assigned_to')
    count = 0
    for conversation in due:
        recipients = [conversation.assigned_to] if conversation.assigned_to_id else list(
            get_user_model().objects.filter(role__in=['CEO', 'CTO'], is_active=True))
        for r in recipients:
            _notify(r, 'Customer Care follow-up due', conversation.subject, conversation)
        Conversation.objects.filter(pk=conversation.pk).update(follow_up_reminded_at=now)
        log_event(conversation, None, 'follow_up_reminder_sent')
        count += 1
    logger.info('Customer Care follow-up reminders sent: %s', count)
    return {'reminders': count}

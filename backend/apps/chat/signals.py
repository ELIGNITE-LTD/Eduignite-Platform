from django.db.models.signals import post_save, post_delete
from django.db import transaction
from django.dispatch import receiver
from django.utils import timezone
import logging
from .models import Message, Conversation

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Message)
def update_conversation_on_new_message(sender, instance, created, **kwargs):
    """Update conversation's last_message when a new message is created."""
    if created and not instance.is_deleted:
        instance.conversation.last_message = instance.text[:100]
        instance.conversation.last_message_at = timezone.now()
        instance.conversation.save(update_fields=['last_message', 'last_message_at'])


@receiver(post_save, sender=Message)
def handle_offline_notification(sender, instance, created, **kwargs):
    """Send offline notifications when message is created."""
    if created and not instance.is_deleted:
        from .tasks import send_offline_notification

        # Get conversation participants
        conversation = instance.conversation
        recipients = conversation.participants.exclude(id=instance.sender.id)

        for recipient in recipients:
            def queue_notification(recipient_id=recipient.id, message_id=instance.id):
                try:
                    send_offline_notification.delay(recipient_id, message_id)
                except Exception as exc:
                    logger.warning(
                        "Offline chat notification queue failed for user %s and message %s: %s",
                        recipient_id,
                        message_id,
                        exc,
                    )

            transaction.on_commit(queue_notification)

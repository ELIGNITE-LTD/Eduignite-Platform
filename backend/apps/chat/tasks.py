from celery import shared_task
from django.utils import timezone
from datetime import timedelta
import logging

from .models import Conversation, Message, ConversationParticipant

logger = logging.getLogger(__name__)


@shared_task
def cleanup_expired_chat_files(days=30):
    """Clear chat/group attachment data older than one month.

    The message itself and its file name are kept so the chat still shows an
    attachment placeholder; only the heavy stored bytes are wiped. When a user
    then opens it, the attachment endpoint reports it as expired so the UI can
    ask the sender to resend. This keeps the database small over time.
    """
    cutoff = timezone.now() - timedelta(days=days)
    cleared = (
        Message.objects.filter(created_at__lt=cutoff)
        .exclude(attachment_data='')
        .update(attachment_data='')
    )
    logger.info("Cleared %s expired chat attachment payloads", cleared)
    return {'attachments_cleared': cleared}


@shared_task
def cleanup_old_messages(days=90):
    """
    Archive messages older than specified days.
    Deletes messages that are older than the threshold.
    """
    cutoff_date = timezone.now() - timedelta(days=days)

    try:
        deleted_count, _ = Message.objects.filter(
            created_at__lt=cutoff_date,
            is_deleted=True
        ).delete()

        logger.info(f"Cleaned up {deleted_count} old deleted messages")
        return {
            'status': 'success',
            'deleted_count': deleted_count
        }

    except Exception as e:
        logger.error(f"Error cleaning up old messages: {e}")
        return {
            'status': 'error',
            'error': str(e)
        }


@shared_task
def send_offline_notification(user_id, message_id):
    """
    Send push notification to user when they receive a message while offline.
    This is called when a user is not actively connected to WebSocket.
    """
    try:
        from apps.users.models import User
        from .models import Message

        user = User.objects.get(id=user_id)
        message = Message.objects.get(id=message_id)

        # Check if user has Firebase token for push notifications
        if not user.firebase_token:
            logger.info(f"No Firebase token for user {user_id}")
            return {
                'status': 'skipped',
                'reason': 'No Firebase token'
            }

        # Build notification message
        sender_name = message.sender.get_full_name()
        preview = message.text[:50]

        notification_data = {
            'title': f"Message from {sender_name}",
            'body': preview,
            'message_id': str(message.id),
            'conversation_id': str(message.conversation.id),
            'sender_id': str(message.sender.id),
        }

        # Send via Firebase (implement based on your Firebase setup)
        # This assumes you have Firebase Admin SDK configured
        logger.info(f"Would send notification to user {user_id}: {notification_data}")

        return {
            'status': 'success',
            'user_id': user_id,
            'message_id': message_id
        }

    except User.DoesNotExist:
        logger.error(f"User {user_id} not found")
        return {
            'status': 'error',
            'error': f"User {user_id} not found"
        }
    except Message.DoesNotExist:
        logger.error(f"Message {message_id} not found")
        return {
            'status': 'error',
            'error': f"Message {message_id} not found"
        }
    except Exception as e:
        logger.error(f"Error sending offline notification: {e}")
        return {
            'status': 'error',
            'error': str(e)
        }


@shared_task
def deactivate_empty_conversations():
    """
    Deactivate conversations with no active participants.
    Runs periodically to clean up stale conversations.
    """
    try:
        conversations = Conversation.objects.filter(is_active=True)
        deactivated = 0

        for conversation in conversations:
            if conversation.participants.count() == 0:
                conversation.is_active = False
                conversation.save()
                deactivated += 1

        logger.info(f"Deactivated {deactivated} empty conversations")
        return {
            'status': 'success',
            'deactivated_count': deactivated
        }

    except Exception as e:
        logger.error(f"Error deactivating empty conversations: {e}")
        return {
            'status': 'error',
            'error': str(e)
        }

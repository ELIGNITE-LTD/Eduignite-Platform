import logging
from typing import Iterable

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Notification, NotificationPriority, NotificationType

logger = logging.getLogger(__name__)
User = get_user_model()


def notification_group_name(user_id):
    return f'user_notifications_{user_id}'


def serialize_notification(notification: Notification):
    return {
        'id': str(notification.id),
        'title': notification.title,
        'message': notification.message,
        'notification_type': notification.notification_type,
        'priority': notification.priority,
        'icon': notification.icon,
        'url': notification.url,
        'is_read': notification.is_read,
        'created_at': notification.created.isoformat() if notification.created else None,
        'updated_at': notification.modified.isoformat() if notification.modified else None,
        'sender': str(notification.sender_id) if notification.sender_id else None,
    }


def broadcast_notification(notification: Notification):
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    unread_count = Notification.objects.filter(recipient=notification.recipient, is_read=False).count()
    async_to_sync(channel_layer.group_send)(
        notification_group_name(notification.recipient_id),
        {
            'type': 'notification.created',
            'notification': serialize_notification(notification),
            'unread_count': unread_count,
        },
    )


def create_notification(
    *, recipient, title: str, message: str, sender=None,
    notification_type: str = NotificationType.PLATFORM,
    priority: str = NotificationPriority.NORMAL, icon: str = 'bell', url: str = '',
    deliver_async: bool = True,
):
    notification = Notification.objects.create(
        recipient=recipient,
        sender=sender,
        title=title,
        message=message,
        notification_type=notification_type,
        priority=priority,
        icon=icon,
        url=url,
    )

    def _deliver():
        try:
            broadcast_notification(notification)
            if deliver_async:
                from .tasks import deliver_notification
                deliver_notification.delay(str(notification.id))
        except Exception:
            logger.exception('Notification delivery dispatch failed for %s', notification.pk)

    transaction.on_commit(_deliver)
    return notification


def create_notifications(*, recipients: Iterable, title: str, message: str, sender=None, **kwargs):
    notifications = []
    seen = set()
    for recipient in recipients:
        if not recipient or recipient.pk in seen:
            continue
        seen.add(recipient.pk)
        notifications.append(
            create_notification(
                recipient=recipient,
                title=title,
                message=message,
                sender=sender,
                **kwargs,
            )
        )
    return notifications


def users_for_roles(role_names, school=None):
    qs = User.objects.filter(is_active=True, role__in=list(role_names))
    if school is not None:
        qs = qs.filter(school=school)
    return qs

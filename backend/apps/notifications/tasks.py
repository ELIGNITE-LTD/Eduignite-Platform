import logging

import requests
from celery import shared_task
from django.conf import settings

from .models import Notification, NotificationDevice

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def deliver_notification(self, notification_id):
    """Deliver a notification beyond the app: push to the user's devices.

    Notifications are never emailed. The in-app record and the live websocket
    update already exist by the time this runs (see services.create_notification);
    email is reserved for the few events in core.email_service.
    """
    if not Notification.objects.filter(pk=notification_id).exists():
        return False
    send_push_notification.delay(notification_id)
    return True


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def send_email_notification(self, notification_id):
    """Retired: notifications are no longer emailed.

    Kept only so jobs queued before the change drain without errors.
    """
    return False


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def send_push_notification(self, notification_id):
    server_key = getattr(settings, 'FCM_SERVER_KEY', '')
    if not server_key:
        return False
    notification = Notification.objects.select_related('recipient').get(pk=notification_id)
    tokens = list(
        NotificationDevice.objects.filter(user=notification.recipient, active=True)
        .values_list('token', flat=True)
    )
    if not tokens:
        return False
    payload = {
        'registration_ids': tokens,
        'notification': {'title': notification.title, 'body': notification.message},
        'data': {
            'id': str(notification.id),
            'type': notification.notification_type,
            'priority': notification.priority,
            'url': notification.url,
        },
    }
    response = requests.post(
        'https://fcm.googleapis.com/fcm/send',
        json=payload,
        headers={'Authorization': f'key={server_key}', 'Content-Type': 'application/json'},
        timeout=10,
    )
    if response.status_code >= 400:
        logger.warning('FCM notification failed for %s: %s %s', notification_id, response.status_code, response.text[:500])
        return False
    return True

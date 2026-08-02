import logging

import requests
from celery import shared_task
from django.conf import settings
from django.utils.html import escape

from core.email_service import send_transactional_email
from .models import Notification, NotificationDevice

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def deliver_notification(self, notification_id):
    try:
        notification = Notification.objects.select_related('recipient').get(pk=notification_id)
    except Notification.DoesNotExist:
        return False

    send_email_notification.delay(notification_id)
    send_push_notification.delay(notification_id)
    return True


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def send_email_notification(self, notification_id):
    notification = Notification.objects.select_related('recipient').get(pk=notification_id)
    email = getattr(notification.recipient, 'email', '')
    if not email:
        return False
    try:
        return send_transactional_email(
            to_email=email,
            to_name=getattr(notification.recipient, 'name', '') or email,
            subject=notification.title,
            html=f"<p>{escape(notification.message)}</p>",
            text=notification.message,
            sender_name=getattr(notification.recipient.school, 'name', '') if getattr(notification.recipient, 'school_id', None) else 'EduIgnite',
            reply_to_email=getattr(notification.recipient.school, 'email', None) if getattr(notification.recipient, 'school_id', None) else None,
        )
    except Exception as exc:
        logger.warning('Email notification failed for %s: %s', notification_id, exc)
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

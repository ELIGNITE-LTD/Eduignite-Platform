"""Customer Care email: branded template, configuration status, idempotent send.

Goes through ``core.email_service.send_transactional_email`` (Brevo) using the
approved event ``CUSTOMER_CARE_REPLY``. The provider key lives in
``apps.platform`` ``IntegrationSecrets``/environment and is never returned by an API.
"""

import logging
import re
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.html import escape

from core import email_service
from core.email_service import EmailEvent

from .models import Channel, DeliverySource, DeliveryStatus, InvalidStatusTransition, Message

logger = logging.getLogger(__name__)

OFFICIAL_LABEL = 'Official EduIgnite Representative'
MAX_ATTEMPTS = 3
CLAIM_TTL = timedelta(minutes=10)


def logo_url() -> str:
    explicit = getattr(settings, 'CUSTOMER_CARE_LOGO_URL', '')
    if explicit:
        return explicit
    return f"{getattr(settings, 'FRONTEND_URL', 'https://eduignite.online').rstrip('/')}/eduignite-logo.png"


def email_config_status() -> dict:
    """Founder-facing status. Never contains the key itself."""
    provider = str(getattr(settings, 'EMAIL_PROVIDER', 'brevo')).lower()
    try:
        from apps.platform import runtime_config
        key = runtime_config.brevo_api_key()
    except Exception:  # noqa: BLE001
        key = getattr(settings, 'BREVO_API_KEY', '')
    sender = getattr(settings, 'EMAIL_FROM_ADDRESS', '') or getattr(settings, 'SERVER_EMAIL', '')
    problems = []
    if provider != 'brevo':
        problems.append('EMAIL_PROVIDER is not brevo')
    if not key:
        problems.append('Brevo API key is not set')
    if not email_service._is_deliverable_email(sender):
        problems.append('EMAIL_FROM_ADDRESS is not a deliverable address')
    return {
        'provider': provider,
        'configured': not problems,
        'state': 'configured' if not problems else 'not_configured',
        'problems': problems,
        'api_key_set': bool(key),
        'sender_address': sender if email_service._is_deliverable_email(sender) else '',
        'logo_url': logo_url(),
        'delivery_tracking': 'Delivered/bounced are recorded only if a provider webhook is wired; '
                             'until then messages stop at "sent_to_provider".',
    }


def _one_line(value, limit=200):
    return re.sub(r'[\r\n\t\x00-\x1f]+', ' ', str(value or '')).strip()[:limit]


def render_email(*, customer_name, subject, body, sender_name, sender_role):
    """Return ``(html, text)`` for a Customer Care email. All user text is escaped."""
    customer_name, sender_name, sender_role = (_one_line(customer_name, 120), _one_line(sender_name, 120),
                                               _one_line(sender_role, 100))
    paragraphs = ''.join(
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.7;">{escape(p).replace(chr(10), "<br>")}</p>'
        for p in re.split(r'\n{2,}', str(body or '').strip()) if p.strip()
    )
    site = getattr(settings, 'FRONTEND_URL', 'https://eduignite.online')
    html = f"""<!doctype html>
<html><body style="margin:0;background:#eef4f8;font-family:Arial,Helvetica,sans-serif;color:#10233f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dce7f0;">
<tr><td style="background:#0b3a73;padding:22px 28px;color:#ffffff;">
<img src="{escape(logo_url())}" alt="EduIgnite" height="44" style="display:block;height:44px;border:0;margin-bottom:10px;">
<div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;opacity:.85;">Official Customer Care</div>
</td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 14px;font-size:15px;">Hello {escape(customer_name)},</p>
{paragraphs}
<p style="margin:22px 0 0;font-size:15px;line-height:1.6;">Kind regards,<br>
<strong>{escape(sender_name)}</strong><br>{escape(sender_role)}<br>
<span style="color:#0b3a73;font-weight:700;">{OFFICIAL_LABEL}</span><br>EduIgnite</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f7fafc;border-top:1px solid #dce7f0;color:#60748b;font-size:12px;line-height:1.6;">
You are receiving this because you contacted EduIgnite Customer Care about "{escape(_one_line(subject, 120))}".
Reply to this email to continue the conversation. <a href="{escape(site)}" style="color:#0b3a73;">{escape(site)}</a>
</td></tr>
</table></td></tr></table></body></html>"""
    text = (
        'EduIgnite | Official Customer Care\n\n'
        f'Hello {customer_name},\n\n{str(body or "").strip()}\n\n'
        f'Kind regards,\n{sender_name}\n{sender_role}\n{OFFICIAL_LABEL}\nEduIgnite\n\n'
        f'-- You are receiving this because you contacted EduIgnite Customer Care. {site}\n'
    )
    return html, text


def validate_recipient(email):
    """Return the cleaned address or raise ``ValueError``."""
    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email

    value = str(email or '').strip()
    try:
        validate_email(value)
    except ValidationError:
        raise ValueError('The customer has no valid email address on file.')
    if not email_service._is_deliverable_email(value):
        raise ValueError('The customer email address is not deliverable.')
    return value


def deliver_email_message(message_id) -> str:
    """Send one queued email message at most once. Returns the resulting status.

    Safe to run twice at the same time: a compare-and-set on ``send_claimed_at``
    lets only one worker through, so the customer never gets a duplicate.
    """
    now = timezone.now()
    claimed = Message.objects.filter(
        pk=message_id, channel=Channel.EMAIL, delivery_status=DeliveryStatus.QUEUED,
    ).filter(_unclaimed_q(now)).update(send_claimed_at=now)
    if not claimed:
        return Message.objects.values_list('delivery_status', flat=True).get(pk=message_id)
    message = Message.objects.select_related('conversation__customer').get(pk=message_id)
    message.attempts += 1
    message.save(update_fields=['attempts'])
    if not email_config_status()['configured']:
        return _fail(message, 'provider_not_configured', release=False)
    html, text = render_email(
        customer_name=message.conversation.customer.name, subject=message.conversation.subject,
        body=message.body, sender_name=message.sender_name, sender_role=message.sender_role_label,
    )
    try:
        ok = email_service.send_transactional_email(
            event=EmailEvent.CUSTOMER_CARE_REPLY, to_email=message.recipient,
            to_name=message.conversation.customer.name,
            subject=_one_line(f'EduIgnite Customer Care: {message.conversation.subject}'),
            html=html, text=text, sender_name='EduIgnite Customer Care',
            reply_to_email=getattr(settings, 'EMAIL_FROM_ADDRESS', None),
        )
    except Exception:  # noqa: BLE001 - recorded, never raised
        logger.exception('Customer Care email crashed (message %s)', message.pk)
        ok = False
    if ok:
        message.provider = 'brevo'
        message.save(update_fields=['provider'])
        message.transition(DeliveryStatus.SENT_TO_PROVIDER, source=DeliverySource.SYSTEM,
                           detail='Accepted by Brevo')
        return message.delivery_status
    return _fail(message, 'provider_rejected', release=message.attempts < MAX_ATTEMPTS)


def _unclaimed_q(now):
    from django.db.models import Q
    return Q(send_claimed_at__isnull=True) | Q(send_claimed_at__lt=now - CLAIM_TTL)


def _fail(message, code, *, release):
    """Record a failure. ``release`` lets a retry claim the message again."""
    try:
        message.transition(DeliveryStatus.FAILED, source=DeliverySource.SYSTEM,
                           detail=f'attempt {message.attempts}', error_code=code)
    except InvalidStatusTransition:
        pass
    if release:
        # Back to queued for the Celery retry; the history keeps the failure.
        message.refresh_from_db()
        message.transition(DeliveryStatus.QUEUED, detail='retry scheduled')
    Message.objects.filter(pk=message.pk).update(send_claimed_at=None)
    message.refresh_from_db()
    return message.delivery_status

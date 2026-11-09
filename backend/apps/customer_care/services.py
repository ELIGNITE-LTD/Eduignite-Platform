"""Customer Care business operations. Views stay thin and call these."""

import logging
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from apps.users.role_labels import role_display

from . import emailing, whatsapp
from .access import has_customer_care_access, is_founder
from .models import (
    AuditLog, Channel, Conversation, ConversationAssignment, ConversationEvent, ConversationStatus,
    CustomerGroup, DeliverySource, DeliveryStatus, Direction, InternalNote, Message,
)

logger = logging.getLogger(__name__)

MAX_BODY = 5000
DUPLICATE_WINDOW = timedelta(seconds=30)
STAFF_SETTABLE = {
    ConversationStatus.OPEN, ConversationStatus.IN_PROGRESS, ConversationStatus.AWAITING_CUSTOMER,
    ConversationStatus.AWAITING_INTERNAL, ConversationStatus.RESOLVED, ConversationStatus.CLOSED,
}


class CareError(Exception):
    """A rule was broken; ``code`` is machine-readable, ``status`` the HTTP status."""

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def audit(actor, action, target_type='', target_id='', **data):
    return AuditLog.objects.create(actor=actor, action=action, target_type=target_type,
                                   target_id=str(target_id), data=data)


def log_event(conversation, actor, kind, **data):
    return ConversationEvent.objects.create(conversation=conversation, actor=actor, kind=kind, data=data)


def clean_body(body):
    text = str(body or '').replace('\x00', '').strip()
    if not text:
        raise CareError('empty_message', 'The message cannot be empty.')
    if len(text) > MAX_BODY:
        raise CareError('message_too_long', f'The message is longer than {MAX_BODY} characters.')
    return text


def sender_identity(user):
    """Header identity derived from the account: never client-supplied."""
    avatar = str(getattr(user, 'avatar', '') or '')
    return {
        'sender_name': (user.get_full_name() or user.matricule)[:200],
        'sender_role_label': role_display(user)[:100],
        'sender_avatar': avatar if avatar.startswith('https://') and len(avatar) < 500 else '',
        'is_official_representative': True,
    }


# ------------------------------------------------------------------- customer side


@transaction.atomic
def create_conversation(customer, *, subject, body, category='general', client_message_id=''):
    body = clean_body(body)
    subject = (str(subject or '').strip() or body[:80])[:200]
    group = CustomerGroup.for_user(customer)
    now = timezone.now()
    conversation = Conversation.objects.create(
        customer=customer, school=customer.school if getattr(customer, 'school_id', None) else None,
        group=group, subject=subject, category=(str(category or 'general')[:60]),
        status=ConversationStatus.NEW, created_by=customer, last_activity_at=now,
        channels=[Channel.IN_APP], last_customer_message_at=now,
    )
    log_event(conversation, customer, 'created', group=group.slug if group else None)
    _insert_customer_message(conversation, customer, body, client_message_id)
    _notify_staff_new_message(conversation)
    return conversation


def _insert_customer_message(conversation, customer, body, client_message_id):
    message = Message.objects.create(
        conversation=conversation, sender=customer, direction=Direction.INBOUND, channel=Channel.IN_APP,
        body=body, sender_name=(customer.get_full_name() or '')[:200],
        sender_role_label=role_display(customer)[:100], client_message_id=str(client_message_id or '')[:80],
        delivery_status=DeliveryStatus.STORED,
    )
    Conversation.objects.filter(pk=conversation.pk).update(
        staff_unread_count=F('staff_unread_count') + 1, last_activity_at=message.created_at,
        last_customer_message_at=message.created_at,
    )
    return message


@transaction.atomic
def add_customer_message(conversation, customer, body, client_message_id=''):
    """Returns ``(message, created)``. A repeated client id or a double-click returns the original."""
    body = clean_body(body)
    conversation = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if conversation.customer_id != customer.pk:
        raise CareError('not_found', 'Conversation not found.', 404)
    if conversation.status == ConversationStatus.CLOSED:
        raise CareError('conversation_closed', 'This conversation is closed. Please start a new one.', 409)
    if client_message_id:
        existing = Message.objects.filter(conversation=conversation, sender=customer,
                                          client_message_id=client_message_id).first()
        if existing:
            return existing, False
    recent = Message.objects.filter(conversation=conversation, sender=customer, body=body,
                                    created_at__gte=timezone.now() - DUPLICATE_WINDOW).first()
    if recent:
        return recent, False
    try:
        with transaction.atomic():
            message = _insert_customer_message(conversation, customer, body, client_message_id)
    except IntegrityError:
        return Message.objects.get(conversation=conversation, sender=customer,
                                   client_message_id=client_message_id), False
    reopened = conversation.status in (ConversationStatus.RESOLVED, ConversationStatus.AWAITING_CUSTOMER)
    if reopened:
        previous = conversation.status
        conversation.status = ConversationStatus.OPEN
        conversation.resolved_at = None
        conversation.save(update_fields=['status', 'resolved_at', 'updated_at'])
        log_event(conversation, customer, 'customer_replied', previous_status=previous)
    _notify_staff_new_message(conversation)
    return message, True


def mark_read_by_customer(conversation):
    Conversation.objects.filter(pk=conversation.pk).update(customer_unread_count=0)


# --------------------------------------------------------------------- staff side


def _assert_open_for_staff(conversation):
    if conversation.status == ConversationStatus.CLOSED:
        raise CareError('conversation_closed', 'This conversation is closed. Reopen it first.', 409)


def _touch_after_staff_message(conversation, staff, message, *, notify_customer=True):
    Conversation.objects.filter(pk=conversation.pk).update(
        customer_unread_count=F('customer_unread_count') + (1 if notify_customer else 0),
        last_activity_at=message.created_at, staff_unread_count=0)
    conversation.refresh_from_db()
    # A non-founder executive who answers an unassigned conversation takes it.
    if conversation.assigned_to_id is None and not is_founder(staff):
        _assign(conversation, staff, staff, reason='Replied to an unassigned conversation')
    if conversation.status in (ConversationStatus.NEW, ConversationStatus.OPEN):
        conversation.status = ConversationStatus.IN_PROGRESS
    conversation.add_channel(message.channel)
    conversation.save(update_fields=['status', 'channels', 'updated_at'])


@transaction.atomic
def staff_reply(conversation, staff, *, body, channel=Channel.IN_APP, client_message_id=''):
    """In-app or email reply. WhatsApp goes through ``prepare_whatsapp``."""
    body = clean_body(body)
    conversation = Conversation.objects.select_for_update().select_related('customer').get(pk=conversation.pk)
    _assert_open_for_staff(conversation)
    if channel not in (Channel.IN_APP, Channel.EMAIL):
        raise CareError('use_whatsapp_endpoint', 'Use the WhatsApp prepare endpoint for WhatsApp.')
    if client_message_id:
        existing = Message.objects.filter(conversation=conversation, sender=staff,
                                          client_message_id=client_message_id).first()
        if existing:
            return existing, False
    recipient = ''
    if channel == Channel.EMAIL:
        status = emailing.email_config_status()
        if not status['configured']:
            raise CareError('email_not_configured',
                            'Email sending is not configured. Nothing was sent. ' + '; '.join(status['problems']), 503)
        try:
            recipient = emailing.validate_recipient(conversation.customer.email)
        except ValueError as exc:
            raise CareError('invalid_recipient', str(exc))
    message = Message.objects.create(
        conversation=conversation, sender=staff, direction=Direction.OUTBOUND, channel=channel, body=body,
        client_message_id=str(client_message_id or '')[:80], recipient=recipient,
        delivery_status=DeliveryStatus.STORED if channel == Channel.IN_APP else DeliveryStatus.DRAFT,
        **sender_identity(staff),
    )
    if channel == Channel.EMAIL:
        message.transition(DeliveryStatus.QUEUED, detail='Queued for sending')
    _touch_after_staff_message(conversation, staff, message)
    log_event(conversation, staff, 'reply', channel=channel, message_id=message.pk)
    if channel == Channel.EMAIL:
        transaction.on_commit(lambda: dispatch_email(message.pk))
    else:
        _notify_customer(conversation, staff)
    return message, True


def dispatch_email(message_id):
    """Queue the Celery send; if the broker is down, send inline so nothing is silently lost."""
    try:
        from .tasks import send_email_message
        send_email_message.delay(message_id)
    except Exception:  # noqa: BLE001
        logger.exception('Celery unavailable for Customer Care email %s; sending inline', message_id)
        emailing.deliver_email_message(message_id)


@transaction.atomic
def prepare_whatsapp(conversation, staff, *, body, client_message_id=''):
    """Build a click-to-chat link and record the message as prepared (NOT sent)."""
    body = clean_body(body)
    conversation = Conversation.objects.select_for_update().select_related('customer').get(pk=conversation.pk)
    _assert_open_for_staff(conversation)
    customer = conversation.customer
    stored = customer.whatsapp or customer.phone
    try:
        digits = whatsapp.normalize_phone(stored)
    except whatsapp.InvalidPhoneNumber as exc:
        raise CareError('invalid_phone', str(exc))
    identity = sender_identity(staff)
    text = whatsapp.build_click_to_chat_text(
        customer_name=customer.get_full_name() or 'there', sender_name=identity['sender_name'],
        sender_role=identity['sender_role_label'], body=body)
    existing = None
    if client_message_id:
        existing = Message.objects.filter(conversation=conversation, sender=staff,
                                          client_message_id=client_message_id).first()
    created = existing is None
    message = existing or Message.objects.create(
        conversation=conversation, sender=staff, direction=Direction.OUTBOUND, channel=Channel.WHATSAPP,
        body=body, client_message_id=str(client_message_id or '')[:80], recipient=f'+{digits}',
        provider='click_to_chat', delivery_status=DeliveryStatus.PREPARED,
        delivery_source=DeliverySource.MANUAL, **identity,
    )
    if created:
        from .models import DeliveryEvent
        DeliveryEvent.objects.create(message=message, status=DeliveryStatus.PREPARED,
                                     source=DeliverySource.MANUAL, detail='Link prepared')
        # The customer is not notified: nothing has been sent yet.
        _touch_after_staff_message(conversation, staff, message, notify_customer=False)
        log_event(conversation, staff, 'whatsapp_prepared', message_id=message.pk)
    link = whatsapp.ClickToChatProvider().prepare(phone_digits=digits, text=text)
    return message, link['url'], created


@transaction.atomic
def record_whatsapp_outcome(message, staff, outcome, note=''):
    """The executive records what really happened. Always flagged source=manual."""
    allowed = {DeliveryStatus.OPENED, DeliveryStatus.SENT_MANUALLY, DeliveryStatus.NOT_SENT,
               DeliveryStatus.FOLLOW_UP}
    if outcome not in {s.value for s in allowed}:
        raise CareError('invalid_outcome', 'Outcome must be one of: opened_delivery_unconfirmed, '
                                           'sent_manually, not_sent, follow_up_required.')
    if message.channel != Channel.WHATSAPP or message.provider != 'click_to_chat':
        raise CareError('not_click_to_chat', 'Only click-to-chat WhatsApp messages take a manual outcome.')
    from .models import InvalidStatusTransition
    try:
        message.transition(outcome, source=DeliverySource.MANUAL, detail=str(note or '')[:300])
    except InvalidStatusTransition as exc:
        raise CareError('invalid_transition', str(exc), 409)
    if outcome == DeliveryStatus.SENT_MANUALLY:
        # Only now does the customer have something to read, and only because a person said so.
        Conversation.objects.filter(pk=message.conversation_id).update(
            customer_unread_count=F('customer_unread_count') + 1)
    log_event(message.conversation, staff, 'whatsapp_outcome', outcome=outcome, message_id=message.pk)
    return message


@transaction.atomic
def set_status(conversation, staff, status, resolution_summary=''):
    status = str(status)
    if status not in {s.value for s in STAFF_SETTABLE}:
        raise CareError('invalid_status', 'Invalid status.')
    conversation = Conversation.objects.select_for_update().get(pk=conversation.pk)
    old = conversation.status
    if status == ConversationStatus.RESOLVED:
        summary = str(resolution_summary or conversation.resolution_summary or '').strip()
        if not summary:
            raise CareError('resolution_required', 'A resolution summary is required to resolve a conversation.')
        conversation.resolution_summary = summary[:3000]
        conversation.resolved_at = timezone.now()
    elif old in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
        conversation.resolved_at = None
        conversation.closed_at = None
    if status == ConversationStatus.CLOSED:
        conversation.closed_at = timezone.now()
        conversation.resolved_at = conversation.resolved_at or conversation.closed_at
    conversation.status = status
    conversation.save()
    log_event(conversation, staff, 'status_changed', old=old, new=status)
    return conversation


def reopen(conversation, staff):
    if not conversation.is_finished:
        raise CareError('not_finished', 'Only resolved or closed conversations can be reopened.', 409)
    return set_status(conversation, staff, ConversationStatus.OPEN)


def _assign(conversation, executive, actor, reason=''):
    now = timezone.now()
    ConversationAssignment.objects.filter(conversation=conversation, is_active=True).update(
        is_active=False, ended_at=now, ended_by=actor)
    if executive is not None:
        ConversationAssignment.objects.create(conversation=conversation, executive=executive,
                                              assigned_by=actor, reason=reason[:200])
    old = conversation.assigned_to_id
    conversation.assigned_to = executive
    conversation.save(update_fields=['assigned_to', 'updated_at'])
    log_event(conversation, actor, 'assigned', old=str(old) if old else None,
              new=str(executive.pk) if executive else None, reason=reason[:200])


@transaction.atomic
def assign(conversation, actor, executive, reason=''):
    """Founders only (enforced by the view). The target must hold Customer Care access."""
    if executive is not None and not has_customer_care_access(executive):
        raise CareError('executive_without_access', 'That person does not have Customer Care access.')
    conversation = Conversation.objects.select_for_update().get(pk=conversation.pk)
    _assign(conversation, executive, actor, reason)
    audit(actor, 'conversation_assigned', 'conversation', conversation.pk,
          executive=str(executive.pk) if executive else None)
    if executive is not None:
        _notify(executive, 'Conversation assigned', conversation.subject, conversation)
    return conversation


@transaction.atomic
def claim(conversation, staff):
    conversation = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if conversation.assigned_to_id and conversation.assigned_to_id != staff.pk:
        raise CareError('already_assigned', 'This conversation is already assigned.', 409)
    if conversation.assigned_to_id != staff.pk:
        _assign(conversation, staff, staff, reason='Claimed')
    return conversation


def set_follow_up(conversation, staff, when, note=''):
    conversation.follow_up_at = when
    conversation.follow_up_note = str(note or '')[:300]
    conversation.follow_up_reminded_at = None
    conversation.save(update_fields=['follow_up_at', 'follow_up_note', 'follow_up_reminded_at', 'updated_at'])
    log_event(conversation, staff, 'follow_up_set', at=when.isoformat() if when else None)
    return conversation


def add_note(conversation, staff, body):
    note = InternalNote.objects.create(conversation=conversation, author=staff, body=clean_body(body))
    log_event(conversation, staff, 'note_added')
    return note


def mark_read_by_staff(conversation):
    Conversation.objects.filter(pk=conversation.pk).update(staff_unread_count=0)


# ----------------------------------------------------------------------- notifications


def _notify(recipient, title, message, conversation):
    """In-app notification; a failure is logged, never raised (and never includes message bodies)."""
    try:
        from apps.notifications.models import NotificationType
        from apps.notifications.services import create_notification
        create_notification(recipient=recipient, title=title, message=message[:200],
                            notification_type=NotificationType.SUPPORT, icon='headset',
                            url=f'/dashboard/customer-care?conversation={conversation.pk}')
    except Exception:  # noqa: BLE001
        logger.exception('Customer Care notification failed (conversation %s)', conversation.pk)


def _notify_customer(conversation, staff):
    _notify(conversation.customer, 'Reply from EduIgnite Customer Care', conversation.subject, conversation)


def _notify_staff_new_message(conversation):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    if conversation.assigned_to_id:
        recipients = [conversation.assigned_to]
    else:
        recipients = list(User.objects.filter(role__in=['CEO', 'CTO'], is_active=True))
    for r in recipients:
        _notify(r, 'New customer message', conversation.subject, conversation)

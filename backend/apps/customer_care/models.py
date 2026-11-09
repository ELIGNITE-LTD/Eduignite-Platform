"""Customer Care: conversations between EduIgnite customers and the Customer Care team.

Design notes
------------
* A *customer* is an existing ``users.User`` (the school is read from
  ``user.school``): no parallel customer table.
* Access for staff is the executive module ``customer_care`` stored in
  ``User.allowed_modules`` (single source of truth); CEO and CTO always have it.
* Delivery statuses are honest: see ``DeliveryStatus`` and ``Message.transition``.
  WhatsApp click-to-chat is NEVER ``sent``/``delivered``/``read``: a person has to
  press send in WhatsApp, so only manually recorded outcomes exist for it.
"""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# --------------------------------------------------------------------------- groups


class CustomerGroup(TimeStamped):
    """A class of customers (A schools, B learners, C partners, extensible)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=300, blank=True, default='')
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=100)
    # Rule mapping users to this group: the user's role is in ``rule_roles``.
    rule_roles = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name

    @classmethod
    def for_user(cls, user):
        """The first active group whose role rule matches ``user`` (or None)."""
        role = str(getattr(user, 'role', '') or '').upper()
        for group in cls.objects.filter(is_active=True).order_by('sort_order', 'name'):
            roles = [str(r).upper() for r in (group.rule_roles or [])]
            if role in roles:
                return group
        return None


class GroupAssignment(TimeStamped):
    """An executive handles a customer group. History is kept: ending sets ``ended_at``."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(CustomerGroup, on_delete=models.CASCADE, related_name='assignments')
    executive = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                  related_name='care_group_assignments')
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='+')
    is_active = models.BooleanField(default=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    ended_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['group', 'executive'], condition=Q(is_active=True),
                                    name='cc_unique_active_group_assignment'),
        ]


# ---------------------------------------------------------------------- conversations


class ConversationStatus(models.TextChoices):
    NEW = 'new', 'New'
    OPEN = 'open', 'Open'
    IN_PROGRESS = 'in_progress', 'In progress'
    AWAITING_CUSTOMER = 'awaiting_customer', 'Awaiting customer response'
    AWAITING_INTERNAL = 'awaiting_internal', 'Awaiting internal action'
    RESOLVED = 'resolved', 'Resolved'
    CLOSED = 'closed', 'Closed'


class Channel(models.TextChoices):
    IN_APP = 'in_app', 'In-app'
    EMAIL = 'email', 'Email'
    WHATSAPP = 'whatsapp', 'WhatsApp'


class Conversation(TimeStamped):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                 related_name='care_conversations')
    # Copied from the customer at creation so history survives a transfer.
    school = models.ForeignKey('schools.School', null=True, blank=True, on_delete=models.SET_NULL,
                               related_name='care_conversations')
    group = models.ForeignKey(CustomerGroup, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='conversations')
    subject = models.CharField(max_length=200)
    category = models.CharField(max_length=60, blank=True, default='general')
    status = models.CharField(max_length=24, choices=ConversationStatus.choices,
                              default=ConversationStatus.NEW, db_index=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='care_assigned_conversations')
    primary_channel = models.CharField(max_length=16, choices=Channel.choices, default=Channel.IN_APP)
    channels = models.JSONField(default=list, blank=True)
    follow_up_at = models.DateTimeField(null=True, blank=True, db_index=True)
    follow_up_note = models.CharField(max_length=300, blank=True, default='')
    follow_up_reminded_at = models.DateTimeField(null=True, blank=True)
    resolution_summary = models.TextField(blank=True, default='')
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(default=timezone.now, db_index=True)
    customer_unread_count = models.PositiveIntegerField(default=0)
    staff_unread_count = models.PositiveIntegerField(default=0)
    # WhatsApp: consent and the 24h customer-service window (official API only).
    whatsapp_opt_in = models.BooleanField(default=False)
    whatsapp_opt_in_at = models.DateTimeField(null=True, blank=True)
    last_customer_message_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-last_activity_at']
        indexes = [
            models.Index(fields=['status', 'last_activity_at']),
            models.Index(fields=['customer', 'last_activity_at']),
            models.Index(fields=['group', 'assigned_to']),
        ]

    def __str__(self):
        return f'{self.subject} ({self.status})'

    @property
    def is_finished(self):
        return self.status in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED)

    def add_channel(self, channel):
        if channel not in (self.channels or []):
            self.channels = [*(self.channels or []), channel]


class ConversationAssignment(TimeStamped):
    """Who handled a conversation, and when. Reassigning ends the old row (history kept)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='assignments')
    executive = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='+')
    reason = models.CharField(max_length=200, blank=True, default='')
    is_active = models.BooleanField(default=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    ended_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['conversation'], condition=Q(is_active=True),
                                    name='cc_one_active_assignment_per_conversation'),
        ]


# ------------------------------------------------------------------------- messages


class Direction(models.TextChoices):
    INBOUND = 'inbound', 'Inbound (from the customer)'
    OUTBOUND = 'outbound', 'Outbound (from Customer Care)'


class DeliveryStatus(models.TextChoices):
    # in-app
    STORED = 'stored', 'Stored'
    # email
    DRAFT = 'draft', 'Draft'
    QUEUED = 'queued', 'Queued'
    SENT_TO_PROVIDER = 'sent_to_provider', 'Accepted by email provider'
    DELIVERED = 'delivered', 'Delivered'
    FAILED = 'failed', 'Failed'
    BOUNCED = 'bounced', 'Bounced'
    # whatsapp click-to-chat (manual, never auto-sent)
    PREPARED = 'prepared_awaiting_manual_send', 'Prepared, awaiting manual send'
    OPENED = 'opened_delivery_unconfirmed', 'WhatsApp opened, delivery unconfirmed'
    SENT_MANUALLY = 'sent_manually', 'Sent manually (recorded by executive)'
    NOT_SENT = 'not_sent', 'Not sent (recorded by executive)'
    FOLLOW_UP = 'follow_up_required', 'Follow-up required'
    # whatsapp official API (provider events only)
    SENT = 'sent', 'Sent (provider event)'
    READ = 'read', 'Read (provider event)'


class DeliverySource(models.TextChoices):
    SYSTEM = 'system', 'System'
    MANUAL = 'manual', 'Manual (recorded by a person)'
    PROVIDER = 'provider', 'Provider event'


EMAIL_STATUSES = {'draft', 'queued', 'sent_to_provider', 'delivered', 'failed', 'bounced'}
INAPP_STATUSES = {'stored'}
WHATSAPP_MANUAL_STATUSES = {'prepared_awaiting_manual_send', 'opened_delivery_unconfirmed',
                            'sent_manually', 'not_sent', 'follow_up_required'}
WHATSAPP_PROVIDER_STATUSES = {'sent', 'delivered', 'read', 'failed'}

EMAIL_TRANSITIONS = {
    'draft': {'queued', 'failed'},
    'queued': {'sent_to_provider', 'failed'},
    'sent_to_provider': {'delivered', 'bounced', 'failed'},
    'failed': {'queued'},  # explicit retry only
    'delivered': set(),
    'bounced': set(),
}
WHATSAPP_MANUAL_TRANSITIONS = {
    'prepared_awaiting_manual_send': {'opened_delivery_unconfirmed', 'sent_manually', 'not_sent',
                                      'follow_up_required'},
    'opened_delivery_unconfirmed': {'sent_manually', 'not_sent', 'follow_up_required'},
    'follow_up_required': {'sent_manually', 'not_sent'},
    'sent_manually': set(),
    'not_sent': set(),
}
WHATSAPP_PROVIDER_TRANSITIONS = {
    'queued': {'sent', 'failed'},
    'sent': {'delivered', 'read', 'failed'},
    'delivered': {'read'},
    'read': set(),
    'failed': set(),
}


class InvalidStatusTransition(ValueError):
    pass


class Message(models.Model):
    """One message in a conversation, on exactly one channel."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name='+')
    direction = models.CharField(max_length=10, choices=Direction.choices)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.IN_APP)
    body = models.TextField()
    # Header identity, derived server-side from the sender's account at send time.
    sender_name = models.CharField(max_length=200, blank=True, default='')
    sender_role_label = models.CharField(max_length=100, blank=True, default='')
    sender_avatar = models.TextField(blank=True, default='')
    is_official_representative = models.BooleanField(default=False)
    # Idempotency: the client repeats the same id on a retry.
    client_message_id = models.CharField(max_length=80, blank=True, default='')
    delivery_status = models.CharField(max_length=40, choices=DeliveryStatus.choices,
                                       default=DeliveryStatus.STORED)
    delivery_source = models.CharField(max_length=10, choices=DeliverySource.choices,
                                       default=DeliverySource.SYSTEM)
    provider = models.CharField(max_length=30, blank=True, default='')
    provider_message_id = models.CharField(max_length=200, blank=True, default='', db_index=True)
    recipient = models.CharField(max_length=254, blank=True, default='')
    error_code = models.CharField(max_length=60, blank=True, default='')
    attempts = models.PositiveSmallIntegerField(default=0)
    send_claimed_at = models.DateTimeField(null=True, blank=True)
    delivery_updated_at = models.DateTimeField(null=True, blank=True)
    redacted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        indexes = [models.Index(fields=['conversation', 'id'])]
        constraints = [
            models.UniqueConstraint(fields=['conversation', 'sender', 'client_message_id'],
                                    condition=~Q(client_message_id=''),
                                    name='cc_unique_client_message_id'),
        ]

    def __str__(self):
        return f'{self.channel}/{self.direction} #{self.pk}'

    def transition(self, new_status, *, source=DeliverySource.SYSTEM, detail='', error_code=''):
        """Move to ``new_status`` honestly or raise ``InvalidStatusTransition``."""
        new_status = str(new_status)
        old = self.delivery_status
        if new_status == old:
            return self
        if self.channel == Channel.WHATSAPP:
            if source == DeliverySource.PROVIDER:
                allowed = WHATSAPP_PROVIDER_TRANSITIONS.get(old, set())
            else:
                allowed = WHATSAPP_MANUAL_TRANSITIONS.get(old, set())
        elif self.channel == Channel.EMAIL:
            allowed = EMAIL_TRANSITIONS.get(old, set())
            if new_status in ('delivered', 'bounced') and source != DeliverySource.PROVIDER:
                raise InvalidStatusTransition('Delivered/bounced only come from provider events.')
        else:
            allowed = set()
        if new_status not in allowed:
            raise InvalidStatusTransition(f'Cannot move {self.channel} message {old} -> {new_status}.')
        self.delivery_status = new_status
        self.delivery_source = source
        self.delivery_updated_at = timezone.now()
        if error_code:
            self.error_code = error_code[:60]
        self.save(update_fields=['delivery_status', 'delivery_source', 'delivery_updated_at', 'error_code'])
        DeliveryEvent.objects.create(message=self, status=new_status, source=source, detail=detail[:300])
        return self


class DeliveryEvent(models.Model):
    """Append-only history of a message's delivery status changes."""

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='delivery_events')
    status = models.CharField(max_length=40)
    source = models.CharField(max_length=10, choices=DeliverySource.choices)
    detail = models.CharField(max_length=300, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']


class InternalNote(models.Model):
    """Staff-only note. Never serialised on any customer endpoint."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='internal_notes')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class ConversationEvent(models.Model):
    """Timeline entry (staff-visible): status change, assignment, reply, follow-up..."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='events')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='+')
    kind = models.CharField(max_length=40)
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']


class AuditLog(models.Model):
    """Audit trail for Customer Care administration (access, groups, contact info)."""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='+')
    action = models.CharField(max_length=60, db_index=True)
    target_type = models.CharField(max_length=40, blank=True, default='')
    target_id = models.CharField(max_length=64, blank=True, default='')
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-id']


# ---------------------------------------------------------------------------- WhatsApp


class WhatsAppWebhookEvent(models.Model):
    """Dedupe table: a provider event id is processed at most once."""

    provider = models.CharField(max_length=30)
    event_id = models.CharField(max_length=200)
    processed = models.BooleanField(default=False)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['provider', 'event_id'], name='cc_unique_wa_event')]


class WhatsAppTemplate(TimeStamped):
    """Placeholder for provider-approved message templates (official API only)."""

    name = models.CharField(max_length=100)
    language = models.CharField(max_length=10, default='en')
    body = models.TextField(blank=True, default='')
    is_approved = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['name', 'language'], name='cc_unique_wa_template')]


# ------------------------------------------------------------------ public contact info


class ContactKind(models.TextChoices):
    EMAIL = 'email', 'Customer care email'
    PHONE = 'phone', 'Customer care phone'
    WHATSAPP = 'whatsapp', 'WhatsApp number'
    ADDRESS = 'address', 'Address'
    WEBSITE = 'website', 'Website'
    FACEBOOK = 'facebook', 'Facebook'
    INSTAGRAM = 'instagram', 'Instagram'
    LINKEDIN = 'linkedin', 'LinkedIn'
    YOUTUBE = 'youtube', 'YouTube'
    OTHER = 'other', 'Other link'


class ContactInfoItem(TimeStamped):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=20, choices=ContactKind.choices)
    label = models.CharField(max_length=80)
    value = models.CharField(max_length=500)
    is_active = models.BooleanField(default=True)
    display_mode = models.CharField(max_length=10, default='icon_text',
                                    choices=[('icon_only', 'Icon only'), ('icon_text', 'Icon and text')])
    sort_order = models.PositiveIntegerField(default=100)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['sort_order', 'created_at']

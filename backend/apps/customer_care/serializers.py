"""Explicit response builders. Customer builders never include staff-only data
(internal notes, timeline, assignment history, assignee identity beyond the message header)."""

from apps.users.role_labels import role_display

from .models import Channel, DeliveryStatus

# Outbound messages a customer can see: in-app, or sent/accepted by a channel.
# A prepared / opened / not-sent WhatsApp message was never delivered, so it is hidden.
CUSTOMER_VISIBLE_STATUSES = {
    DeliveryStatus.STORED, DeliveryStatus.SENT_TO_PROVIDER, DeliveryStatus.DELIVERED,
    DeliveryStatus.SENT_MANUALLY, DeliveryStatus.SENT, DeliveryStatus.READ,
}


def customer_visible_messages(qs):
    from django.db.models import Q

    return qs.filter(Q(direction='inbound') | Q(delivery_status__in=[s.value for s in CUSTOMER_VISIBLE_STATUSES]))


def _iso(value):
    return value.isoformat() if value else None


def customer_message(m):
    return {
        'id': m.pk, 'conversation_id': str(m.conversation_id), 'direction': m.direction, 'channel': m.channel,
        'body': m.body, 'created_at': _iso(m.created_at),
        'sender': {
            'name': m.sender_name, 'role_label': m.sender_role_label,
            'avatar': m.sender_avatar or None,
            'official_label': 'Official EduIgnite Representative' if m.is_official_representative else None,
            'is_customer': m.direction == 'inbound',
        },
    }


def customer_conversation(c):
    return {
        'id': str(c.id), 'subject': c.subject, 'category': c.category, 'status': c.status,
        'created_at': _iso(c.created_at), 'last_activity_at': _iso(c.last_activity_at),
        'unread_count': c.customer_unread_count,
        'resolution_summary': c.resolution_summary if c.is_finished else '',
        'is_closed': c.status == 'closed',
    }


def _person(user):
    if not user:
        return None
    return {'id': str(user.pk), 'name': user.get_full_name(), 'role': user.role, 'role_label': role_display(user)}


def staff_message(m):
    data = customer_message(m)
    data.update({
        'delivery_status': m.delivery_status, 'delivery_source': m.delivery_source,
        'provider': m.provider, 'recipient': m.recipient, 'error_code': m.error_code,
        'attempts': m.attempts, 'sender_id': str(m.sender_id) if m.sender_id else None,
        'is_manual_status': m.delivery_source == 'manual',
        'delivery_updated_at': _iso(m.delivery_updated_at),
    })
    return data


def staff_conversation(c):
    from django.utils import timezone

    customer = c.customer
    return {
        'id': str(c.id), 'subject': c.subject, 'category': c.category, 'status': c.status,
        'customer': {
            'id': str(customer.pk), 'name': customer.get_full_name(), 'role': customer.role,
            'role_label': role_display(customer), 'email': customer.email or '',
            'phone': customer.phone or '', 'whatsapp': customer.whatsapp or '',
        },
        'school': {'id': c.school_id, 'name': c.school.name} if c.school_id else None,
        'group': {'id': str(c.group_id), 'slug': c.group.slug, 'name': c.group.name} if c.group_id else None,
        'assigned_to': _person(c.assigned_to),
        'primary_channel': c.primary_channel, 'channels': c.channels or [],
        'follow_up_at': _iso(c.follow_up_at), 'follow_up_note': c.follow_up_note,
        'is_follow_up_overdue': bool(c.follow_up_at and c.follow_up_at < timezone.now() and not c.is_finished),
        'resolution_summary': c.resolution_summary, 'resolved_at': _iso(c.resolved_at),
        'closed_at': _iso(c.closed_at), 'created_at': _iso(c.created_at),
        'last_activity_at': _iso(c.last_activity_at), 'unread_count': c.staff_unread_count,
    }


def staff_note(n):
    return {'id': str(n.id), 'body': n.body, 'author': _person(n.author), 'created_at': _iso(n.created_at)}


def staff_event(e):
    return {'id': e.pk, 'kind': e.kind, 'data': e.data, 'actor': _person(e.actor), 'created_at': _iso(e.created_at)}


def group(g, with_executives=False):
    data = {'id': str(g.id), 'slug': g.slug, 'name': g.name, 'description': g.description,
            'is_active': g.is_active, 'rule_roles': g.rule_roles or [], 'sort_order': g.sort_order}
    if with_executives:
        data['executives'] = [
            {'assignment_id': str(a.id), 'executive': _person(a.executive), 'assigned_at': _iso(a.created_at)}
            for a in g.assignments.filter(is_active=True).select_related('executive')
        ]
    return data


def contact_item(i):
    return {'id': str(i.id), 'kind': i.kind, 'label': i.label, 'value': i.value, 'is_active': i.is_active,
            'display_mode': i.display_mode, 'sort_order': i.sort_order, 'updated_at': _iso(i.updated_at)}


def audit_entry(a):
    return {'id': a.pk, 'action': a.action, 'target_type': a.target_type, 'target_id': a.target_id,
            'data': a.data, 'actor': _person(a.actor), 'created_at': _iso(a.created_at)}


CHANNELS = [c.value for c in Channel]

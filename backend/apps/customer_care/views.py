"""Customer Care API. See the contract file for the full list of endpoints.

Isolation is enforced here, server-side: customer views only ever query
``customer_conversations(request.user)``; staff views only ever query
``visible_conversations(request.user)``. An id outside that set answers 404.
"""

import json
import logging

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import status as http
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from core.pagination import StandardResultsSetPagination

from . import contact, emailing, serializers as ser, services, whatsapp
from .access import (
    CustomerCareModule, IsFounder, customer_conversations, has_customer_care_access, is_founder,
    visible_conversations,
)
from .models import (
    Channel, ContactInfoItem, Conversation, ConversationStatus, CustomerGroup, DeliverySource, DeliveryStatus,
    GroupAssignment, InvalidStatusTransition, Message, WhatsAppWebhookEvent,
)
from .services import CareError

logger = logging.getLogger(__name__)
User = get_user_model()


class CustomerMessageBurstThrottle(UserRateThrottle):
    scope = 'customer_care_burst'

    def get_rate(self):
        return '6/min'


class CustomerMessageHourlyThrottle(UserRateThrottle):
    scope = 'customer_care_hourly'

    def get_rate(self):
        return '60/hour'


class CareView(APIView):
    """Turns ``CareError`` into a clean JSON error."""

    def handle_exception(self, exc):
        if isinstance(exc, CareError):
            return Response({'code': exc.code, 'detail': exc.message}, status=exc.status)
        return super().handle_exception(exc)

    def paginate(self, request, qs, builder):
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([builder(x) for x in page])


def _body(request, *names):
    data = request.data if hasattr(request.data, 'get') else {}
    return [data.get(n) for n in names]


# ============================================================ customer-side API


class MyConversationsView(CareView):
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.request.method == 'POST':
            return [CustomerMessageBurstThrottle(), CustomerMessageHourlyThrottle()]
        return super().get_throttles()

    def get(self, request):
        qs = customer_conversations(request.user).order_by('-last_activity_at')
        st = request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        return self.paginate(request, qs, ser.customer_conversation)

    def post(self, request):
        subject, body, category, cid = _body(request, 'subject', 'body', 'category', 'client_message_id')
        conversation = services.create_conversation(request.user, subject=subject, body=body,
                                                    category=category or 'general', client_message_id=cid or '')
        return Response(ser.customer_conversation(conversation), status=http.HTTP_201_CREATED)


class MyConversationDetailView(CareView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        c = get_object_or_404(customer_conversations(request.user), pk=pk)
        return Response(ser.customer_conversation(c))


class MyMessagesView(CareView):
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.request.method == 'POST':
            return [CustomerMessageBurstThrottle(), CustomerMessageHourlyThrottle()]
        return super().get_throttles()

    def get(self, request, pk):
        c = get_object_or_404(customer_conversations(request.user), pk=pk)
        qs = ser.customer_visible_messages(Message.objects.filter(conversation=c))
        since = request.query_params.get('since_id')
        if since:
            try:
                qs = qs.filter(id__gt=int(since))
            except ValueError:
                raise CareError('invalid_since_id', 'since_id must be a number.')
        return self.paginate(request, qs.order_by('id'), ser.customer_message)

    def post(self, request, pk):
        c = get_object_or_404(customer_conversations(request.user), pk=pk)
        body, cid = _body(request, 'body', 'client_message_id')
        message, created = services.add_customer_message(c, request.user, body, cid or '')
        return Response(ser.customer_message(message), status=http.HTTP_201_CREATED if created else http.HTTP_200_OK)


class MyReadView(CareView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        c = get_object_or_404(customer_conversations(request.user), pk=pk)
        services.mark_read_by_customer(c)
        return Response({'unread_count': 0})


class MyUnreadView(CareView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = customer_conversations(request.user)
        total = sum(qs.values_list('customer_unread_count', flat=True))
        return Response({'unread_total': total, 'conversations_with_unread': qs.filter(
            customer_unread_count__gt=0).count()})


# =============================================================== staff-side API


def staff_conversation_or_404(request, pk):
    qs = visible_conversations(request.user).select_related('customer', 'school', 'group', 'assigned_to')
    return get_object_or_404(qs, pk=pk)


class StaffView(CareView):
    permission_classes = [IsAuthenticated, CustomerCareModule]


class MeView(CareView):
    """Lets the UI decide what to show. Never a substitute for server checks."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'has_access': has_customer_care_access(request.user),
                         'is_founder': is_founder(request.user),
                         'can_manage': is_founder(request.user), 'module': 'customer_care'})


class OverviewView(StaffView):
    def get(self, request):
        qs = visible_conversations(request.user)
        now = timezone.now()
        open_statuses = [ConversationStatus.OPEN, ConversationStatus.IN_PROGRESS]
        unfinished = qs.exclude(status__in=[ConversationStatus.RESOLVED, ConversationStatus.CLOSED])
        agg = qs.aggregate(
            total=Count('id'),
            new=Count('id', filter=Q(status=ConversationStatus.NEW)),
            unassigned=Count('id', filter=Q(assigned_to__isnull=True)),
            open=Count('id', filter=Q(status__in=open_statuses)),
            awaiting_customer=Count('id', filter=Q(status=ConversationStatus.AWAITING_CUSTOMER)),
            awaiting_internal=Count('id', filter=Q(status=ConversationStatus.AWAITING_INTERNAL)),
            resolved=Count('id', filter=Q(status=ConversationStatus.RESOLVED)),
            closed=Count('id', filter=Q(status=ConversationStatus.CLOSED)),
            unread=Count('id', filter=Q(staff_unread_count__gt=0)),
        )
        agg['overdue_follow_ups'] = unfinished.filter(follow_up_at__lt=now).count()
        agg['active_executives'] = User.objects.filter(
            is_active=True, allowed_modules__contains=['customer_care']).exclude(role__in=['CEO', 'CTO']).count()
        return Response(agg)


class ConversationListView(StaffView):
    def get(self, request):
        p = request.query_params
        qs = visible_conversations(request.user).select_related('customer', 'school', 'group', 'assigned_to')
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('group'):
            qs = qs.filter(group__slug=p['group'])
        assignee = p.get('assignee')
        if assignee == 'unassigned':
            qs = qs.filter(assigned_to__isnull=True)
        elif assignee == 'me':
            qs = qs.filter(assigned_to=request.user)
        elif assignee:
            try:
                qs = qs.filter(assigned_to_id=assignee)
            except (ValueError, ValidationError):
                qs = qs.none()
        if p.get('channel'):
            qs = qs.filter(channels__contains=[p['channel']])
        if p.get('q'):
            q = p['q'].strip()[:100]
            qs = qs.filter(Q(customer__name__icontains=q) | Q(customer__matricule__icontains=q) |
                           Q(subject__icontains=q) | Q(school__name__icontains=q))
        if p.get('date_from') and parse_date(p['date_from']):
            qs = qs.filter(created_at__date__gte=parse_date(p['date_from']))
        if p.get('date_to') and parse_date(p['date_to']):
            qs = qs.filter(created_at__date__lte=parse_date(p['date_to']))
        if p.get('overdue') in ('1', 'true'):
            qs = qs.filter(follow_up_at__lt=timezone.now()).exclude(
                status__in=[ConversationStatus.RESOLVED, ConversationStatus.CLOSED])
        if p.get('unread') in ('1', 'true'):
            qs = qs.filter(staff_unread_count__gt=0)
        return self.paginate(request, qs.order_by('-last_activity_at'), ser.staff_conversation)


class ConversationDetailView(StaffView):
    def get(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        data = ser.staff_conversation(c)
        data['notes'] = [ser.staff_note(n) for n in c.internal_notes.select_related('author')]
        data['timeline'] = [ser.staff_event(e) for e in c.events.select_related('actor')]
        data['assignment_history'] = [
            {'id': str(a.id), 'executive': ser._person(a.executive), 'assigned_by': ser._person(a.assigned_by),
             'reason': a.reason, 'is_active': a.is_active, 'assigned_at': ser._iso(a.created_at),
             'ended_at': ser._iso(a.ended_at)}
            for a in c.assignments.select_related('executive', 'assigned_by')
        ]
        return Response(data)


class StaffMessagesView(StaffView):
    def get(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        qs = Message.objects.filter(conversation=c)
        since = request.query_params.get('since_id')
        if since:
            try:
                qs = qs.filter(id__gt=int(since))
            except ValueError:
                raise CareError('invalid_since_id', 'since_id must be a number.')
        return self.paginate(request, qs.order_by('id'), ser.staff_message)

    def post(self, request, pk):
        """Reply on in_app or email. (WhatsApp: whatsapp/prepare/.)"""
        c = staff_conversation_or_404(request, pk)
        body, channel, cid = _body(request, 'body', 'channel', 'client_message_id')
        message, created = services.staff_reply(c, request.user, body=body, channel=channel or Channel.IN_APP,
                                                client_message_id=cid or '')
        message.refresh_from_db()
        return Response(ser.staff_message(message), status=http.HTTP_201_CREATED if created else http.HTTP_200_OK)


class RetryEmailView(StaffView):
    def post(self, request, pk, message_id):
        c = staff_conversation_or_404(request, pk)
        m = get_object_or_404(Message, pk=message_id, conversation=c, channel=Channel.EMAIL)
        if m.delivery_status != DeliveryStatus.FAILED:
            raise CareError('not_failed', 'Only a failed email can be retried.', 409)
        if not emailing.email_config_status()['configured']:
            raise CareError('email_not_configured', 'Email sending is not configured. Nothing was sent.', 503)
        m.transition(DeliveryStatus.QUEUED, detail='Manual retry')
        Message.objects.filter(pk=m.pk).update(attempts=0, send_claimed_at=None)
        services.dispatch_email(m.pk)
        m.refresh_from_db()
        return Response(ser.staff_message(m))


class WhatsAppPrepareView(StaffView):
    def post(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        body, cid = _body(request, 'body', 'client_message_id')
        message, url, created = services.prepare_whatsapp(c, request.user, body=body, client_message_id=cid or '')
        return Response({'message': ser.staff_message(message), 'whatsapp_url': url,
                         'status_note': 'Prepared only. WhatsApp must be opened and the message sent '
                                        'manually; delivery cannot be confirmed.'},
                        status=http.HTTP_201_CREATED if created else http.HTTP_200_OK)


class WhatsAppOutcomeView(StaffView):
    """Record what happened: opened_delivery_unconfirmed | sent_manually | not_sent | follow_up_required."""

    def post(self, request, pk, message_id):
        c = staff_conversation_or_404(request, pk)
        m = get_object_or_404(Message, pk=message_id, conversation=c, channel=Channel.WHATSAPP)
        outcome, note = _body(request, 'outcome', 'note')
        m = services.record_whatsapp_outcome(m, request.user, str(outcome or ''), note or '')
        return Response(ser.staff_message(m))


class StatusView(StaffView):
    def post(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        status_value, summary = _body(request, 'status', 'resolution_summary')
        return Response(ser.staff_conversation(services.set_status(c, request.user, status_value, summary or '')))


class ResolveView(StaffView):
    def post(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        (summary,) = _body(request, 'resolution_summary')
        return Response(ser.staff_conversation(
            services.set_status(c, request.user, ConversationStatus.RESOLVED, summary or '')))


class ReopenView(StaffView):
    def post(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        return Response(ser.staff_conversation(services.reopen(c, request.user)))


class FollowUpView(StaffView):
    def post(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        raw, note = _body(request, 'follow_up_at', 'note')
        when = None
        if raw:
            when = parse_datetime(str(raw))
            if when is None:
                raise CareError('invalid_date', 'follow_up_at must be an ISO 8601 date-time.')
            if timezone.is_naive(when):
                when = timezone.make_aware(when)
        return Response(ser.staff_conversation(services.set_follow_up(c, request.user, when, note or '')))


class NotesView(StaffView):
    def get(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        return Response([ser.staff_note(n) for n in c.internal_notes.select_related('author')])

    def post(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        (body,) = _body(request, 'body')
        return Response(ser.staff_note(services.add_note(c, request.user, body)), status=http.HTTP_201_CREATED)


class StaffReadView(StaffView):
    def post(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        services.mark_read_by_staff(c)
        return Response({'unread_count': 0})


class ClaimView(StaffView):
    def post(self, request, pk):
        c = staff_conversation_or_404(request, pk)
        return Response(ser.staff_conversation(services.claim(c, request.user)))


class AssignView(CareView):
    """Founders only: assign or unassign (executive_id null)."""

    permission_classes = [IsAuthenticated, IsFounder]

    def post(self, request, pk):
        c = get_object_or_404(Conversation.objects.select_related('customer', 'school', 'group', 'assigned_to'), pk=pk)
        executive_id, reason = _body(request, 'executive_id', 'reason')
        executive = None
        if executive_id:
            try:
                executive = User.objects.get(pk=executive_id, is_active=True)
            except (User.DoesNotExist, ValueError, ValidationError):
                raise CareError('executive_not_found', 'Executive not found.', 404)
        c = services.assign(c, request.user, executive, reason or '')
        return Response(ser.staff_conversation(c))


# ------------------------------------------------------------- groups and executives


class GroupListView(CareView):
    permission_classes = [IsAuthenticated, CustomerCareModule]

    def get(self, request):
        qs = CustomerGroup.objects.all()
        if not is_founder(request.user):
            qs = qs.filter(assignments__executive=request.user, assignments__is_active=True,
                           is_active=True).distinct()
        return Response([ser.group(g, with_executives=is_founder(request.user)) for g in qs])

    def post(self, request):
        if not is_founder(request.user):
            raise CareError('forbidden', 'Only the CEO or CTO can do this.', 403)
        return _save_group(request, None)


class GroupDetailView(CareView):
    permission_classes = [IsAuthenticated, IsFounder]

    def patch(self, request, pk):
        return _save_group(request, get_object_or_404(CustomerGroup, pk=pk))


def _save_group(request, group):
    data = request.data
    creating = group is None
    group = group or CustomerGroup()
    for field in ('slug', 'name', 'description'):
        if field in data:
            setattr(group, field, str(data[field] or '').strip())
    if 'is_active' in data:
        group.is_active = bool(data['is_active'])
    if 'sort_order' in data:
        group.sort_order = int(data['sort_order'] or 100)
    if 'rule_roles' in data:
        roles = data['rule_roles']
        if not isinstance(roles, list):
            raise CareError('invalid_rule_roles', 'rule_roles must be a list of role keys.')
        valid = {r for r, _ in User._meta.get_field('role').choices}
        bad = [r for r in roles if str(r).upper() not in valid]
        if bad:
            raise CareError('invalid_rule_roles', f'Unknown roles: {bad}')
        group.rule_roles = [str(r).upper() for r in roles]
    if not group.name or not group.slug:
        raise CareError('missing_fields', 'name and slug are required.')
    if creating and CustomerGroup.objects.filter(slug=group.slug).exists():
        raise CareError('duplicate_slug', 'A group with this slug exists.', 409)
    group.save()
    services.audit(request.user, 'group_created' if creating else 'group_updated', 'group', group.pk,
                   slug=group.slug)
    return Response(ser.group(group, with_executives=True), status=http.HTTP_201_CREATED if creating else 200)


class GroupAssignmentsView(CareView):
    permission_classes = [IsAuthenticated, IsFounder]

    def post(self, request, pk):
        group = get_object_or_404(CustomerGroup, pk=pk)
        (executive_id,) = _body(request, 'executive_id')
        try:
            executive = User.objects.get(pk=executive_id, is_active=True)
        except (User.DoesNotExist, ValueError, ValidationError):
            raise CareError('executive_not_found', 'Executive not found.', 404)
        if is_founder(executive) or not has_customer_care_access(executive):
            raise CareError('executive_without_access', 'That person does not have Customer Care access.')
        assignment, created = GroupAssignment.objects.get_or_create(
            group=group, executive=executive, is_active=True, defaults={'assigned_by': request.user})
        if created:
            services.audit(request.user, 'group_assigned', 'group', group.pk, executive=str(executive.pk))
        return Response(ser.group(group, with_executives=True), status=201 if created else 200)


class GroupAssignmentEndView(CareView):
    permission_classes = [IsAuthenticated, IsFounder]

    def delete(self, request, pk, assignment_id):
        a = get_object_or_404(GroupAssignment, pk=assignment_id, group_id=pk, is_active=True)
        a.is_active, a.ended_at, a.ended_by = False, timezone.now(), request.user
        a.save()
        services.audit(request.user, 'group_unassigned', 'group', pk, executive=str(a.executive_id))
        return Response(status=http.HTTP_204_NO_CONTENT)


class ExecutivesView(CareView):
    """Founders: executives who hold Customer Care access, for the assignment pickers."""

    permission_classes = [IsAuthenticated, IsFounder]

    def get(self, request):
        qs = User.objects.filter(is_active=True, allowed_modules__contains=['customer_care']).exclude(
            role__in=['CEO', 'CTO']).annotate(
            open_conversations=Count('care_assigned_conversations', filter=~Q(
                care_assigned_conversations__status__in=['resolved', 'closed']), distinct=True),
        ).order_by('name')
        return Response([{**ser._person(u), 'open_conversations': u.open_conversations,
                          'groups': [str(a.group_id) for a in u.care_group_assignments.filter(is_active=True)]}
                         for u in qs])


class AuditView(CareView):
    permission_classes = [IsAuthenticated, IsFounder]

    def get(self, request):
        from .models import AuditLog
        qs = AuditLog.objects.select_related('actor')
        if request.query_params.get('action'):
            qs = qs.filter(action=request.query_params['action'])
        return self.paginate(request, qs, ser.audit_entry)


# ------------------------------------------------------------ configuration status


class ConfigStatusView(CareView):
    """Founders: email and WhatsApp configuration. Never contains a secret."""

    permission_classes = [IsAuthenticated, IsFounder]

    def get(self, request):
        return Response({'email': emailing.email_config_status(), 'whatsapp': whatsapp.whatsapp_status()})


# ---------------------------------------------------------------- contact information


class PublicContactInfoView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        return Response({'items': contact.public_items()})


class ContactInfoListView(CareView):
    permission_classes = [IsAuthenticated, IsFounder]

    def get(self, request):
        return Response([ser.contact_item(i) for i in ContactInfoItem.objects.all()])

    def post(self, request):
        return _save_contact(request, None)


class ContactInfoDetailView(CareView):
    permission_classes = [IsAuthenticated, IsFounder]

    def patch(self, request, pk):
        return _save_contact(request, get_object_or_404(ContactInfoItem, pk=pk))

    def delete(self, request, pk):
        item = get_object_or_404(ContactInfoItem, pk=pk)
        services.audit(request.user, 'contact_info_deleted', 'contact_info', item.pk, kind=item.kind,
                       label=item.label)
        item.delete()
        contact.invalidate_public_cache()
        return Response(status=http.HTTP_204_NO_CONTENT)


def _save_contact(request, item):
    data = request.data
    creating = item is None
    item = item or ContactInfoItem()
    before = {} if creating else ser.contact_item(item)
    if 'kind' in data and creating:
        item.kind = str(data['kind'])
    if not item.kind or item.kind not in {k for k, _ in ContactInfoItem._meta.get_field('kind').choices}:
        raise CareError('invalid_kind', 'Unknown contact type.')
    for field in ('label', 'value'):
        if field in data:
            setattr(item, field, str(data[field] or '').strip())
    if 'is_active' in data:
        item.is_active = bool(data['is_active'])
    if 'display_mode' in data:
        if data['display_mode'] not in ('icon_only', 'icon_text'):
            raise CareError('invalid_display_mode', 'display_mode must be icon_only or icon_text.')
        item.display_mode = data['display_mode']
    if 'sort_order' in data:
        item.sort_order = int(data['sort_order'] or 100)
    if not item.label:
        raise CareError('missing_label', 'A label is required.')
    try:
        item.value = contact.clean_value(item.kind, item.value)
    except ValidationError as exc:
        raise CareError('invalid_value', ' '.join(exc.messages))
    item.updated_by = request.user
    item.save()
    contact.invalidate_public_cache()
    services.audit(request.user, 'contact_info_created' if creating else 'contact_info_updated', 'contact_info',
                   item.pk, kind=item.kind, label=item.label, before=before, after=ser.contact_item(item))
    return Response(ser.contact_item(item), status=http.HTTP_201_CREATED if creating else 200)


# ------------------------------------------------------------------ WhatsApp webhook


class WhatsAppWebhookView(APIView):
    """Placeholder for the official API's events. Does nothing until the API is configured and verified.

    Delivery states are only ever taken from signed provider events here.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):  # Meta verification handshake
        provider = whatsapp.OfficialApiProvider()
        if provider.config_state() == whatsapp.STATE_API_NOT_CONFIGURED:
            return Response({'detail': 'Official WhatsApp API is not configured.'}, status=503)
        _t, _p, secret, _v = provider._credentials()
        token = request.query_params.get('hub.verify_token', '')
        if request.query_params.get('hub.mode') == 'subscribe' and secret and token == secret:
            from django.http import HttpResponse
            return HttpResponse(request.query_params.get('hub.challenge', ''), content_type='text/plain')
        return Response(status=403)

    def post(self, request):
        provider = whatsapp.OfficialApiProvider()
        if provider.config_state() != whatsapp.STATE_API_VERIFIED:
            return Response({'detail': 'Official WhatsApp API is not configured.'}, status=503)
        if not provider.verify_signature(request.body, request.headers.get('X-Hub-Signature-256', '')):
            return Response(status=403)
        try:
            payload = json.loads(request.body or b'{}')
        except ValueError:
            return Response(status=400)
        handled = 0
        for entry in payload.get('entry', []) or []:
            for change in entry.get('changes', []) or []:
                for st in (change.get('value') or {}).get('statuses', []) or []:
                    event_id = f"{st.get('id', '')}:{st.get('status', '')}"[:200]
                    if not st.get('id') or not st.get('status'):
                        continue
                    _, new = WhatsAppWebhookEvent.objects.get_or_create(provider='official_api', event_id=event_id)
                    if not new:
                        continue  # duplicate delivery of the same event
                    msg = Message.objects.filter(provider_message_id=st['id'], channel=Channel.WHATSAPP).first()
                    if msg and st['status'] in ('sent', 'delivered', 'read', 'failed'):
                        try:
                            msg.transition(st['status'], source=DeliverySource.PROVIDER, detail='webhook')
                            handled += 1
                        except InvalidStatusTransition:
                            pass
                    WhatsAppWebhookEvent.objects.filter(provider='official_api', event_id=event_id).update(
                        processed=True)
        return Response({'handled': handled})

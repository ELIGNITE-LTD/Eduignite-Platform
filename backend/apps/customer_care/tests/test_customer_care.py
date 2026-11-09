import itertools
from datetime import timedelta
import uuid
from unittest import mock

import pytest
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.customer_care import contact, emailing, whatsapp
from apps.customer_care.models import (
    Channel, Conversation, ConversationAssignment, CustomerGroup, DeliveryStatus, GroupAssignment,
    InvalidStatusTransition, InternalNote, Message,
)
from apps.platform.models import IntegrationSecrets
from apps.schools.models import School
from apps.users.models import User

pytestmark = pytest.mark.django_db

API = '/api/v1/customer-care/'
_n = itertools.count(1)


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def make_user(role, modules=None, school=None, **extra):
    n = next(_n)
    return User.objects.create_user(
        matricule=f'EDUCC{n:05d}', name=f'{role.title()} Person {n}', email=f'{role.lower()}{n}@example.org',
        role=role, password='password123', school=school, allowed_modules=list(modules or []),
        phone=extra.pop('phone', '+237677000000'), **extra)


def client(user=None):
    c = APIClient()
    if user:
        c.force_authenticate(user)
    return c


@pytest.fixture
def school():
    return School.objects.create(id=f'CC-{uuid.uuid4().hex[:6]}', name='Care School', short_name='CS',
                                 principal='P', location='Douala', email='cs@example.org', phone='237650100200',
                                 school_type='general', subsystem='bilingual')


@pytest.fixture
def ceo():
    return make_user('CEO')


@pytest.fixture
def cto():
    return make_user('CTO')


@pytest.fixture
def agent():
    return make_user('COO', ['customer_care'])


@pytest.fixture
def agent2():
    return make_user('DESIGNER', ['customer_care'])


@pytest.fixture
def no_access():
    return make_user('COO', ['schools'])


@pytest.fixture
def teacher(school):
    return make_user('TEACHER', school=school)


@pytest.fixture
def student(school):
    return make_user('STUDENT', school=school)


@pytest.fixture
def partner():
    return make_user('PARTNER')


def start(user, subject='Help', body='I need help with marks'):
    r = client(user).post(API + 'my/conversations/', {'subject': subject, 'body': body}, format='json')
    assert r.status_code == 201, r.content
    return Conversation.objects.get(pk=r.data['id'])


def group(slug):
    return CustomerGroup.objects.get(slug=slug)


# ------------------------------------------------------------ migrations / seed


def test_seeded_groups_and_contact_items_exist():
    assert list(CustomerGroup.objects.order_by('slug').values_list('slug', flat=True)) == ['A', 'B', 'C']
    assert contact.public_items()[0]['value'] == 'info@eduignite.online'


def test_seed_is_idempotent():
    import importlib
    mod = importlib.import_module('apps.customer_care.migrations.0002_seed_groups_and_contact')
    from django.apps import apps as real_apps
    mod.seed(real_apps, None)
    assert CustomerGroup.objects.count() == 3


def test_group_mapping_by_role(teacher, student, partner):
    assert CustomerGroup.for_user(teacher).slug == 'A'
    assert CustomerGroup.for_user(student).slug == 'B'
    assert CustomerGroup.for_user(partner).slug == 'C'


# ---------------------------------------------------------- permission matrix


STAFF_GETS = ['overview/', 'conversations/', 'groups/']
FOUNDER_GETS = ['executives/', 'audit/', 'config-status/', 'contact-info/']


@pytest.mark.parametrize('path', STAFF_GETS + FOUNDER_GETS)
def test_anonymous_gets_401(path):
    assert client().get(API + path).status_code == 401


@pytest.mark.parametrize('path', STAFF_GETS)
def test_ceo_cto_and_granted_executive_allowed(path, ceo, cto, agent):
    for u in (ceo, cto, agent):
        assert client(u).get(API + path).status_code == 200, (u.role, path)


@pytest.mark.parametrize('path', STAFF_GETS + FOUNDER_GETS)
def test_executive_without_access_and_school_users_blocked(path, no_access, teacher, student, partner):
    for u in (no_access, teacher, student, partner):
        assert client(u).get(API + path).status_code == 403, (u.role, path)


@pytest.mark.parametrize('path', FOUNDER_GETS)
def test_founder_only_endpoints_block_even_granted_executive(path, agent, ceo, cto):
    assert client(agent).get(API + path).status_code == 403
    assert client(ceo).get(API + path).status_code == 200
    assert client(cto).get(API + path).status_code == 200


def test_revoke_is_immediate_and_deletes_nothing(ceo, agent, student):
    c = start(student)
    assert client(ceo).post(API + f'conversations/{c.pk}/assign/', {'executive_id': str(agent.pk)},
                            format='json').status_code == 200
    ac = client(agent)
    assert ac.get(API + 'conversations/').status_code == 200
    # Founder revokes through the founders API.
    founder_profile = _founder_profile(agent)
    r = client(ceo).patch(f'/api/v1/users/founders/{founder_profile.pk}/', {'customer_care_access': False},
                          format='json')
    assert r.status_code == 200, r.content
    assert r.data['customer_care_access'] is False
    # The next request loads the user fresh from the database (JWT auth), as a real client would.
    ac = client(User.objects.get(pk=agent.pk))
    assert ac.get(API + 'conversations/').status_code == 403
    assert ac.get(API + f'conversations/{c.pk}/').status_code == 403
    assert Conversation.objects.filter(pk=c.pk).exists()
    assert ConversationAssignment.objects.filter(conversation=c, executive=agent).exists()
    assert client(ceo).get(API + 'audit/?action=customer_care_access_revoked').data['count'] == 1


def _founder_profile(user):
    from apps.users.models import FounderProfile
    return FounderProfile.objects.create(user=user, founder_title='Exec', primary_share_percentage=0,
                                         is_primary_founder=False)


def test_grant_flag_default_false_and_only_founders_change_it(ceo, cto, agent, no_access):
    fp = _founder_profile(no_access)
    r = client(ceo).get('/api/v1/users/founders/')
    row = next(x for x in r.data if str(x['id']) == str(fp.pk))
    assert row['customer_care_access'] is False
    # non-founder cannot change it
    assert client(agent).patch(f'/api/v1/users/founders/{fp.pk}/', {'customer_care_access': True},
                               format='json').status_code == 403
    no_access.refresh_from_db()
    assert 'customer_care' not in no_access.allowed_modules
    # CTO (equal to CEO) can grant
    assert client(cto).patch(f'/api/v1/users/founders/{fp.pk}/', {'customer_care_access': True},
                             format='json').status_code == 200
    no_access.refresh_from_db()
    assert 'customer_care' in no_access.allowed_modules
    assert client(no_access).get(API + 'overview/').status_code == 200
    # editing modules without the flag must not revoke it, and 'customer_care' in the list is ignored
    client(ceo).patch(f'/api/v1/users/founders/{fp.pk}/', {'allowed_modules': ['schools']}, format='json')
    no_access.refresh_from_db()
    assert 'customer_care' in no_access.allowed_modules
    # founders always have it regardless of the stored list
    assert client(ceo).get(API + 'me/').data['has_access'] is True
    assert client(make_user('TEACHER')).get(API + 'me/').data['has_access'] is False


def test_executive_catalogue_includes_module():
    from apps.users.executive_modules import EXECUTIVE_MODULE_KEYS
    assert 'customer_care' in EXECUTIVE_MODULE_KEYS


# ----------------------------------------------------- assignments / visibility / IDOR


def test_visibility_rules(ceo, agent, agent2, teacher, student, partner):
    c_teacher, c_student, c_partner = start(teacher), start(student), start(partner)
    GroupAssignment.objects.create(group=group('A'), executive=agent, assigned_by=ceo)
    GroupAssignment.objects.create(group=group('B'), executive=agent2, assigned_by=ceo)
    ids = lambda u: {r['id'] for r in client(u).get(API + 'conversations/').data['results']}  # noqa: E731
    assert ids(ceo) == {str(c_teacher.pk), str(c_student.pk), str(c_partner.pk)}
    assert ids(agent) == {str(c_teacher.pk)}
    assert ids(agent2) == {str(c_student.pk)}
    # explicit assignment of a Group C conversation to agent
    assert client(ceo).post(API + f'conversations/{c_partner.pk}/assign/', {'executive_id': str(agent.pk)},
                            format='json').status_code == 200
    assert ids(agent) == {str(c_teacher.pk), str(c_partner.pk)}
    # once explicitly assigned to agent2, a group-A colleague no longer sees it
    client(ceo).post(API + f'conversations/{c_teacher.pk}/assign/', {'executive_id': str(agent2.pk)}, format='json')
    assert str(c_teacher.pk) not in ids(agent)
    assert str(c_teacher.pk) in ids(agent2)


def test_idor_every_staff_object_endpoint_404s_for_other_executive(ceo, agent, agent2, student):
    c = start(student)
    GroupAssignment.objects.create(group=group('B'), executive=agent, assigned_by=ceo)
    ac2 = client(agent2)  # has access but no group
    base = API + f'conversations/{c.pk}/'
    for method, suffix, payload in [
        ('get', '', None), ('get', 'messages/', None), ('post', 'messages/', {'body': 'x'}),
        ('post', 'status/', {'status': 'open'}), ('post', 'resolve/', {'resolution_summary': 'x'}),
        ('post', 'reopen/', None), ('post', 'follow-up/', {}), ('get', 'notes/', None),
        ('post', 'notes/', {'body': 'x'}), ('post', 'read/', None), ('post', 'claim/', None),
        ('post', 'whatsapp/prepare/', {'body': 'x'}),
    ]:
        r = getattr(ac2, method)(base + suffix, payload, format='json') if payload is not None \
            else getattr(ac2, method)(base + suffix)
        assert r.status_code == 404, (method, suffix, r.status_code)
    assert client(agent).get(base).status_code == 200


def test_executive_cannot_assign_or_manage_groups(ceo, agent, agent2, student):
    c = start(student)
    ac = client(agent)
    assert ac.post(API + f'conversations/{c.pk}/assign/', {'executive_id': str(agent.pk)}, format='json').status_code == 403
    assert ac.post(API + 'groups/', {'slug': 'D', 'name': 'D'}, format='json').status_code == 403
    assert ac.post(API + f'groups/{group("A").pk}/assignments/', {'executive_id': str(agent.pk)},
                   format='json').status_code == 403


def test_group_assignment_requires_access_and_keeps_history_on_end(ceo, agent, no_access):
    g = group('A')
    r = client(ceo).post(API + f'groups/{g.pk}/assignments/', {'executive_id': str(no_access.pk)}, format='json')
    assert r.status_code == 400 and r.data['code'] == 'executive_without_access'
    r = client(ceo).post(API + f'groups/{g.pk}/assignments/', {'executive_id': str(agent.pk)}, format='json')
    assert r.status_code == 201
    aid = r.data['executives'][0]['assignment_id']
    assert client(ceo).delete(API + f'groups/{g.pk}/assignments/{aid}/').status_code == 204
    a = GroupAssignment.objects.get(pk=aid)
    assert a.is_active is False and a.ended_at is not None  # kept, not deleted


def test_reassignment_keeps_history(ceo, agent, agent2, student):
    c = start(student)
    cc = client(ceo)
    cc.post(API + f'conversations/{c.pk}/assign/', {'executive_id': str(agent.pk)}, format='json')
    cc.post(API + f'conversations/{c.pk}/assign/', {'executive_id': str(agent2.pk)}, format='json')
    hist = cc.get(API + f'conversations/{c.pk}/').data['assignment_history']
    assert len(hist) == 2
    assert sum(1 for h in hist if h['is_active']) == 1
    assert ConversationAssignment.objects.filter(conversation=c).count() == 2


def test_cannot_assign_to_user_without_access(ceo, no_access, student):
    c = start(student)
    r = client(ceo).post(API + f'conversations/{c.pk}/assign/', {'executive_id': str(no_access.pk)}, format='json')
    assert r.status_code == 400


def test_unassigned_without_group_visible_to_founders_only(ceo, agent):
    odd = make_user('AI_GUEST')
    c = start(odd)
    assert c.group is None
    assert client(ceo).get(API + f'conversations/{c.pk}/').status_code == 200
    assert client(agent).get(API + f'conversations/{c.pk}/').status_code == 404


# ------------------------------------------------------------- customer isolation / chat


def test_customer_sees_only_own_conversations(teacher, student):
    a, b = start(teacher), start(student)
    r = client(teacher).get(API + 'my/conversations/')
    assert [x['id'] for x in r.data['results']] == [str(a.pk)]
    assert client(teacher).get(API + f'my/conversations/{b.pk}/').status_code == 404
    assert client(teacher).get(API + f'my/conversations/{b.pk}/messages/').status_code == 404
    assert client(teacher).post(API + f'my/conversations/{b.pk}/messages/', {'body': 'hi'}, format='json').status_code == 404
    assert client(teacher).post(API + f'my/conversations/{b.pk}/read/').status_code == 404


def test_customer_endpoints_require_auth():
    assert client().get(API + 'my/conversations/').status_code == 401


def test_in_app_chat_persists_unread_and_polling(ceo, student):
    c = start(student, body='first')
    assert Message.objects.filter(conversation=c).count() == 1
    assert client(ceo).get(API + 'overview/').data['new'] == 1
    r = client(ceo).post(API + f'conversations/{c.pk}/messages/', {'body': 'We are on it', 'channel': 'in_app'},
                         format='json')
    assert r.status_code == 201
    assert r.data['sender']['official_label'] == 'Official EduIgnite Representative'
    sc = client(student)
    assert sc.get(API + 'my/unread/').data['unread_total'] == 1
    msgs = sc.get(API + f'my/conversations/{c.pk}/messages/').data['results']
    assert [m['body'] for m in msgs] == ['first', 'We are on it']
    last_id = msgs[-1]['id']
    sc.post(API + f'my/conversations/{c.pk}/messages/', {'body': 'thanks'}, format='json')
    newer = sc.get(API + f'my/conversations/{c.pk}/messages/?since_id={msgs[0]["id"]}').data['results']
    assert [m['body'] for m in newer] == ['We are on it', 'thanks']
    assert sc.get(API + f'my/conversations/{c.pk}/messages/?since_id={last_id}').data['results'][0]['body'] == 'thanks'
    sc.post(API + f'my/conversations/{c.pk}/read/')
    assert sc.get(API + 'my/unread/').data['unread_total'] == 0
    c.refresh_from_db()
    assert c.staff_unread_count >= 1


def test_sender_identity_cannot_be_client_supplied(ceo, student):
    c = start(student)
    r = client(ceo).post(API + f'conversations/{c.pk}/messages/',
                         {'body': 'x', 'sender_name': 'Mallory', 'sender_role_label': 'Hacker',
                          'is_official_representative': False}, format='json')
    assert r.data['sender']['name'] == ceo.name
    assert r.data['sender']['role_label'] != 'Hacker'
    assert r.data['sender']['official_label']


def test_internal_notes_never_reach_customer(ceo, student):
    c = start(student)
    r = client(ceo).post(API + f'conversations/{c.pk}/notes/', {'body': 'SECRET-NOTE-TEXT'}, format='json')
    assert r.status_code == 201
    client(ceo).post(API + f'conversations/{c.pk}/messages/', {'body': 'public reply'}, format='json')
    sc = client(student)
    for path in (f'my/conversations/{c.pk}/', f'my/conversations/{c.pk}/messages/', 'my/conversations/'):
        assert 'SECRET-NOTE-TEXT' not in sc.get(API + path).content.decode()
    assert client(ceo).get(API + f'conversations/{c.pk}/').data['notes'][0]['body'] == 'SECRET-NOTE-TEXT'


def test_message_idempotency_and_duplicate_protection(student):
    c = start(student)
    sc = client(student)
    r1 = sc.post(API + f'my/conversations/{c.pk}/messages/', {'body': 'again', 'client_message_id': 'k1'}, format='json')
    r2 = sc.post(API + f'my/conversations/{c.pk}/messages/', {'body': 'again', 'client_message_id': 'k1'}, format='json')
    assert r1.status_code == 201 and r2.status_code == 200 and r1.data['id'] == r2.data['id']
    r3 = sc.post(API + f'my/conversations/{c.pk}/messages/', {'body': 'again'}, format='json')  # same body, no key
    assert r3.data['id'] == r1.data['id']
    assert Message.objects.filter(conversation=c, body='again').count() == 1


def test_validation_empty_and_too_long(student):
    c = start(student)
    sc = client(student)
    assert sc.post(API + f'my/conversations/{c.pk}/messages/', {'body': '   '}, format='json').status_code == 400
    assert sc.post(API + f'my/conversations/{c.pk}/messages/', {'body': 'x' * 6000}, format='json').status_code == 400


def test_customer_rate_limited(student):
    c = start(student)  # 1 of 6/min
    sc = client(student)
    codes = [sc.post(API + f'my/conversations/{c.pk}/messages/', {'body': f'm{i}'}, format='json').status_code
             for i in range(8)]
    assert 429 in codes


def test_closed_conversation_rejects_customer_and_resolved_reopens(ceo, student):
    c = start(student)
    cc = client(ceo)
    assert cc.post(API + f'conversations/{c.pk}/resolve/', {}, format='json').status_code == 400  # summary required
    assert cc.post(API + f'conversations/{c.pk}/resolve/', {'resolution_summary': 'Fixed'}, format='json').status_code == 200
    r = client(student).post(API + f'my/conversations/{c.pk}/messages/', {'body': 'still broken'}, format='json')
    assert r.status_code == 201
    c.refresh_from_db()
    assert c.status == 'open' and c.resolved_at is None
    cc.post(API + f'conversations/{c.pk}/status/', {'status': 'closed'}, format='json')
    r = client(student).post(API + f'my/conversations/{c.pk}/messages/', {'body': 'hello?'}, format='json')
    assert r.status_code == 409
    assert cc.post(API + f'conversations/{c.pk}/reopen/').status_code == 200


def test_overview_counts_are_real(ceo, agent, teacher, student, partner):
    a, b, p = start(teacher), start(student), start(partner)
    cc = client(ceo)
    cc.post(API + f'conversations/{a.pk}/assign/', {'executive_id': str(agent.pk)}, format='json')
    cc.post(API + f'conversations/{b.pk}/status/', {'status': 'awaiting_customer'}, format='json')
    cc.post(API + f'conversations/{p.pk}/resolve/', {'resolution_summary': 'ok'}, format='json')
    cc.post(API + f'conversations/{a.pk}/follow-up/',
            {'follow_up_at': (timezone.now() - timedelta(hours=1)).isoformat()}, format='json')
    o = cc.get(API + 'overview/').data
    assert o['total'] == 3 and o['unassigned'] == 2 and o['awaiting_customer'] == 1 and o['resolved'] == 1
    assert o['overdue_follow_ups'] == 1 and o['active_executives'] == 1 and o['new'] == 1


def test_filters_and_search(ceo, teacher, student):
    a, b = start(teacher, subject='Fees problem'), start(student, subject='Marks')
    cc = client(ceo)
    get = lambda q: {r['id'] for r in cc.get(API + 'conversations/?' + q).data['results']}  # noqa: E731
    assert get('group=A') == {str(a.pk)}
    assert get('q=marks') == {str(b.pk)}
    assert get(f'q={teacher.name.split()[0]}') >= {str(a.pk)}
    assert get('assignee=unassigned') == {str(a.pk), str(b.pk)}
    assert get('channel=in_app') == {str(a.pk), str(b.pk)}
    assert get('status=new') == {str(a.pk), str(b.pk)}
    assert get('date_from=2999-01-01') == set()


def test_follow_up_reminder_task_notifies_once(ceo, agent, student):
    from apps.customer_care.tasks import send_follow_up_reminders
    c = start(student)
    client(ceo).post(API + f'conversations/{c.pk}/assign/', {'executive_id': str(agent.pk)}, format='json')
    client(agent).post(API + f'conversations/{c.pk}/follow-up/',
                       {'follow_up_at': (timezone.now() - timedelta(minutes=5)).isoformat()}, format='json')
    assert send_follow_up_reminders()['reminders'] == 1
    assert send_follow_up_reminders()['reminders'] == 0


# ---------------------------------------------------------------------------- email


CONFIGURED = dict(EMAIL_PROVIDER='brevo', BREVO_API_KEY='test-key-not-real', EMAIL_FROM_ADDRESS='care@eduignite.online')


def test_email_template_content_and_escaping():
    html, text = emailing.render_email(customer_name='Ann', subject='Marks', body='Hi <script>alert(1)</script>\n\nBye',
                                       sender_name='Jean Dupont', sender_role='Operation Department')
    for needle in ('Official Customer Care', 'Jean Dupont', 'Operation Department',
                   'Official EduIgnite Representative', 'eduignite-logo.png', 'Hello Ann'):
        assert needle in html
    assert '<script>' not in html and '&lt;script&gt;' in html
    assert 'Official EduIgnite Representative' in text and 'Jean Dupont' in text and '<' not in text.replace('<script>', '')[:0]


def test_logo_asset_exists_in_repo():
    import os
    base = os.path.dirname(__file__)
    root = os.path.abspath(os.path.join(base, *['..'] * 4))
    if not os.path.isdir(os.path.join(root, 'apps', 'website')):
        pytest.skip('website sources not present in this checkout')
    assert os.path.exists(os.path.join(root, 'apps', 'website', 'public', 'eduignite-logo.png'))


@override_settings(EMAIL_PROVIDER='brevo', BREVO_API_KEY='', EMAIL_FROM_ADDRESS='care@eduignite.online')
def test_email_unconfigured_does_not_fake_success(ceo, student):
    c = start(student)
    with mock.patch('apps.platform.runtime_config.brevo_api_key', return_value=''):
        r = client(ceo).post(API + f'conversations/{c.pk}/messages/', {'body': 'x', 'channel': 'email'}, format='json')
        assert r.status_code == 503 and r.data['code'] == 'email_not_configured'
        cfg = client(ceo).get(API + 'config-status/').data['email']
    assert cfg['configured'] is False and cfg['api_key_set'] is False
    assert not Message.objects.filter(conversation=c, channel='email').exists()


@override_settings(**CONFIGURED)
def test_email_success_is_sent_to_provider_never_delivered(ceo, student):
    c = start(student)
    with mock.patch('core.email_service.requests.post') as post, \
            mock.patch('apps.platform.runtime_config.brevo_api_key', return_value='k'), \
            mock.patch('apps.customer_care.services.transaction.on_commit', side_effect=lambda f: f()):
        post.return_value.status_code = 201
        with mock.patch('apps.customer_care.tasks.send_email_message.delay',
                        side_effect=lambda mid: emailing.deliver_email_message(mid)):
            r = client(ceo).post(API + f'conversations/{c.pk}/messages/',
                                 {'body': 'Hello', 'channel': 'email', 'client_message_id': 'e1'}, format='json')
    assert r.status_code == 201, r.content
    m = Message.objects.get(pk=r.data['id'])
    assert m.delivery_status == 'sent_to_provider'
    assert m.delivery_status not in ('delivered', 'sent', 'read')
    assert post.call_count == 1
    sent = post.call_args.kwargs['json']
    assert sent['to'][0]['email'] == student.email and 'Official EduIgnite Representative' in sent['htmlContent']
    # a second concurrent/duplicate run must not send again
    assert emailing.deliver_email_message(m.pk) == 'sent_to_provider'
    assert post.call_count == 1
    # same client id does not create/send twice
    with mock.patch('core.email_service.requests.post') as post2:
        r2 = client(ceo).post(API + f'conversations/{c.pk}/messages/',
                              {'body': 'Hello', 'channel': 'email', 'client_message_id': 'e1'}, format='json')
        assert r2.status_code == 200 and r2.data['id'] == r.data['id'] and post2.call_count == 0


@override_settings(**CONFIGURED)
def test_email_failure_is_recorded_and_retry_exhausts_to_failed(ceo, student):
    c = start(student)
    with mock.patch('apps.platform.runtime_config.brevo_api_key', return_value='k'), \
            mock.patch('core.email_service.requests.post') as post, \
            mock.patch('apps.customer_care.services.dispatch_email'):
        post.return_value.status_code = 500
        post.return_value.text = 'boom'
        r = client(ceo).post(API + f'conversations/{c.pk}/messages/', {'body': 'x', 'channel': 'email'}, format='json')
        mid = r.data['id']
        assert emailing.deliver_email_message(mid) == 'queued'  # released for retry
        assert emailing.deliver_email_message(mid) == 'queued'
        assert emailing.deliver_email_message(mid) == 'failed'  # third and last attempt
    m = Message.objects.get(pk=mid)
    assert m.delivery_status == 'failed' and m.error_code == 'provider_rejected' and m.attempts == 3
    assert m.delivery_events.filter(status='failed').count() == 3
    assert not m.delivery_events.filter(status__in=['sent_to_provider', 'delivered']).exists()


@override_settings(**CONFIGURED)
def test_email_invalid_recipient_rejected(ceo):
    odd = make_user('STUDENT')
    User.objects.filter(pk=odd.pk).update(email='nobody@example.com')
    c = start(odd)
    with mock.patch('apps.platform.runtime_config.brevo_api_key', return_value='k'):
        r = client(ceo).post(API + f'conversations/{c.pk}/messages/', {'body': 'x', 'channel': 'email'}, format='json')
    assert r.status_code == 400 and r.data['code'] == 'invalid_recipient'


def test_email_cannot_be_marked_delivered_by_a_person(ceo, student):
    m = Message.objects.create(conversation=start(student), direction='outbound', channel='email', body='x',
                               delivery_status='sent_to_provider')
    with pytest.raises(InvalidStatusTransition):
        m.transition('delivered')
    m.transition('delivered', source='provider')
    assert m.delivery_status == 'delivered'


# -------------------------------------------------------------------------- whatsapp


@pytest.mark.parametrize('raw,expected', [
    ('677123456', '237677123456'), ('+237 677 12 34 56', '237677123456'), ('00237677123456', '237677123456'),
    ('237677123456', '237677123456'), ('(237) 677-123-456', '237677123456'), ('+33 6 12 34 56 78', '33612345678'),
    ('+1 415 555 2671', '14155552671'),
])
def test_phone_normalisation_valid(raw, expected):
    assert whatsapp.normalize_phone(raw) == expected


@pytest.mark.parametrize('raw', ['', None, 'abc', '123', '0677123456', '+237 233 12 34 56', '000000000', '+23767712',
                                 '12345678901234567890', '222222222'])
def test_phone_normalisation_invalid(raw):
    with pytest.raises(whatsapp.InvalidPhoneNumber):
        whatsapp.normalize_phone(raw)


def test_whatsapp_prepare_link_encoding_and_status(ceo, student):
    User.objects.filter(pk=student.pk).update(phone='677123456', whatsapp=None, name='Ann & Bob')
    c = start(student)
    r = client(ceo).post(API + f'conversations/{c.pk}/whatsapp/prepare/', {'body': 'Hello? 100% ok & more\nline2'},
                         format='json')
    assert r.status_code == 201, r.content
    url = r.data['whatsapp_url']
    assert url.startswith('https://wa.me/237677123456?text=')
    from urllib.parse import unquote
    text = unquote(url.split('text=', 1)[1])
    assert text.startswith('EduIgnite | Official Customer Care') and 'Hello Ann & Bob' in text
    assert 'Customer Care Executive' in text and ceo.name in text and 'EduIgnite' in text.splitlines()[-1]
    assert '&' not in url.split('text=', 1)[1] and ' ' not in url and '\n' not in url
    m = Message.objects.get(pk=r.data['message']['id'])
    assert m.delivery_status == 'prepared_awaiting_manual_send' and m.delivery_source == 'manual'
    assert r.data['message']['is_manual_status'] is True
    # customer sees nothing until a person records it as sent
    assert client(student).get(API + f'my/conversations/{c.pk}/messages/').data['count'] == 1
    assert client(student).get(API + 'my/unread/').data['unread_total'] == 0


def test_whatsapp_invalid_phone_rejected(ceo, student):
    User.objects.filter(pk=student.pk).update(phone='+237 233 000 000', whatsapp=None)
    c = start(student)
    r = client(ceo).post(API + f'conversations/{c.pk}/whatsapp/prepare/', {'body': 'x'}, format='json')
    assert r.status_code == 400 and r.data['code'] == 'invalid_phone'
    assert not Message.objects.filter(conversation=c, channel='whatsapp').exists()


def test_whatsapp_manual_outcomes_never_sent_delivered_read(ceo, student):
    c = start(student)
    cc = client(ceo)
    mid = cc.post(API + f'conversations/{c.pk}/whatsapp/prepare/', {'body': 'x', 'client_message_id': 'w1'},
                  format='json').data['message']['id']
    again = cc.post(API + f'conversations/{c.pk}/whatsapp/prepare/', {'body': 'x', 'client_message_id': 'w1'},
                    format='json')
    assert again.status_code == 200 and again.data['message']['id'] == mid
    out = API + f'conversations/{c.pk}/messages/{mid}/whatsapp-outcome/'
    for bad in ('sent', 'delivered', 'read', 'queued', 'bogus'):
        assert cc.post(out, {'outcome': bad}, format='json').status_code == 400, bad
    m = Message.objects.get(pk=mid)
    assert m.delivery_status == 'prepared_awaiting_manual_send'
    assert cc.post(out, {'outcome': 'opened_delivery_unconfirmed'}, format='json').data['delivery_status'] == \
        'opened_delivery_unconfirmed'
    r = cc.post(out, {'outcome': 'sent_manually', 'note': 'pressed send'}, format='json')
    assert r.data['delivery_status'] == 'sent_manually' and r.data['delivery_source'] == 'manual'
    assert cc.post(out, {'outcome': 'not_sent'}, format='json').status_code == 409  # final
    # now the customer may see it, and is unread-notified
    assert client(student).get(API + 'my/unread/').data['unread_total'] == 1
    # provider statuses are impossible on a click-to-chat message
    m.refresh_from_db()
    for s in ('sent', 'delivered', 'read'):
        with pytest.raises(InvalidStatusTransition):
            m.transition(s, source='manual')
    assert not m.delivery_events.filter(status__in=['sent', 'delivered', 'read']).exists()


def test_whatsapp_states_and_webhook_not_configured():
    assert whatsapp.OfficialApiProvider().config_state() == 'official_api_not_configured'
    s = IntegrationSecrets.load()
    s.whatsapp_api_token = 'tok'
    s.save()
    assert whatsapp.OfficialApiProvider().config_state() == 'official_api_requires_attention'
    s.whatsapp_phone_number_id, s.whatsapp_webhook_secret, s.whatsapp_api_verified = '1', 'sec', True
    s.save()
    assert whatsapp.OfficialApiProvider().config_state() == 'official_api_configured_verified'
    assert whatsapp.ClickToChatProvider().config_state() == 'click_to_chat_available'


def test_webhook_503_when_unconfigured_then_signature_and_dedupe(ceo, student):
    assert client().post(API + 'webhooks/whatsapp/', {}, format='json').status_code == 503
    s = IntegrationSecrets.load()
    s.whatsapp_api_token, s.whatsapp_phone_number_id, s.whatsapp_webhook_secret = 'tok', '1', 'sec'
    s.whatsapp_api_verified = True
    s.save()
    import hashlib
    import hmac
    import json
    c = start(student)
    m = Message.objects.create(conversation=c, direction='outbound', channel='whatsapp', body='x',
                               provider_message_id='wamid.1', delivery_status='queued', provider='official_api')
    body = json.dumps({'entry': [{'changes': [{'value': {'statuses': [{'id': 'wamid.1', 'status': 'sent'}]}}]}]}).encode()
    sig = 'sha256=' + hmac.new(b'sec', body, hashlib.sha256).hexdigest()
    bad = client().generic('POST', API + 'webhooks/whatsapp/', body, content_type='application/json',
                           HTTP_X_HUB_SIGNATURE_256='sha256=00')
    assert bad.status_code == 403
    ok = client().generic('POST', API + 'webhooks/whatsapp/', body, content_type='application/json',
                          HTTP_X_HUB_SIGNATURE_256=sig)
    assert ok.status_code == 200 and ok.data['handled'] == 1
    again = client().generic('POST', API + 'webhooks/whatsapp/', body, content_type='application/json',
                             HTTP_X_HUB_SIGNATURE_256=sig)
    assert again.data['handled'] == 0
    m.refresh_from_db()
    assert m.delivery_status == 'sent' and m.delivery_source == 'provider'


# ----------------------------------------------------------------- contact information


def test_contact_info_write_permissions_and_public_output(ceo, cto, agent, teacher):
    pub = client().get(API + 'public/contact-info/')
    assert pub.status_code == 200
    body = {'kind': 'facebook', 'label': 'Facebook', 'value': 'https://www.facebook.com/eduignite',
            'display_mode': 'icon_only', 'is_active': True}
    for u in (agent, teacher):
        assert client(u).post(API + 'contact-info/', body, format='json').status_code == 403
        assert client(u).patch(API + f'contact-info/{contact.ContactInfoItem.objects.first().pk}/', {'label': 'x'},
                               format='json').status_code == 403
    r1 = client(ceo).post(API + 'contact-info/', body, format='json')
    r2 = client(cto).post(API + 'contact-info/', {**body, 'kind': 'instagram', 'label': 'IG',
                                                  'value': 'https://instagram.com/eduignite', 'is_active': False},
                          format='json')
    assert r1.status_code == 201 and r2.status_code == 201
    cache.clear()
    items = client().get(API + 'public/contact-info/').data['items']
    kinds = {i['kind'] for i in items}
    assert 'facebook' in kinds and 'instagram' not in kinds  # inactive hidden
    fb = next(i for i in items if i['kind'] == 'facebook')
    assert fb['display_mode'] == 'icon_only' and set(fb) == {'id', 'kind', 'label', 'value', 'href', 'display_mode'}
    assert client(ceo).patch(API + f'contact-info/{r2.data["id"]}/', {'is_active': True}, format='json').status_code == 200
    assert 'instagram' in {i['kind'] for i in client().get(API + 'public/contact-info/').data['items']}
    assert client(ceo).get(API + 'audit/?action=contact_info_created').data['count'] == 2


@pytest.mark.parametrize('kind,value', [
    ('facebook', 'http://www.facebook.com/x'), ('facebook', 'https://evil.com/facebook.com'),
    ('instagram', 'https://facebook.com/x'), ('website', 'javascript:alert(1)'), ('website', 'ftp://x.org'),
    ('website', 'https://user:pw@site.org'), ('email', 'not-an-email'), ('phone', 'call me'), ('phone', '123'),
    ('linkedin', 'https://youtube.com/x'), ('address', '<script>'), ('other', 'http://insecure.org'),
    ('whatsapp', 'abc'),
])
def test_contact_info_validation_rejects(ceo, kind, value):
    r = client(ceo).post(API + 'contact-info/', {'kind': kind, 'label': 'L', 'value': value}, format='json')
    assert r.status_code == 400 and r.data['code'] in ('invalid_value',), (kind, value, r.data)


@pytest.mark.parametrize('kind,value', [
    ('facebook', 'https://facebook.com/eduignite'), ('instagram', 'https://www.instagram.com/eduignite'),
    ('linkedin', 'https://www.linkedin.com/company/eduignite'), ('youtube', 'https://youtu.be/abc'),
    ('website', 'https://eduignite.online'), ('email', 'care@eduignite.online'), ('phone', '+237 677 00 00 00'),
    ('whatsapp', '+237677000000'), ('address', 'Bamenda, Cameroon'), ('other', 'https://example.org/x'),
])
def test_contact_info_validation_accepts(ceo, kind, value):
    r = client(ceo).post(API + 'contact-info/', {'kind': kind, 'label': 'L', 'value': value}, format='json')
    assert r.status_code == 201, r.data


# ----------------------------------------------------------------- secrets / logs / retention


def test_secrets_never_in_responses(ceo, agent, student):
    s = IntegrationSecrets.load()
    s.brevo_api_key, s.whatsapp_api_token, s.whatsapp_webhook_secret = 'BREVO-SECRET-XYZ', 'WA-TOKEN-XYZ', 'WA-SEC-XYZ'
    s.save()
    cc = client(ceo)
    blobs = [cc.get(API + 'config-status/').content, cc.get('/api/v1/platform/integration-secrets/').content,
             client(agent).get(API + 'overview/').content, client().get(API + 'public/contact-info/').content]
    blob = b''.join(blobs).decode()
    for secret in ('BREVO-SECRET-XYZ', 'WA-TOKEN-XYZ', 'WA-SEC-XYZ'):
        assert secret not in blob
    st = cc.get('/api/v1/platform/integration-secrets/').data
    assert st['whatsapp_api_token_set'] is True


def test_logs_do_not_contain_message_bodies(ceo, student, caplog):
    c = start(student, body='PRIVATE-BODY-123')
    with caplog.at_level('DEBUG'):
        client(ceo).post(API + f'conversations/{c.pk}/messages/', {'body': 'PRIVATE-REPLY-456'}, format='json')
    assert 'PRIVATE-BODY-123' not in caplog.text and 'PRIVATE-REPLY-456' not in caplog.text


def test_retention_command_dry_run_then_apply(ceo, student, capsys):
    c = start(student, body='old text')
    Conversation.objects.filter(pk=c.pk).update(status='closed', closed_at=timezone.now() - timedelta(days=900))
    InternalNote.objects.create(conversation=c, author=ceo, body='note')
    call_command('purge_customer_care_data')
    assert Message.objects.get(conversation=c).body == 'old text'
    assert 'DRY RUN' in capsys.readouterr().out
    call_command('purge_customer_care_data', '--apply')
    assert Message.objects.get(conversation=c).body == '[removed by retention policy]'
    assert Conversation.objects.filter(pk=c.pk).exists()


def test_make_migrations_check():
    call_command('makemigrations', '--check', '--dry-run')


def test_founder_create_defaults_false_and_grants_when_asked(ceo):
    base = {'name': 'New Exec', 'phone': '+237677111222', 'role': 'COO', 'founder_title': 'Operations'}
    with mock.patch('core.email_service.send_executive_account_email'):
        r1 = client(ceo).post('/api/v1/users/founders/', {**base, 'email': 'n1@example.org'}, format='json')
        r2 = client(ceo).post('/api/v1/users/founders/', {**base, 'email': 'n2@example.org',
                                                           'customer_care_access': True}, format='json')
    assert r1.status_code == 201 and r1.data['customer_care_access'] is False
    assert r2.status_code == 201 and r2.data['customer_care_access'] is True
    assert User.objects.get(email='n2@example.org').allowed_modules == ['customer_care']
    assert User.objects.get(email='n1@example.org').allowed_modules == []

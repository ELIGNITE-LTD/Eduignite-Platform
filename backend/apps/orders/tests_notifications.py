"""School-request emails: executives alerted, requester acknowledged, then told on activation."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.orders.models import EmailNotificationLog, Order
from apps.schools.models import School

User = get_user_model()
SEND = 'core.email_service.send_transactional_email'
FORM = {
    'full_name': 'Jane <b>Doe</b>', 'occupation': 'Principal', 'school_name': 'Test <script>x</script> School',
    'whatsapp_number': '+237650000001', 'email': 'jane@school.org',
    'region': 'Littoral', 'division': 'Wouri', 'sub_division': 'Douala 1', 'message': 'hi',
}


def _user(matricule, role, **extra):
    return User.objects.create_user(
        matricule=matricule, name=f'{role} {matricule}', email=f'{matricule.lower()}@gmail.com',
        role=role, password='Passw0rd!123', is_license_paid=True, **extra,
    )


class OrderEmailTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.ceo = _user('CEO001', 'CEO')
        self.cto = _user('CTO001', 'CTO')
        _user('COO001', 'COO')

    def submit(self, **over):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post('/api/v1/orders/orders/', {**FORM, **over}, format='json')

    @patch(SEND, return_value=True)
    def test_request_alerts_executives_and_acknowledges_requester(self, send):
        response = self.submit()
        self.assertEqual(response.status_code, 201, response.content)
        to = sorted(call.kwargs['to_email'] for call in send.call_args_list)
        self.assertEqual(to, sorted(['ceo001@gmail.com', 'cto001@gmail.com', 'jane@school.org']))
        exec_mail = next(c.kwargs for c in send.call_args_list if c.kwargs['to_email'] == 'ceo001@gmail.com')
        self.assertIn('/dashboard/schools?status=pending', exec_mail['html'])
        self.assertIn('+237650000001', exec_mail['html'])
        self.assertIn('jane@school.org', exec_mail['html'])
        ack = next(c.kwargs for c in send.call_args_list if c.kwargs['to_email'] == 'jane@school.org')
        self.assertIn('Demande', ack['subject'])

    @patch(SEND, return_value=True)
    def test_user_text_is_escaped_and_subject_single_line(self, send):
        self.submit(school_name='Evil\r\nBcc: x@y.z <script>alert(1)</script>')
        for call in send.call_args_list:
            self.assertNotIn('\n', call.kwargs['subject'])
            self.assertNotIn('\r', call.kwargs['subject'])
            self.assertNotIn('<script>', call.kwargs['html'])

    @patch(SEND, return_value=True)
    def test_no_duplicates_on_repeat(self, send):
        self.submit()
        order = Order.objects.get()
        sent = send.call_count
        from apps.orders import api
        with self.captureOnCommitCallbacks(execute=True):
            api.notify_order_received(order.pk)
            order.save()  # a later save is not a new request
        self.assertEqual(send.call_count, sent)

    @patch(SEND, return_value=True)
    def test_processed_emails_requester_once_without_password(self, send):
        self.submit()
        send.reset_mock()
        order = Order.objects.get()
        self.client.force_authenticate(self.ceo)
        for _ in range(2):
            with self.captureOnCommitCallbacks(execute=True):
                r = self.client.post(f'/api/v1/orders/orders/{order.pk}/process/', {'status': 'processed'}, format='json')
            self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(send.call_count, 1)
        mail = send.call_args.kwargs
        self.assertEqual(mail['to_email'], 'jane@school.org')
        self.assertNotIn('password:', mail['text'].lower())
        self.assertIn('Forgot password', mail['text'])

    @patch(SEND, return_value=True)
    def test_rejected_sends_nothing(self, send):
        self.submit()
        send.reset_mock()
        order = Order.objects.get()
        self.client.force_authenticate(self.ceo)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f'/api/v1/orders/orders/{order.pk}/process/', {'status': 'rejected'}, format='json')
        self.assertEqual(send.call_count, 0)

    @patch(SEND, side_effect=RuntimeError('smtp down'))
    def test_send_failure_never_breaks_the_request(self, send):
        response = self.submit()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Order.objects.count(), 1)
        # claims are released so a retry can still deliver
        self.assertEqual(EmailNotificationLog.objects.count(), 0)

    @patch(SEND, return_value=False)
    def test_unconfigured_provider_is_not_an_error(self, send):
        self.assertEqual(self.submit().status_code, 201)

    @override_settings(EXECUTIVE_NOTIFY_EMAILS=['board@elignite.com'])
    @patch(SEND, return_value=True)
    def test_extra_executive_addresses_are_added(self, send):
        self.submit()
        to = {c.kwargs['to_email'] for c in send.call_args_list}
        self.assertIn('board@elignite.com', to)
        self.assertIn('ceo001@gmail.com', to)

    @override_settings(EXECUTIVE_NOTIFY_EMAILS=['board@elignite.com'], EXECUTIVE_NOTIFY_EMAILS_ONLY=True)
    @patch(SEND, return_value=True)
    def test_extra_addresses_can_override(self, send):
        self.submit()
        to = {c.kwargs['to_email'] for c in send.call_args_list}
        self.assertEqual(to, {'board@elignite.com', 'jane@school.org'})


class LinkedSchoolEmailTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.ceo = _user('CEO001', 'CEO')
        self.school = School.objects.create(
            id='MAIN1', name='Main College', short_name='MAIN1', principal='Boss', location='Buea',
            email='main@school.org', phone='237650000000', status='Active',
        )
        self.admin = _user('ADM001', 'SCHOOL_ADMIN', school=self.school)

    @patch(SEND, return_value=True)
    def test_create_primary_alerts_executives_acks_requester_then_activation_emails_once(self, send):
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/v1/users/linked-schools/create-primary/', {
                'name': 'Sunrise Primary School', 'location': 'Buea', 'phone': '650000002',
                'principal': 'Mary Head', 'email': 'sunrise@school.org',
            }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        to = sorted(c.kwargs['to_email'] for c in send.call_args_list)
        self.assertEqual(to, sorted(['ceo001@gmail.com', 'adm001@gmail.com']))
        ceo_mail = next(c.kwargs for c in send.call_args_list if c.kwargs['to_email'] == 'ceo001@gmail.com')
        self.assertIn('Sunrise Primary School', ceo_mail['html'])
        self.assertIn('Mary Head', ceo_mail['html'])
        self.assertIn('status=pending', ceo_mail['html'])
        temp = response.json()['credentials']['temporary_password']
        matricule = response.json()['credentials']['matricule']

        send.reset_mock()
        self.client.force_authenticate(self.ceo)
        sid = School.objects.get(name='Sunrise Primary School').id
        statuses = []
        for _ in range(2):
            with self.captureOnCommitCallbacks(execute=True):
                statuses.append(self.client.post(f'/api/v1/schools/schools/{sid}/restore/').status_code)
        self.assertEqual(statuses, [200, 404])
        recipients = sorted(c.kwargs['to_email'] for c in send.call_args_list)
        self.assertEqual(recipients, sorted(['adm001@gmail.com', 'sunrise@school.org']))
        for call in send.call_args_list:
            self.assertIn(matricule, call.kwargs['text'])
            self.assertNotIn(temp, call.kwargs['text'])
            self.assertNotIn(temp, call.kwargs['html'])

    @patch(SEND, side_effect=RuntimeError('boom'))
    def test_email_failure_does_not_break_create_primary(self, send):
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/v1/users/linked-schools/create-primary/', {
                'name': 'Moonlight Primary School', 'location': 'Buea', 'phone': '650000003',
                'principal': 'Tom Head', 'email': 'moon@school.org',
            }, format='json')
        self.assertEqual(response.status_code, 201, response.content)


class ExecutiveRecipientTests(TestCase):
    def test_inactive_and_local_addresses_are_skipped(self):
        _user('CEO001', 'CEO')
        _user('CTO001', 'CTO', is_active=False)
        User.objects.create_user(matricule='CTO002', name='x', email='cto2@example.com', role='CTO',
                                 password='Passw0rd!123')
        from apps.orders import api
        self.assertEqual(api.executive_recipients(), ['ceo001@gmail.com'])

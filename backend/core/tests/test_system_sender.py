"""All system email is sent as the EduIgnite Team from the team address."""

from unittest import mock

from django.test import SimpleTestCase, override_settings

from core.email_service import EmailEvent, send_transactional_email

CONF = dict(EMAIL_PROVIDER='brevo', BREVO_API_KEY='test-key', EMAIL_FROM_ADDRESS='no-reply@eduignite.online',
            SYSTEM_EMAIL_FROM_ADDRESS='info@eduignite.online', SYSTEM_EMAIL_FROM_NAME='EduIgnite Team')


def _send(event, **extra):
    with mock.patch('core.email_service.requests.post') as post:
        post.return_value = mock.Mock(status_code=201, text='')
        ok = send_transactional_email(event=event, to_email='a@school.cm', to_name='A', subject='s', html='h',
                                      text='t', **extra)
        return ok, post.call_args.kwargs['json'] if post.called else None


@override_settings(**CONF)
class SystemSenderTests(SimpleTestCase):
    def test_system_email_uses_team_name_address_and_reply_to(self):
        ok, payload = _send(EmailEvent.PASSWORD_RESET, sender_name='EduIgnite')
        self.assertTrue(ok)
        self.assertEqual(payload['sender'], {'name': 'EduIgnite Team', 'email': 'info@eduignite.online'})
        self.assertEqual(payload['replyTo']['email'], 'info@eduignite.online')

    def test_a_custom_sender_name_is_kept(self):
        _, payload = _send(EmailEvent.SCHOOL_CREATED, sender_name='CEO Office - ELIGNITE / EduIgnite')
        self.assertEqual(payload['sender']['name'], 'CEO Office - ELIGNITE / EduIgnite')
        self.assertEqual(payload['sender']['email'], 'info@eduignite.online')

    def test_customer_care_keeps_its_own_identity(self):
        _, payload = _send(EmailEvent.CUSTOMER_CARE_REPLY, sender_name='EduIgnite Customer Care')
        self.assertEqual(payload['sender']['email'], 'no-reply@eduignite.online')
        self.assertEqual(payload['sender']['name'], 'EduIgnite Customer Care')

    def test_outreach_sender_is_not_overridden(self):
        _, payload = _send(EmailEvent.OUTREACH, sender_name='EduIgnite Team', sender_email='hello@eduignite.online')
        self.assertEqual(payload['sender']['email'], 'hello@eduignite.online')

    @override_settings(SYSTEM_EMAIL_FROM_ADDRESS='')
    def test_blank_setting_falls_back_to_the_old_sender(self):
        _, payload = _send(EmailEvent.PASSWORD_RESET, sender_name='EduIgnite')
        self.assertEqual(payload['sender']['email'], 'no-reply@eduignite.online')

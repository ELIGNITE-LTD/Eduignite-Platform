"""Outreach by WhatsApp: numbers, queueing per channel, pacing, opt-out, the template and the API."""

from unittest import mock

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from apps.outreach import services
from apps.outreach.models import ContactStatus, OutreachContact, OutreachSend, SendStatus
from apps.outreach.tests.test_outreach import BASE, contact, make_user
from core import whatsapp_service


class PhoneTests(SimpleTestCase):
    def test_numbers_are_read_the_way_people_type_them(self):
        n = services.normalise_phone
        self.assertEqual(n('677 12 34 56'), '+237677123456')
        self.assertEqual(n('00237 677123456'), '+237677123456')
        self.assertEqual(n('+237 6 77 12 34 56'), '+237677123456')
        self.assertEqual(n('+44 7700 900123'), '+447700900123')
        self.assertEqual(n('12'), '')
        self.assertEqual(n('hello'), '')

    def test_pasted_lists_split_on_lines_and_commas_and_drop_repeats(self):
        valid, invalid = services.parse_phones('677123456, 677 12 34 56\n699000111;abc')
        self.assertEqual(valid, ['+237677123456', '+237699000111'])
        self.assertEqual(invalid, ['abc'])


@override_settings(OUTREACH_WHATSAPP_DAILY_CAP=3, OUTREACH_WHATSAPP_TEMPLATE='')
class WhatsappQueueTests(APITestCase):
    def setUp(self):
        self.user = make_user('CEO900', 'CEO')
        self.client.force_authenticate(self.user)

    def run_queue(self, ok=True, error=''):
        with mock.patch.object(whatsapp_service, 'send_text', return_value=(ok, error)) as send:
            return services.process_queue(channel='whatsapp'), send

    def test_phone_only_school_can_be_added_and_messaged(self):
        r = self.client.post(BASE + 'send/', {'channel': 'whatsapp', 'phones': '677123456', 'body': 'Hello {school_name}'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['queued'], 1)
        c = OutreachContact.objects.get(phone='+237677123456')
        self.assertEqual(c.email, '')

    def test_send_goes_out_and_is_counted_on_whatsapp_only(self):
        c = contact('a@x.cm', 'Alpha', phone='677123456')
        campaign, counts = services.queue_campaign(self.user, [c.id], '', 'Hi {school_name}', channel='whatsapp')
        sent, send = self.run_queue()
        self.assertEqual((sent, counts['queued']), (1, 1))
        text = send.call_args[0][1]
        self.assertIn('Hi Alpha', text)
        self.assertIn('/outreach/unsubscribe/', text)
        c.refresh_from_db()
        self.assertEqual((c.whatsapp_sent_count, c.sent_count, c.status), (1, 0, ContactStatus.NEW))

    def test_already_messaged_unsubscribed_and_numberless_are_skipped(self):
        done = contact('d@x.cm', phone='677000001', whatsapp_sent_count=1)
        out = contact('o@x.cm', phone='677000002', status=ContactStatus.UNSUBSCRIBED)
        nonum = contact('n@x.cm')
        _, counts = services.queue_campaign(self.user, [done.id, out.id, nonum.id], '', 'Hi', channel='whatsapp')
        self.assertEqual((counts['already_contacted'], counts['unsubscribed'], counts['no_address'], counts['queued']), (1, 1, 1, 0))

    def test_email_and_whatsapp_queues_are_independent(self):
        c = contact('e@x.cm', phone='677000003')
        services.queue_campaign(self.user, [c.id], 'Subject', 'Body')
        _, counts = services.queue_campaign(self.user, [c.id], '', 'Body', channel='whatsapp')
        self.assertEqual(counts['queued'], 1)
        self.assertEqual(counts['already_queued'], 0)

    def test_daily_cap_holds_the_rest_back(self):
        ids = [contact(f'{i}@x.cm', phone=f'67700010{i}').id for i in range(5)]
        services.queue_campaign(self.user, ids, '', 'Hi', channel='whatsapp')
        sent, _ = self.run_queue()
        self.assertEqual(sent, 3)
        self.assertEqual(OutreachSend.objects.filter(status=SendStatus.QUEUED).count(), 2)

    def test_a_refusal_is_recorded_with_its_reason_and_the_batch_continues(self):
        a, b = contact('a@x.cm', phone='677000011'), contact('b@x.cm', phone='677000012')
        services.queue_campaign(self.user, [a.id, b.id], '', 'Hi', channel='whatsapp')
        self.run_queue(ok=False, error='This number is not on WhatsApp.')
        self.assertEqual(OutreachSend.objects.filter(status=SendStatus.FAILED).count(), 2)
        a.refresh_from_db()
        self.assertEqual((a.whatsapp_sent_count, a.last_error), (0, 'This number is not on WhatsApp.'))

    @override_settings(OUTREACH_WHATSAPP_TEMPLATE='school_intro')
    def test_first_contact_uses_the_approved_template(self):
        c = contact('t@x.cm', 'Tau School', phone='677000021')
        services.queue_campaign(self.user, [c.id], '', 'Hello', channel='whatsapp')
        with mock.patch.object(whatsapp_service, 'send_template', return_value=(True, '')) as tpl:
            services.process_queue(channel='whatsapp')
        name, language, variables = tpl.call_args[0][1], tpl.call_args[0][2], tpl.call_args[0][3]
        self.assertEqual((name, language, variables[0]), ('school_intro', 'en', 'Tau School'))
        self.assertIn('Hello', variables[1])

    def test_unconnected_whatsapp_reports_a_clear_reason(self):
        with mock.patch.object(whatsapp_service, 'credentials', return_value=('', '')):
            ok, error = whatsapp_service.send_text('+237677000000', 'hi')
        self.assertFalse(ok)
        self.assertIn('not connected', error)

    def test_meta_error_codes_become_plain_sentences(self):
        resp = mock.Mock(status_code=400)
        resp.json.return_value = {'error': {'code': 131047, 'message': 'Re-engagement message'}}
        with mock.patch.object(whatsapp_service, 'credentials', return_value=('t', 'p')), mock.patch('requests.post', return_value=resp):
            ok, error = whatsapp_service.send_text('+237677000000', 'hi')
        self.assertFalse(ok)
        self.assertIn('24 hours', error)

    def test_test_message_goes_to_the_users_own_number(self):
        self.user.whatsapp = '677999888'
        self.user.save()
        with mock.patch.object(whatsapp_service, 'send_text', return_value=(True, '')) as send:
            r = self.client.post(BASE + 'send/test/', {'channel': 'whatsapp', 'body': 'Hi'}, format='json')
        self.assertEqual((r.status_code, r.data['sent_to']), (200, '+237677999888'))
        self.assertEqual(send.call_args[0][0], '+237677999888')

    def test_summary_reports_whatsapp_state(self):
        contact('s@x.cm', phone='677000031')
        r = self.client.get(BASE + 'summary/')
        self.assertEqual(r.data['whatsapp']['with_number'], 1)
        self.assertEqual(r.data['whatsapp']['daily_cap'], 3)

    def test_cancel_only_touches_the_chosen_channel(self):
        c = contact('c@x.cm', phone='677000041')
        services.queue_campaign(self.user, [c.id], 'S', 'B')
        services.queue_campaign(self.user, [c.id], '', 'B', channel='whatsapp')
        r = self.client.post(BASE + 'send/cancel/', {'channel': 'whatsapp'}, format='json')
        self.assertEqual(r.data['cancelled'], 1)
        c.refresh_from_db()
        self.assertEqual(c.status, ContactStatus.QUEUED)           # the email is still waiting

"""Founder outreach: access, import, queueing, pacing, opt-out and the email headers."""

import io
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from apps.outreach import services
from apps.outreach.models import (
    ContactStatus, Level, OutreachContact, OutreachSend, Region, SendStatus,
)
from core import email_service

User = get_user_model()
BASE = '/api/v1/outreach/'


def make_user(matricule, role, modules=None):
    return User.objects.create_user(
        matricule=matricule, name=matricule, email=f'{matricule.lower()}@example.org', role=role,
        password='password123', is_license_paid=True, allowed_modules=modules or [])


def contact(email, name='Test School', **extra):
    return OutreachContact.objects.create(email=email, school_name=name, **extra)


class AccessTests(APITestCase):
    def test_founders_always_others_only_when_assigned(self):
        ceo = make_user('CEO001', 'CEO')
        cto = make_user('CTO001', 'CTO')
        coo_no = make_user('COO001', 'COO')
        coo_yes = make_user('COO002', 'COO', ['outreach'])
        admin = make_user('ADM001', 'SCHOOL_ADMIN')
        for user, expected in ((ceo, 200), (cto, 200), (coo_no, 403), (coo_yes, 200), (admin, 403)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(BASE + 'summary/').status_code, expected, user.role)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(BASE + 'summary/').status_code, 401)


class NormaliserTests(SimpleTestCase):
    def test_regions_in_english_and_french(self):
        self.assertEqual(services.normalize_region('Nord-Ouest'), Region.NORTH_WEST)
        self.assertEqual(services.normalize_region('Extrême-Nord'), Region.FAR_NORTH)
        self.assertEqual(services.normalize_region('Littoral'), Region.LITTORAL)
        self.assertEqual(services.normalize_region('Mars'), Region.UNKNOWN)

    def test_levels(self):
        self.assertEqual(services.normalize_level('Maternelle'), Level.NURSERY)
        self.assertEqual(services.normalize_level('Secondaire'), Level.SECONDARY)
        self.assertEqual(services.normalize_level('Université'), Level.HIGHER)
        self.assertEqual(services.normalize_level('Technique'), Level.TECHNICAL)
        self.assertEqual(services.normalize_level(''), Level.OTHER)

    def test_default_language_follows_region(self):
        self.assertEqual(services.default_language(Region.SOUTH_WEST), 'en')
        self.assertEqual(services.default_language(Region.CENTRE), 'fr')


class ImportTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(make_user('CEO001', 'CEO'))

    def _post(self, text):
        f = SimpleUploadedFile('schools.csv', text.encode('utf-8'), content_type='text/csv')
        return self.client.post(BASE + 'contacts/import/', {'file': f}, format='multipart')

    def test_imports_french_headers_and_classifies(self):
        res = self._post('ecole;niveau;region;ville;email\nLycee Bilingue;Secondaire;Centre;Yaounde;INFO@lycee.cm\n'
                         'Bad Row;Primaire;Ouest;Bafoussam;not-an-email\n')
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.json()['created'], res.json()['skipped']), (1, 1))
        c = OutreachContact.objects.get()
        self.assertEqual((c.email, c.level, c.region, c.language), ('info@lycee.cm', 'secondary', 'centre', 'fr'))

    def test_reimport_never_resets_what_was_sent(self):
        c = contact('a@school.cm', region=Region.WEST, status=ContactStatus.SENT, sent_count=2)
        self._post('school_name,email,town\nNew Name,A@School.cm,Dschang\n')
        c.refresh_from_db()
        self.assertEqual((c.sent_count, c.status, c.town), (2, ContactStatus.SENT, 'Dschang'))
        self.assertEqual(OutreachContact.objects.count(), 1)

    def test_missing_columns_is_a_clear_error(self):
        res = self._post('foo,bar\n1,2\n')
        self.assertEqual(res.json()['created'], 0)
        self.assertIn('school_name and email', res.json()['errors'][0]['reason'])


@override_settings(OUTREACH_DAILY_CAP=3)
class SendTests(APITestCase):
    def setUp(self):
        self.user = make_user('CEO001', 'CEO')
        self.client.force_authenticate(self.user)
        self.deliver = mock.patch('apps.outreach.services._deliver', return_value=True)
        self.deliver_mock = self.deliver.start()
        self.addCleanup(self.deliver.stop)

    def _send(self, ids, **extra):
        return self.client.post(BASE + 'send/', {'contact_ids': [str(i) for i in ids], 'subject': 'Hello {school_name}',
                                                 'body': 'Hi.', **extra}, format='json')

    def test_pacing_respects_the_daily_cap_and_carries_on(self):
        cs = [contact(f'c{i}@s.cm') for i in range(5)]
        res = self._send([c.id for c in cs]).json()
        self.assertEqual((res['queued'], res['daily_cap']), (5, 3))
        self.assertEqual(res['sent_now'], 3)
        self.assertEqual(OutreachSend.objects.filter(status=SendStatus.SENT).count(), 3)
        self.assertEqual(services.process_queue(), 0)  # cap reached today
        with override_settings(OUTREACH_DAILY_CAP=10):
            self.assertEqual(services.process_queue(), 2)
        self.assertEqual(OutreachContact.objects.filter(status=ContactStatus.SENT).count(), 5)

    def test_contacted_schools_are_separated_and_not_mailed_twice(self):
        done = contact('done@s.cm', status=ContactStatus.SENT, sent_count=1)
        fresh = contact('fresh@s.cm')
        res = self._send([done.id, fresh.id]).json()
        self.assertEqual((res['queued'], res['already_contacted']), (1, 1))
        self.assertEqual(self.deliver_mock.call_count, 1)
        listing = self.client.get(BASE + 'contacts/?sent=no').json()['results']
        self.assertEqual(listing, [])  # fresh is now sent
        self.assertEqual(len(self.client.get(BASE + 'contacts/?sent=yes').json()['results']), 2)

    def test_resend_is_explicit(self):
        done = contact('done@s.cm', status=ContactStatus.SENT, sent_count=1)
        res = self._send([done.id], resend=True).json()
        self.assertEqual(res['queued'], 1)
        done.refresh_from_db()
        self.assertEqual(done.sent_count, 2)

    def test_opted_out_and_bounced_are_never_mailed(self):
        out = contact('out@s.cm', status=ContactStatus.UNSUBSCRIBED)
        bounced = contact('bounce@s.cm', status=ContactStatus.BOUNCED)
        res = self._send([out.id, bounced.id], resend=True).json()
        self.assertEqual((res['queued'], res['unsubscribed'], res['bounced']), (0, 1, 1))
        self.deliver_mock.assert_not_called()

    def test_provider_failure_is_recorded_and_does_not_count_as_sent(self):
        self.deliver_mock.return_value = False
        c = contact('x@s.cm')
        self._send([c.id])
        c.refresh_from_db()
        self.assertEqual((c.status, c.sent_count), (ContactStatus.FAILED, 0))
        self.assertTrue(c.last_error)

    def test_cancel_returns_queued_contacts_to_their_state(self):
        cs = [contact(f'c{i}@s.cm') for i in range(5)]
        self._send([c.id for c in cs])
        self.assertEqual(self.client.post(BASE + 'send/cancel/').json()['cancelled'], 2)
        self.assertEqual(OutreachContact.objects.filter(status=ContactStatus.QUEUED).count(), 0)
        self.assertEqual(OutreachContact.objects.filter(status=ContactStatus.NEW).count(), 2)

    def test_summary_groups_by_region(self):
        contact('a@s.cm', region=Region.LITTORAL)
        contact('b@s.cm', region=Region.LITTORAL, status=ContactStatus.SENT, sent_count=1)
        contact('c@s.cm', region=Region.WEST)
        data = self.client.get(BASE + 'summary/').json()
        litt = next(r for r in data['regions'] if r['region'] == 'littoral')
        self.assertEqual((litt['total'], litt['contacted'], litt['not_contacted']), (2, 1, 1))
        self.assertEqual(data['totals']['total'], 3)


class TypedEmailTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(make_user('CEO001', 'CEO'))
        patcher = mock.patch('apps.outreach.services._deliver', return_value=True)
        self.deliver_mock = patcher.start()
        self.addCleanup(patcher.stop)

    def _send(self, emails, **extra):
        return self.client.post(BASE + 'send/', {'emails': emails, 'subject': 'Hello', 'body': 'Hi.', **extra},
                                format='json')

    def test_parse_accepts_commas_lines_and_names(self):
        valid, invalid = services.parse_emails('A@x.cm, b@y.cm;\nName <c@z.cm>  a@x.cm  oops')
        self.assertEqual(valid, ['a@x.cm', 'b@y.cm', 'c@z.cm'])
        self.assertEqual(invalid, ['oops'])

    def test_many_typed_addresses_create_contacts_and_are_sent_within_the_cap(self):
        with override_settings(OUTREACH_DAILY_CAP=3):
            res = self._send('\n'.join(f'school{i}@s.cm' for i in range(5))).json()
        self.assertEqual((res['queued'], res['added'], res['invalid']), (5, 5, []))
        self.assertEqual(res['sent_now'], 3)
        self.assertEqual(OutreachContact.objects.count(), 5)

    def test_addresses_already_emailed_are_skipped_unless_resend(self):
        contact('done@s.cm', status=ContactStatus.SENT, sent_count=1)
        res = self._send('done@s.cm, new@s.cm').json()
        self.assertEqual((res['queued'], res['already_contacted'], res['added']), (1, 1, 1))
        self.assertEqual(self._send('done@s.cm', resend=True).json()['queued'], 1)

    def test_unsubscribed_typed_address_is_never_mailed(self):
        contact('out@s.cm', status=ContactStatus.UNSUBSCRIBED)
        res = self._send('out@s.cm', resend=True).json()
        self.assertEqual((res['queued'], res['unsubscribed']), (0, 1))
        self.deliver_mock.assert_not_called()

    def test_nothing_valid_is_a_clear_error(self):
        res = self._send('hello world')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['invalid'], ['hello', 'world'])
        self.assertEqual(self.client.post(BASE + 'send/', {'subject': 's', 'body': 'b'}, format='json').status_code, 400)

    def test_limit_per_send(self):
        res = self._send(','.join(f'a{i}@s.cm' for i in range(services.MAX_TYPED_EMAILS + 1)))
        self.assertEqual(res.status_code, 400)


class UnsubscribeTests(APITestCase):
    def test_get_does_not_unsubscribe_post_does_and_queued_is_cancelled(self):
        c = contact('u@s.cm', status=ContactStatus.QUEUED)
        campaign = services.OutreachCampaign.objects.create(subject='s', body='b')
        send = OutreachSend.objects.create(campaign=campaign, contact=c)
        url = f'{BASE}unsubscribe/{c.unsubscribe_token}/'
        self.assertEqual(self.client.get(url).status_code, 200)
        c.refresh_from_db()
        self.assertNotEqual(c.status, ContactStatus.UNSUBSCRIBED)
        self.assertEqual(self.client.post(url).status_code, 200)
        c.refresh_from_db()
        send.refresh_from_db()
        self.assertEqual((c.status, send.status), (ContactStatus.UNSUBSCRIBED, SendStatus.CANCELLED))
        self.assertEqual(self.client.get(BASE + 'unsubscribe/nope/').status_code, 404)


class EmailFormatTests(SimpleTestCase):
    def test_footer_unsubscribe_and_language(self):
        c = OutreachContact(school_name='Lycee X', town='Buea', email='a@b.cm', language='fr', unsubscribe_token='tok')
        subject, html, text = services.render_email('Pour {school_name}', 'Bonjour\n\nA bientot <b>', c)
        self.assertEqual(subject, 'Pour Lycee X')
        self.assertIn('/unsubscribe/tok/', html)
        self.assertIn('Se d', html)
        self.assertNotIn('<b>', html)  # the founder's text is escaped, never trusted as HTML
        self.assertIn('/unsubscribe/tok/', text)

    @override_settings(EMAIL_FROM_ADDRESS='no-reply@eduignite.online')
    def test_outreach_uses_info_sender_and_one_click_header(self):
        payload = email_service._brevo_payload(
            to_email='a@b.cm', to_name='A', subject='s', html='h', text='t', sender_name='EduIgnite Team',
            reply_to_email='info@eduignite.online', sender_email='info@eduignite.online',
            headers={'List-Unsubscribe': '<https://x>'})
        self.assertEqual(payload['sender']['email'], 'info@eduignite.online')
        self.assertEqual(payload['replyTo']['email'], 'info@eduignite.online')
        self.assertEqual(payload['headers']['List-Unsubscribe'], '<https://x>')

    @override_settings(EMAIL_FROM_ADDRESS='no-reply@eduignite.online')
    def test_other_emails_keep_the_default_sender(self):
        payload = email_service._brevo_payload(to_email='a@b.cm', to_name='A', subject='s', html='h', text='t',
                                               sender_name='EduIgnite')
        self.assertEqual(payload['sender']['email'], 'no-reply@eduignite.online')
        self.assertNotIn('headers', payload)

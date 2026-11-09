"""Public QR verification: ID cards, report cards, fee receipts.

Covers every endpoint a printed QR can reach: valid, tampered token, unknown id,
other-school isolation, draft school, no login needed, and no private data.
Also checks that every QR generator builds a URL that matches a page that exists
in the website's ``app/verify`` folder.
"""
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from apps.fees.models import Payment
from apps.fees.utils import receipt_verification, receipt_verify_token
from apps.grades.models import ClassSubject, Grade, Sequence, Subject
from apps.grades.utils import build_report_card_verification
from apps.schools.models import School, SchoolClass, SchoolSettings
from apps.students.models import Student
from core import verification

User = get_user_model()


def _school(sid, name, matricule, drafted=False):
    school = School.objects.create(
        id=sid, name=name, short_name=sid, principal='P', location='Yaounde',
        email=f'{sid}@example.com', phone='237651000113',
        school_type='general', subsystem='anglophone', matricule=matricule,
        is_drafted=drafted,
    )
    SchoolSettings.objects.create(school=school, academic_year='2026/2027', term='First')
    return school


def _student(school, n, adm):
    klass = SchoolClass.objects.create(school=school, name='Form 1 A')
    user = User.objects.create_user(
        matricule=f'{school.matricule}ST{n:04d}', name=f'Pupil {school.id}',
        email=f'p{school.id}@example.com', role='STUDENT', school=school,
        password='password123', is_license_paid=True,
    )
    return Student.objects.create(
        user=user, school=school, school_class=klass, student_class='Form 1 A',
        class_level='Form 1', section='General', admission_number=adm,
        guardian_name='Secret Guardian', guardian_phone='237677000222',
    )


PRIVATE_MARKERS = ('Secret Guardian', '237677000222', '@example.com', 'password')


class PublicVerificationBase(APITestCase):
    def setUp(self):
        cache.clear()  # the public_verify throttle lives in the cache
        self.school_a = _school('VRA', 'Alpha College', 'ALPHA01')
        self.school_b = _school('VRB', 'Beta College', 'BETA01')
        self.school_draft = _school('VRD', 'Draft College', 'DRAFT01', drafted=True)
        # Admission numbers repeat across schools.
        self.stu_a = _student(self.school_a, 1, '0001')
        self.stu_b = _student(self.school_b, 1, '0001')
        self.stu_d = _student(self.school_draft, 1, '0009')
        subj = Subject.objects.create(school=self.school_a, name='Maths', code='M', level='Form 1', coefficient=2)
        ClassSubject.objects.create(
            school_class=self.stu_a.school_class, subject=subj, type=ClassSubject.SubjectType.MANDATORY,
        )
        self.seq = Sequence.objects.create(
            school=self.school_a, academic_year='2026/2027', name='Sequence 1', term=1,
            start_date='2026-09-01', end_date='2026-10-31', is_active=True,
        )
        Grade.objects.create(student=self.stu_a, subject=subj, sequence=self.seq, score=15)

    def assertNoPrivateData(self, response):
        body = response.content.decode('utf-8')
        for marker in PRIVATE_MARKERS:
            self.assertNotIn(marker, body, marker)


class IdCardVerificationTests(PublicVerificationBase):
    def _get(self, adm='0001', school='ALPHA01'):
        suffix = f'?school={school}' if school else ''
        return self.client.get(f'/api/v1/students/students/verify/{adm}/{suffix}')

    def test_valid_without_login_and_minimal(self):
        r = self._get()
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['result'], 'valid')
        self.assertTrue(r.data['valid'])
        self.assertEqual(r.data['document_type'], 'id_card')
        self.assertEqual(r.data['school_name'], 'Alpha College')
        self.assertEqual(r.data['class_name'], 'Form 1 A')
        self.assertNoPrivateData(r)

    def test_other_school_isolation(self):
        r = self._get(school='BETA01')
        self.assertEqual(r.data['school_name'], 'Beta College')
        # Alpha's 0001 is not reachable through Beta, and vice versa.
        self.assertEqual(self._get(adm='0009', school='ALPHA01').status_code, 404)

    def test_unknown_admission_is_not_valid(self):
        r = self._get(adm='9999')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.data['result'], 'not_valid')
        self.assertFalse(r.data['valid'])

    def test_shared_number_without_school_is_ambiguous_not_valid(self):
        r = self._get(school=None)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data['result'], 'not_valid')

    def test_draft_school_is_never_confirmed(self):
        r = self._get(adm='0009', school='DRAFT01')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.data['result'], 'not_valid')

    def test_deactivated_pupil_is_revoked(self):
        User.objects.filter(pk=self.stu_a.user_id).update(is_active=False)
        r = self._get()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['result'], 'revoked')
        self.assertFalse(r.data['valid'])


class ReportCardVerificationTests(PublicVerificationBase):
    def _url(self, adm='0001', year='2026-2027', key=None, school='ALPHA01'):
        key = key or f'seq-{self.seq.id}'
        suffix = f'?school={school}' if school else ''
        return f'/api/v1/grades/grades/verify-report-card/{adm}/{year}/{key}/{suffix}'

    def test_valid_without_login_shows_header_facts_only(self):
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['result'], 'valid')
        self.assertEqual(r.data['document_type'], 'report_card')
        self.assertEqual(r.data['school_name'], 'Alpha College')
        self.assertEqual(r.data['class_name'], 'Form 1 A')
        self.assertEqual(r.data['academic_year'], '2026/2027')
        self.assertEqual(r.data['term'], 1)
        # A URL without the card's signed token (legacy QR, guessable address)
        # is header-only and says where the details are.
        self.assertEqual(r.data['detail_level'], 'header')
        self.assertIn('Scan the QR', r.data['hint'])
        # No marks, ranks or remarks are public.
        for leaked in ('grades', 'subjects', 'average', 'rank', 'Maths'):
            self.assertNotIn(leaked, r.content.decode('utf-8'), leaked)
        self.assertNoPrivateData(r)

    def test_both_year_forms_resolve(self):
        self.assertEqual(self.client.get(self._url(year='2026-2027')).status_code, 200)
        self.assertEqual(self.client.get(self._url(year='2026%2F2027')).status_code, 200)

    def test_unknown_student_and_bad_key_are_not_valid(self):
        self.assertEqual(self.client.get(self._url(adm='9999')).data['result'], 'not_valid')
        bad = self.client.get(self._url(key='garbage'))
        self.assertEqual(bad.status_code, 404)
        self.assertEqual(bad.data['result'], 'not_valid')

    def test_other_school_sequence_is_not_used(self):
        r = self.client.get(self._url(adm='0001', school='BETA01'))
        # Beta's pupil has no marks in Alpha's sequence: not a valid card.
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.data['result'], 'not_valid')

    def test_draft_school_not_confirmed(self):
        r = self.client.get(self._url(adm='0009', school='DRAFT01', key='term-1'))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.data['result'], 'not_valid')

    def test_html_page_is_minimal_and_public(self):
        url = self._url().replace('verify-report-card', 'verify-report-card-page')
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        text = r.content.decode('utf-8')
        self.assertIn('Report card verified', text)
        self.assertNotIn('Maths', text)


class ReceiptVerificationTests(PublicVerificationBase):
    def setUp(self):
        super().setUp()
        self.payment = Payment.objects.create(
            school=self.school_a, payer=self.stu_a.user, amount=65000, payment_method='cash',
            status='confirmed', payment_date=date(2026, 11, 7), receipt_number='REC-20261107-00001',
        )

    def _get(self, token):
        return self.client.get(f'/api/v1/fees/verify-receipt/{token}/')

    def test_valid_without_login_hides_payer(self):
        r = self._get(receipt_verify_token(self.payment))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['result'], 'valid')
        self.assertEqual(r.data['document_type'], 'fee_receipt')
        self.assertEqual(r.data['receipt_number'], 'REC-20261107-00001')
        self.assertEqual(r.data['school_name'], 'Alpha College')
        self.assertNotIn('Pupil VRA', r.content.decode('utf-8'))
        self.assertNoPrivateData(r)

    def test_tampered_and_unknown_tokens(self):
        good = receipt_verify_token(self.payment)
        for bad in (good[:-2] + 'xx', 'nonsense', good.split('.')[0]):
            r = self._get(bad)
            self.assertEqual(r.status_code, 404, bad)
            self.assertEqual(r.data['result'], 'not_valid')

    def test_refunded_is_revoked(self):
        Payment.objects.filter(pk=self.payment.pk).update(status='refunded')
        r = self._get(receipt_verify_token(self.payment))
        self.assertEqual(r.data['result'], 'revoked')
        self.assertFalse(r.data['valid'])

    def test_draft_school_receipt_not_confirmed(self):
        School.objects.filter(pk=self.school_a.pk).update(is_drafted=True)
        r = self._get(receipt_verify_token(self.payment))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.data['result'], 'not_valid')


class PublicVerifyThrottleTests(PublicVerificationBase):
    def test_public_verify_is_rate_limited(self):
        from unittest import mock

        with mock.patch.object(verification.PublicVerifyThrottle, 'THROTTLE_RATES', {'public_verify': '3/min'}):
            codes = [
                self.client.get('/api/v1/students/students/verify/0001/?school=ALPHA01').status_code
                for _ in range(5)
            ]
        self.assertIn(429, codes)


# ---------------------------------------------------------------------------
# Every QR generator must produce a URL that a website page serves
# ---------------------------------------------------------------------------
WEBSITE_VERIFY_DIR = Path(__file__).resolve().parents[3] / 'apps' / 'website' / 'src' / 'app' / 'verify'


def _website_verify_patterns():
    """Regexes for every page.tsx under app/verify, e.g. /verify/student/[admissionNumber]."""
    patterns = []
    for page in WEBSITE_VERIFY_DIR.rglob('page.tsx'):
        parts = ['verify'] + list(page.relative_to(WEBSITE_VERIFY_DIR).parent.parts)
        regex = ''
        for part in parts:
            if part.startswith('[[...'):
                # The optional catch-all is the friendly "unrecognised link" page;
                # counting it would make every URL look served.
                regex = None
                break
            elif part.startswith('[...'):
                regex += r'/.+'
            elif part.startswith('['):
                regex += r'/[^/]+'
            else:
                regex += '/' + re.escape(part)
        if regex is not None:
            patterns.append(re.compile('^' + regex + '$'))
    return patterns


class QrUrlMatchesWebsiteRouteTests(PublicVerificationBase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not WEBSITE_VERIFY_DIR.exists():
            raise __import__('unittest').SkipTest('website sources are not part of this checkout')

    def _assert_served(self, url):
        path = urlsplit(url).path
        self.assertTrue(
            any(p.match(path) for p in _website_verify_patterns()),
            f'{path} is not served by any page under apps/website/src/app/verify',
        )

    @override_settings(FRONTEND_URL='https://eduignite.online/')
    def test_id_card_qr_url(self):
        url = self.stu_a.verify_url()
        self.assertTrue(url.startswith('https://eduignite.online/verify/student/0001?school=ALPHA01'), url)
        self._assert_served(url)

    @override_settings(FRONTEND_URL='eduignite.online')
    def test_report_card_qr_url_even_with_slash_in_year(self):
        info = build_report_card_verification(self.stu_a, '2026/2027', sequence=self.seq)
        self.assertTrue(info['verify_url'].startswith('https://eduignite.online/verify/report-card/0001/2026-2027/seq-'))
        self._assert_served(info['verify_url'])
        term_info = build_report_card_verification(self.stu_a, '2026/2027', term=2)
        self._assert_served(term_info['verify_url'])
        self.assertTrue(info['qr_code'].startswith('data:image/png;base64,'))

    def test_report_card_qr_url_with_token_is_served_and_token_is_not_the_admission_number(self):
        from apps.grades import card_verification

        data = {'school': {}, 'student': {}, 'sequence': {}, 'grades': [{'subject_name': 'Maths', 'score': 15}]}
        issue = card_verification.issue_report_card(self.stu_a, data, sequence=self.seq)
        token = card_verification.issue_token(issue)
        info = build_report_card_verification(self.stu_a, '2026/2027', sequence=self.seq, token=token)
        self.assertIn(f'&t={token}', info['verify_url'])
        self._assert_served(info['verify_url'])
        self.assertEqual(card_verification.resolve_issue(token).pk, issue.pk)
        self.assertIsNone(card_verification.resolve_issue(token[:-1] + ('A' if token[-1] != 'A' else 'B')))

    def test_receipt_qr_url(self):
        payment = Payment.objects.create(
            school=self.school_a, payer=self.stu_a.user, amount=100, payment_method='cash',
            status='confirmed', payment_date=date(2026, 11, 7), receipt_number='REC-1',
        )
        info = receipt_verification(payment)
        self.assertIn('/verify/receipt/', info['verify_url'])
        self._assert_served(info['verify_url'])

    def test_every_registered_kind_has_a_website_page(self):
        for kind in verification.VERIFY_ROUTES:
            parts = {name: 'x' for name in re.findall(r'{(\w+)}', verification.VERIFY_ROUTES[kind])}
            self._assert_served(verification.build_verify_url(kind, **parts))

    def test_a_slash_in_an_admission_number_cannot_split_the_path(self):
        url = verification.build_verify_url('student', admission='EI/2026/0001')
        self.assertEqual(urlsplit(url).path.count('/'), 3)  # /verify/student/<one segment>


class PublicSiteBaseTests(SimpleTestCase):
    @override_settings(FRONTEND_URL='https://eduignite.online/')
    def test_trailing_slash_is_stripped(self):
        self.assertEqual(verification.public_site_base(), 'https://eduignite.online')

    @override_settings(FRONTEND_URL='')
    def test_empty_setting_falls_back_to_production_site(self):
        self.assertEqual(verification.public_site_base(), 'https://eduignite.online')

    @override_settings(FRONTEND_URL='eduignite.online')
    def test_scheme_is_added(self):
        self.assertEqual(verification.public_site_base(), 'https://eduignite.online')


class SignedTokenTests(SimpleTestCase):
    def test_round_trip_and_tamper(self):
        token = verification.sign_token('salt-a', b'0123456789abcdef')
        self.assertEqual(verification.unsign_token('salt-a', token), b'0123456789abcdef')
        self.assertIsNone(verification.unsign_token('salt-b', token))  # other purpose
        body, sig = token.split('.')
        self.assertIsNone(verification.unsign_token('salt-a', body + '.' + sig[::-1]))
        for junk in ('', None, '.', 'x', 'a.b.c', body):
            self.assertIsNone(verification.unsign_token('salt-a', junk))
        self.assertLessEqual(len(token), 50)  # short enough for a light QR

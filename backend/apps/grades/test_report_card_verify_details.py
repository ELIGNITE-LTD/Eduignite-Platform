"""Token-gated full details on the public report-card verification page.

The QR printed on a card carries a signed credential (``t=``). Only that URL
shows the exact card; admission-number-only URLs keep returning header facts.
"""
from urllib.parse import parse_qs, urlsplit

from django.core.cache import cache
from rest_framework.test import APIClient

from apps.students import api as students_api

from . import card_verification
from .models import AssessmentArea, AssessmentRating, Grade, Sequence
from .test_assessment_config import AssessmentWorld
from .utils import generate_term_report_card_data

PRIVATE = ('Papa Pupil', 'guardian_phone', '237677', '@example.com', 'date_of_birth', 'password')
CARD = '/api/v1/grades/grades/report_card/'
VERIFY = '/api/v1/grades/grades/verify-report-card/'


def _token_of(verify_url):
    return parse_qs(urlsplit(verify_url).query)['t'][0]


class VerifyDetailsBase(AssessmentWorld):
    def setUp(self):
        cache.clear()

    def card(self, w, **params):
        """The report-card API payload an admin gets (this is what gets printed)."""
        client = APIClient()
        client.force_authenticate(w['admin'])
        params = {'student_id': str(w['pupil'].id), **params}
        r = client.get(CARD, params)
        self.assertEqual(r.status_code, 200, r.content)
        return r.data

    def verify(self, w, data, *, token='auto', adm=None, key='term-1', year='2026-2027', school=None):
        if token == 'auto':
            token = _token_of(data['verify_url'])
        url = f'{VERIFY}{adm or w["pupil"].admission_number}/{year}/{key}/?school={school or w["school"].matricule}'
        if token:
            url += f'&t={token}'
        return APIClient().get(url)

    def assertNoPrivate(self, response):
        body = response.content.decode('utf-8')
        for marker in PRIVATE:
            self.assertNotIn(marker, body, marker)


class PrimaryAndSecondaryDetailsTests(VerifyDetailsBase):
    def primary(self):
        w = self.make('VDP1', 'basic', {'preset': 'primary_numeric'}, cycle='primary')
        seqs = self.sequences(w['school'], count=6)
        for seq, score in zip(seqs, (17, 15, 12, 12, 9, 11)):
            Grade.objects.create(student=w['pupil'], subject=w['subject'], sequence=seq, score=score)
        return w

    def test_valid_token_shows_exact_card_as_the_builder_computes_it(self):
        w = self.primary()
        data = self.card(w, term=1, academic_year='2026-2027')
        self.assertIn('t=', data['verify_url'])
        r = self.verify(w, data)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['result'], 'valid')
        self.assertEqual(r.data['detail_level'], 'full')
        d = r.data['details']
        built = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        self.assertEqual(d['average'], built['average'])
        self.assertEqual(d['rank'], built['rank'])
        self.assertEqual(d['total_students'], built['total_students'])
        self.assertEqual(d['grades'][0]['score'], built['grades'][0]['score'])
        self.assertEqual(d['grades'][0]['coefficient'], built['grades'][0]['coefficient'])
        self.assertEqual(d['grades'][0]['remark'], built['grades'][0]['remark'])
        self.assertEqual(d['student']['class_name'], 'Class 3 A')
        self.assertEqual(d['school']['principal'], 'Mme Principal')
        self.assertEqual(r.data['integrity']['status'], 'match')
        self.assertNoPrivate(r)

    def test_response_is_never_cached_or_indexed(self):
        w = self.primary()
        r = self.verify(w, self.card(w, term=1, academic_year='2026-2027'))
        self.assertIn('no-store', r['Cache-Control'])
        self.assertIn('noindex', r['X-Robots-Tag'])

    def test_legacy_url_without_token_is_header_only(self):
        w = self.primary()
        self.card(w, term=1, academic_year='2026-2027')
        r = self.verify(w, None, token=None)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['result'], 'valid')
        self.assertEqual(r.data['detail_level'], 'header')
        self.assertIn('Scan the QR', r.data['hint'])
        for key in ('details', 'integrity'):
            self.assertNotIn(key, r.data)
        body = r.content.decode('utf-8')
        for leaked in ('Mathematics', '"grades"', '"average"', '"rank"'):
            self.assertNotIn(leaked, body)

    def test_printing_twice_is_idempotent_and_changed_marks_make_a_new_issue(self):
        w = self.primary()
        first = self.card(w, term=1, academic_year='2026-2027')
        again = self.card(w, term=1, academic_year='2026-2027')
        self.assertEqual(first['verify_url'], again['verify_url'])
        self.assertEqual(w['pupil'].report_card_issues.count(), 1)
        grade = Grade.objects.filter(student=w['pupil'], sequence__term=1).first()
        Grade.objects.filter(pk=grade.pk).update(score=3)
        third = self.card(w, term=1, academic_year='2026-2027')
        self.assertNotEqual(first['verify_url'], third['verify_url'])
        self.assertEqual(w['pupil'].report_card_issues.count(), 2)

    def test_tampered_malformed_and_foreign_tokens_are_the_same_404(self):
        w = self.primary()
        good = _token_of(self.card(w, term=1, academic_year='2026-2027')['verify_url'])
        bodies = set()
        for bad in (good[:-2] + ('AA' if not good.endswith('AA') else 'BB'), 'nonsense', good.split('.')[0], '.', 'a.b'):
            r = self.verify(w, None, token=bad)
            self.assertEqual(r.status_code, 404, bad)
            self.assertEqual(r.data['result'], 'not_valid')
            self.assertNotIn('details', r.data)
            bodies.add(r.content)
        self.assertEqual(len(bodies), 1)  # no oracle: every failure reads the same

    def test_token_for_one_pupil_cannot_open_another(self):
        w = self.primary()
        other = students_api.enrol_student(
            user=None, name='Other Pupil', matricule='VDP1ST0002', school=w['school'], school_class=w['class'],
            student_class='Class 3 A', class_level='Class 3 A', section='English', admission_number='VDP1-ADM-2',
        )
        token_a = _token_of(self.card(w, term=1, academic_year='2026-2027')['verify_url'])
        r = APIClient().get(f'{VERIFY}{other.admission_number}/2026-2027/term-1/?school={w["school"].matricule}&t={token_a}')
        self.assertEqual(r.status_code, 404)
        self.assertNotIn('details', r.data)
        # ... nor another period of the same pupil
        r = self.verify(w, None, token=token_a, key='term-2')
        self.assertEqual(r.status_code, 404)

    def test_marks_changed_after_issue_flag_the_card_and_show_both_sides(self):
        w = self.primary()
        data = self.card(w, term=1, academic_year='2026-2027')
        issued = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        grade = Grade.objects.filter(student=w['pupil'], sequence__term=1).first()
        Grade.objects.filter(pk=grade.pk).update(score=2)
        r = self.verify(w, data)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['integrity']['status'], 'changed')
        self.assertTrue(r.data['integrity']['changes'])
        self.assertIn('average', r.data['integrity']['current'])
        # The page still shows what was printed.
        self.assertEqual(r.data['details']['average'], issued['average'])

    def test_deleted_marks_are_not_valid(self):
        w = self.primary()
        data = self.card(w, term=1, academic_year='2026-2027')
        Grade.objects.filter(student=w['pupil']).delete()
        r = self.verify(w, data)
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.data['result'], 'not_valid')
        self.assertNotIn('details', r.data)

    def test_draft_school_and_deactivated_states(self):
        from apps.schools.models import School

        w = self.primary()
        data = self.card(w, term=1, academic_year='2026-2027')
        issue = w['pupil'].report_card_issues.get()
        issue.is_revoked = True
        issue.save()
        r = self.verify(w, data)
        self.assertEqual(r.data['result'], 'revoked')
        self.assertNotIn('details', r.data)
        issue.is_revoked = False
        issue.save()
        School.objects.filter(pk=w['school'].pk).update(is_drafted=True)
        r = self.verify(w, data)
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.data['result'], 'not_valid')

    def test_withdrawn_publication_is_revoked(self):
        from .models import ReportCardPublication

        w = self.primary()
        data = self.card(w, term=1, academic_year='2026-2027')
        ReportCardPublication.objects.create(
            school=w['school'], school_class=w['class'], class_name=w['class'].name,
            scope='TERM', term=1, academic_year='2026-2027', is_published=False,
        )
        r = self.verify(w, data)
        self.assertEqual(r.data['result'], 'revoked')
        self.assertNotIn('details', r.data)

    def test_secondary_sequence_card_matches_builder(self):
        w = self.make('VDS1', 'secondary')
        seq = self.sequences(w['school'], count=3)[0]
        Grade.objects.create(student=w['pupil'], subject=w['subject'], sequence=seq, score=14)
        data = self.card(w, sequence_id=str(seq.id))
        self.assertIn(f'/seq-{seq.id}', data['verify_url'])
        r = self.verify(w, data, key=f'seq-{seq.id}')
        self.assertEqual(r.status_code, 200, r.content)
        built = card_verification.public_card_summary(data)
        self.assertEqual(r.data['details'], built)
        self.assertEqual(r.data['details']['rank'], data['rank'])
        self.assertEqual(r.data['details']['grades'][0]['total'], data['grades'][0]['total'])
        self.assertNoPrivate(r)

    def test_summary_has_no_private_fields(self):
        w = self.primary()
        summary = card_verification.public_card_summary(
            generate_term_report_card_data(w['pupil'], 1, '2026-2027'),
        )
        text = str(summary)
        for marker in ('Papa Pupil', 'guardian', 'date_of_birth', 'avatar', 'photo', str(w['pupil'].id)):
            self.assertNotIn(marker, text, marker)

    def test_token_endpoint_is_throttled(self):
        from unittest import mock

        from core import verification

        w = self.primary()
        with mock.patch.object(verification.PublicVerifyThrottle, 'THROTTLE_RATES', {'public_verify': '3/min'}):
            codes = [self.verify(w, None, token='junk').status_code for _ in range(5)]
        self.assertIn(429, codes)


class NurseryDetailsTests(VerifyDetailsBase):
    def test_nursery_shows_rating_areas_not_marks(self):
        w = self.make('VDN1', 'basic', {'preset': 'nursery_descriptive'}, cycle='nursery')
        self.sequences(w['school'], count=3)
        area = AssessmentArea.objects.create(school=w['school'], name='Language', name_fr='Langage', order_index=1)
        AssessmentRating.objects.create(
            school=w['school'], student=w['pupil'], area=area, academic_year='2026-2027', term=1, level=3,
        )
        data = self.card(w, term=1, academic_year='2026-2027')
        r = self.verify(w, data)
        self.assertEqual(r.status_code, 200, r.content)
        d = r.data['details']
        self.assertEqual(d['layout'], 'nursery')
        self.assertEqual(d['areas'][0]['name'], 'Language')
        self.assertEqual(d['areas'][0]['label'], 'Secure')
        self.assertIsNone(d['rank'])
        self.assertEqual(r.data['integrity']['status'], 'match')
        self.assertNoPrivate(r)

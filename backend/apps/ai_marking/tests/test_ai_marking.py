"""AI exam marking: upload, cost, authorise, mark, teacher review, share with students, and student questions."""

import io
import json
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.ai_features import credit_engine
from apps.ai_features.credit_models import AICreditHold
from apps.ai_features.tests_credits import enable_billing
from apps.ai_marking import services
from apps.ai_marking.models import MarkedScript, MarkingChallenge, MarkingJob, MarkingPage
from apps.higher_ed.tests.test_higher_ed import make_school, make_user
from apps.registry import api as registry_api
from apps.students.models import Student

BASE = '/api/v1/ai-marking/'


def pdf_pages(n):
    import pymupdf as fitz

    doc = fitz.open()
    for i in range(n):
        page = doc.new_page()
        page.insert_text((72, 72), f'Page {i + 1}')
    return doc.tobytes()


def fake_model(prompt, images, *, max_tokens):
    """What the provider would answer for one script, with the usage the credit engine bills."""
    from apps.ai_features import credit_engine as ce

    if 'marking scheme' in prompt.lower() and 'Reply with ONLY' not in prompt:
        text = '1. Photosynthesis (3)\n2. Osmosis (2)'
    else:
        text = json.dumps({
            'student_name': 'Ada Nkeng', 'student_matricule': 'S-001',
            'questions': [{'no': '1', 'max': 3, 'awarded': 2, 'student_answer': 'plants make food', 'comment': 'Idea is right', 'correction': 'Light energy to glucose'},
                          {'no': '2', 'max': 2, 'awarded': 9, 'student_answer': 'water moves', 'comment': 'ok', 'correction': ''}],
            'feedback': 'Good start.'})
    result = {'success': True, 'response': text, 'input_tokens': 2500, 'output_tokens': 500, 'cached_tokens': 0, 'model': 'test-model', 'processing_time_ms': 5}
    ce.record_provider_call(result)
    return result


class MarkingTests(APITestCase):
    def setUp(self):
        enable_billing()
        self.school = make_school('MK-1', 'secondary')
        self.other = make_school('MK-2', 'secondary')
        registry_api.install_defaults(self.school)
        registry_api.install_defaults(self.other)
        registry_api.install(self.school, 'ai_features')
        self.teacher = make_user('TCH-MK1', 'TEACHER', self.school)
        self.other_teacher = make_user('TCH-MK2', 'TEACHER', self.school)
        self.pupil_user = make_user('S-001', 'STUDENT', self.school)
        self.student = Student.objects.create(school=self.school, user=self.pupil_user, student_class='Form 1', admission_number='A1')
        self.pupil2_user = make_user('S-002', 'STUDENT', self.school)
        self.student2 = Student.objects.create(school=self.school, user=self.pupil2_user, student_class='Form 1', admission_number='A2')
        credit_engine.grant(self.teacher, 5000, 'purchase', reference_id='test-grant')
        self.client.force_authenticate(self.teacher)

    def create(self, **extra):
        roster = [{'id': str(self.student.id)}, {'id': str(self.student2.id)}]
        data = {'title': 'Biology Seq 2', 'approach': 'idea_based', 'paper_total': '5', 'pages_per_script': '2', 'scheme_text': '1. Photosynthesis (3)\n2. Osmosis (2)',
                'roster': json.dumps(roster), 'script_files': SimpleUploadedFile('scripts.pdf', pdf_pages(4), content_type='application/pdf'), **extra}
        return self.client.post(BASE + 'jobs/', data, format='multipart')

    def run_marking(self, job_id):
        with patch('apps.ai_marking.views._enqueue', side_effect=lambda j: services.run_job(j) or True), \
                patch('apps.ai_marking.services._call_model', side_effect=fake_model):
            return self.client.post(f'{BASE}jobs/{job_id}/start/')

    def test_whole_flow(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.data['script_count'], r.data['page_count']), (2, 4))
        self.assertGreater(r.data['estimate_credits'], 0)
        self.assertTrue(r.data['can_afford'])
        job_id = r.data['id']
        before = credit_engine.balance(self.teacher)['total_available']
        started = self.run_marking(job_id)
        self.assertEqual(started.status_code, 200, started.content)
        job = self.client.get(f'{BASE}jobs/{job_id}/').data
        self.assertEqual((job['status'], job['progress']), ('review', 2))
        self.assertEqual(MarkingPage.objects.filter(job_id=job_id).count(), 0)          # pictures are deleted once marked
        first = job['scripts'][0]
        self.assertEqual(first['total'], 4.0)                                           # 2 + 2: the impossible 9/2 was clamped to the maximum
        self.assertEqual(first['student'], str(self.student.id))                         # matched by matricule
        self.assertLess(credit_engine.balance(self.teacher)['total_available'], before)  # credits were charged for the work
        self.assertFalse(AICreditHold.objects.filter(status=AICreditHold.HELD).exists())

        # Both scripts claim the same student (the fake answers the same): the second must be given to someone else before approval.
        second = job['scripts'][1]
        self.assertEqual(self.client.post(f'{BASE}scripts/{second["id"]}/approve/', {}, format='json').status_code, 200) if second['student'] else None
        patch_ok = self.client.patch(f'{BASE}scripts/{second["id"]}/', {'student': str(self.student2.id)}, format='json')
        self.assertEqual(patch_ok.status_code, 200, patch_ok.content)
        adj = self.client.patch(f'{BASE}scripts/{first["id"]}/', {'questions': [{'no': '1', 'max': 3, 'awarded': 3}, {'no': '2', 'max': 2, 'awarded': 1}]}, format='json')
        self.assertEqual(adj.data['total'], 4.0)
        self.assertTrue(adj.data['edited'])
        approved = self.client.post(f'{BASE}jobs/{job_id}/approve-all/', {}, format='json').data
        self.assertEqual(approved['approved'], 2)
        self.assertEqual(self.client.post(f'{BASE}jobs/{job_id}/publish/', {}, format='json').data['published'], 2)
        self.assertEqual(self.client.get(f'{BASE}jobs/{job_id}/pdf/')['Content-Type'], 'application/pdf')

        # The student sees their own paper only, can download it, and can question a mark.
        self.client.force_authenticate(self.pupil_user)
        mine = self.client.get(BASE + 'my/').data
        self.assertEqual(len(mine), 1)
        sid = mine[0]['id']
        self.assertEqual(self.client.get(f'{BASE}my/{sid}/pdf/')['Content-Type'], 'application/pdf')
        c = self.client.post(f'{BASE}my/{sid}/challenge/', {'question_no': '2', 'message': 'I answered this fully.'}, format='json')
        self.assertEqual(c.status_code, 201, c.content)
        self.assertEqual(self.client.post(f'{BASE}my/{sid}/challenge/', {'question_no': '2', 'message': 'Please look again.'}, format='json').status_code, 400)
        self.client.force_authenticate(self.pupil2_user)
        self.assertEqual(self.client.get(f'{BASE}my/{sid}/').status_code, 404)           # another student's paper

        # The teacher answers and changes the mark; the total follows.
        self.client.force_authenticate(self.teacher)
        open_ones = self.client.get(BASE + 'challenges/?status=open').data
        self.assertEqual(len(open_ones), 1)
        done = self.client.post(f'{BASE}challenges/{open_ones[0]["id"]}/respond/', {'response': 'You are right, thank you.', 'new_awarded': '2'}, format='json')
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(MarkedScript.objects.get(pk=sid).total, 5)
        self.assertEqual(MarkingChallenge.objects.get().status, 'resolved')

    def test_failed_marking_costs_nothing(self):
        r = self.create()
        before = credit_engine.balance(self.teacher)['total_available']

        def broken(prompt, images, *, max_tokens):
            raise RuntimeError('provider down')

        with patch('apps.ai_marking.views._enqueue', side_effect=lambda j: services.run_job(j) or True), patch('apps.ai_marking.services._call_model', side_effect=broken):
            self.client.post(f'{BASE}jobs/{r.data["id"]}/start/')
        self.assertEqual(MarkingJob.objects.get().status, 'failed')
        self.assertEqual(credit_engine.balance(self.teacher)['total_available'], before)

    def test_cannot_afford_is_refused_before_anything_starts(self):
        poor = make_user('TCH-MK3', 'TEACHER', self.school)
        self.client.force_authenticate(poor)
        r = self.create()
        self.assertEqual(r.status_code, 201)
        credit_engine.deduct(poor, credit_engine.balance(poor)['total_available'])
        started = self.client.post(f'{BASE}jobs/{r.data["id"]}/start/')
        self.assertIn(started.status_code, (402, 403))
        self.assertEqual(MarkingJob.objects.get().status, 'uploaded')

    def test_uploads_are_checked_and_jobs_are_private(self):
        self.assertEqual(self.create(pages_per_script='3').status_code, 400)             # 4 pages do not divide into scripts of 3
        bad = self.client.post(BASE + 'jobs/', {'title': 'x', 'paper_total': '5', 'scheme_text': 's', 'script_files': SimpleUploadedFile('a.pdf', b'not a pdf')}, format='multipart')
        self.assertEqual(bad.status_code, 400)
        job_id = self.create().data['id']
        self.client.force_authenticate(self.other_teacher)
        self.assertEqual(self.client.get(f'{BASE}jobs/{job_id}/').status_code, 403)
        self.client.force_authenticate(self.pupil_user)
        self.assertEqual(self.client.post(BASE + 'jobs/', {}, format='multipart').status_code, 403)

    def test_matching_and_clamping_helpers(self):
        roster = [{'id': '1', 'name': 'Ada Nkeng', 'matricule': 'S-001'}, {'id': '2', 'name': 'Brice Tabe', 'matricule': 'S-002'}]
        self.assertEqual(services.match_student(roster, '', 's 001')['id'], '1')
        self.assertEqual(services.match_student(roster, 'tabe brice', '')['id'], '2')
        self.assertIsNone(services.match_student(roster, 'Unknown Person', ''))
        q = services.clean_questions([{'no': 1, 'max': 4, 'awarded': 7}, {'no': 2, 'max': 2, 'awarded': -1}, 'junk'])
        self.assertEqual([x['awarded'] for x in q], [4.0, 0.0])

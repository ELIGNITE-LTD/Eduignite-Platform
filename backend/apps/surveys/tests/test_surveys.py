"""Tests for the Surveys API.

Follows the same conventions used elsewhere in this backend (see
``apps/academy/tests/test_academy.py``): plain ``django.test.TestCase`` +
DRF's ``APIClient`` with ``force_authenticate``, no factory_boy fixtures.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.surveys.models import Survey, SurveyAnswer, SurveyQuestion, SurveyResponse

User = get_user_model()


def _make_user(matricule, role='TEACHER', name=None, email=None):
    return User.objects.create_user(
        matricule=matricule,
        name=name or matricule,
        email=email or f'{matricule.lower()}@example.com',
        role=role,
        password='pass12345',
    )


class SurveyListTests(TestCase):
    def setUp(self):
        self.staff = _make_user('EDU-STAFF-0001')
        self.user = _make_user('EDU-USER-0001')
        self.client = APIClient()

        self.active_survey = Survey.objects.create(
            title='Active Survey', description='desc', is_active=True, created_by=self.staff,
        )
        SurveyQuestion.objects.create(
            survey=self.active_survey, question_text='How do you feel?',
            question_type=SurveyQuestion.QuestionType.TEXT, order=1,
        )
        self.inactive_survey = Survey.objects.create(
            title='Inactive Survey', is_active=False, created_by=self.staff,
        )

    def test_unauthenticated_list_is_rejected(self):
        response = self.client.get('/api/v1/surveys/')
        self.assertEqual(response.status_code, 401)

    def test_list_only_shows_active_surveys(self):
        self.client.force_authenticate(self.user)
        response = self.client.get('/api/v1/surveys/')
        self.assertEqual(response.status_code, 200)
        # Paginated (core.pagination.StandardResultsSetPagination) -> results
        # live under 'results', not the bare list.
        titles = [row['title'] for row in response.data['results']]
        self.assertIn('Active Survey', titles)
        self.assertNotIn('Inactive Survey', titles)

    def test_list_excludes_already_answered_surveys(self):
        SurveyResponse.objects.create(survey=self.active_survey, user=self.user)
        self.client.force_authenticate(self.user)
        response = self.client.get('/api/v1/surveys/')
        self.assertEqual(response.status_code, 200)
        titles = [row['title'] for row in response.data['results']]
        self.assertNotIn('Active Survey', titles)

    def test_list_includes_question_count(self):
        self.client.force_authenticate(self.user)
        response = self.client.get('/api/v1/surveys/')
        row = next(r for r in response.data['results'] if r['title'] == 'Active Survey')
        self.assertEqual(row['question_count'], 1)


class SurveyDetailTests(TestCase):
    def setUp(self):
        self.staff = _make_user('EDU-STAFF-0002')
        self.user = _make_user('EDU-USER-0002')
        self.client = APIClient()

        self.survey = Survey.objects.create(title='Detail Survey', created_by=self.staff)
        self.q2 = SurveyQuestion.objects.create(
            survey=self.survey, question_text='Second question',
            question_type=SurveyQuestion.QuestionType.TEXT, order=2,
        )
        self.q1 = SurveyQuestion.objects.create(
            survey=self.survey, question_text='First question',
            question_type=SurveyQuestion.QuestionType.SINGLE_CHOICE,
            options=['Yes', 'No'], order=1,
        )

    def test_detail_returns_ordered_questions(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(f'/api/v1/surveys/{self.survey.id}/')
        self.assertEqual(response.status_code, 200)
        questions = response.data['questions']
        self.assertEqual(len(questions), 2)
        self.assertEqual(questions[0]['question_text'], 'First question')
        self.assertEqual(questions[0]['question_type'], 'SINGLE_CHOICE')
        self.assertEqual(questions[0]['options'], ['Yes', 'No'])
        self.assertEqual(questions[1]['question_text'], 'Second question')


class SurveyRespondTests(TestCase):
    def setUp(self):
        self.staff = _make_user('EDU-STAFF-0003')
        self.user = _make_user('EDU-USER-0003')
        self.client = APIClient()

        self.survey = Survey.objects.create(title='Respond Survey', created_by=self.staff)
        self.q1 = SurveyQuestion.objects.create(
            survey=self.survey, question_text='Q1', question_type=SurveyQuestion.QuestionType.TEXT, order=1,
        )
        self.q2 = SurveyQuestion.objects.create(
            survey=self.survey, question_text='Q2', question_type=SurveyQuestion.QuestionType.SINGLE_CHOICE,
            options=['A', 'B'], order=2,
        )

    def _payload(self):
        return {
            'answers': [
                {'question_id': self.q1.id, 'answer_text': 'My free text answer'},
                {'question_id': self.q2.id, 'answer_text': 'A'},
            ],
        }

    def test_unauthenticated_respond_is_rejected(self):
        response = self.client.post(f'/api/v1/surveys/{self.survey.id}/respond/', self._payload(), format='json')
        self.assertEqual(response.status_code, 401)

    def test_respond_succeeds_and_creates_rows(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(f'/api/v1/surveys/{self.survey.id}/respond/', self._payload(), format='json')
        self.assertEqual(response.status_code, 201)

        self.assertEqual(SurveyResponse.objects.count(), 1)
        survey_response = SurveyResponse.objects.get()
        self.assertEqual(survey_response.survey_id, self.survey.id)
        self.assertEqual(survey_response.user_id, self.user.id)

        self.assertEqual(SurveyAnswer.objects.count(), 2)
        answers_by_question = {a.question_id: a.answer_text for a in SurveyAnswer.objects.all()}
        self.assertEqual(answers_by_question[self.q1.id], 'My free text answer')
        self.assertEqual(answers_by_question[self.q2.id], 'A')

    def test_respond_twice_is_rejected_cleanly(self):
        self.client.force_authenticate(self.user)
        first = self.client.post(f'/api/v1/surveys/{self.survey.id}/respond/', self._payload(), format='json')
        self.assertEqual(first.status_code, 201)

        second = self.client.post(f'/api/v1/surveys/{self.survey.id}/respond/', self._payload(), format='json')
        self.assertEqual(second.status_code, 409)
        self.assertIn('detail', second.data)
        # No duplicate rows created by the second attempt.
        self.assertEqual(SurveyResponse.objects.count(), 1)
        self.assertEqual(SurveyAnswer.objects.count(), 2)

    def test_respond_with_missing_question_answer_is_rejected(self):
        self.client.force_authenticate(self.user)
        payload = {'answers': [{'question_id': self.q1.id, 'answer_text': 'Only Q1'}]}
        response = self.client.post(f'/api/v1/surveys/{self.survey.id}/respond/', payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('detail', response.data)
        self.assertEqual(SurveyResponse.objects.count(), 0)
        self.assertEqual(SurveyAnswer.objects.count(), 0)

    def test_respond_with_unknown_question_id_is_rejected(self):
        self.client.force_authenticate(self.user)
        payload = {
            'answers': [
                {'question_id': self.q1.id, 'answer_text': 'Q1'},
                {'question_id': self.q2.id, 'answer_text': 'A'},
                {'question_id': 999999, 'answer_text': 'Bogus'},
            ],
        }
        response = self.client.post(f'/api/v1/surveys/{self.survey.id}/respond/', payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(SurveyResponse.objects.count(), 0)


class SurveyPublishPermissionTests(TestCase):
    """Only the CEO or CTO may create/edit/remove a survey -- everyone else,
    including staff roles that can author other platform content (e.g.
    TEACHER for announcements), must be rejected. See
    apps.surveys.views.SURVEY_PUBLISHER_ROLES."""

    def setUp(self):
        self.ceo = _make_user('EDU-CEO-0001', role='CEO')
        self.cto = _make_user('EDU-CTO-0001', role='CTO')
        self.teacher = _make_user('EDU-TEACHER-0001', role='TEACHER')
        self.client = APIClient()

    def _payload(self):
        return {
            'title': 'New Survey',
            'description': 'Published via the API',
            'is_active': True,
            'questions': [
                {'question_text': 'How was it?', 'question_type': 'TEXT', 'order': 1},
                {
                    'question_text': 'Pick one', 'question_type': 'SINGLE_CHOICE',
                    'options': ['Good', 'Bad'], 'order': 2,
                },
            ],
        }

    def test_ceo_can_publish_a_survey(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.post('/api/v1/surveys/', self._payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        survey = Survey.objects.get(id=response.data['id'])
        self.assertEqual(survey.created_by_id, self.ceo.id)
        self.assertTrue(survey.is_active)
        self.assertEqual(survey.questions.count(), 2)

    def test_cto_can_publish_a_survey(self):
        # Founder parity: CEO and CTO must have identical capability here.
        self.client.force_authenticate(self.cto)
        response = self.client.post('/api/v1/surveys/', self._payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Survey.objects.get(id=response.data['id']).created_by_id, self.cto.id)

    def test_non_founder_cannot_publish_a_survey(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post('/api/v1/surveys/', self._payload(), format='json')
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(Survey.objects.count(), 0)

    def test_unauthenticated_cannot_publish_a_survey(self):
        response = self.client.post('/api/v1/surveys/', self._payload(), format='json')
        self.assertEqual(response.status_code, 401)

    def test_ceo_can_toggle_publish_state(self):
        self.client.force_authenticate(self.ceo)
        created = self.client.post('/api/v1/surveys/', self._payload(), format='json')
        survey_id = created.data['id']

        unpublish = self.client.patch(f'/api/v1/surveys/{survey_id}/', {'is_active': False}, format='json')
        self.assertEqual(unpublish.status_code, 200, unpublish.data)
        self.assertFalse(Survey.objects.get(id=survey_id).is_active)

    def test_non_founder_cannot_toggle_publish_state(self):
        self.client.force_authenticate(self.ceo)
        created = self.client.post('/api/v1/surveys/', self._payload(), format='json')
        survey_id = created.data['id']

        self.client.force_authenticate(self.teacher)
        response = self.client.patch(f'/api/v1/surveys/{survey_id}/', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Survey.objects.get(id=survey_id).is_active)

    def test_published_survey_is_immediately_visible_to_every_authenticated_user(self):
        # This is the actual product requirement: publish once, it reaches
        # every client that reads GET /surveys/ -- no per-app publish step.
        self.client.force_authenticate(self.ceo)
        created = self.client.post('/api/v1/surveys/', self._payload(), format='json')
        self.assertEqual(created.status_code, 201, created.data)

        self.client.force_authenticate(self.teacher)
        listed = self.client.get('/api/v1/surveys/')
        titles = [row['title'] for row in listed.data['results']]
        self.assertIn('New Survey', titles)

    def test_non_founder_cannot_delete_a_survey(self):
        self.client.force_authenticate(self.ceo)
        created = self.client.post('/api/v1/surveys/', self._payload(), format='json')
        survey_id = created.data['id']

        self.client.force_authenticate(self.teacher)
        response = self.client.delete(f'/api/v1/surveys/{survey_id}/')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Survey.objects.filter(id=survey_id).count(), 1)

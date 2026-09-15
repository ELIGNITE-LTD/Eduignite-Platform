"""Survey audiences, publishers, repeat answers and response reporting."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.schools.models import School
from apps.surveys.models import Survey, SurveyPublisher, SurveyResponse

User = get_user_model()


def _school(school_id, name):
    return School.objects.create(
        id=school_id, name=name, short_name=school_id[:4], principal=f'{name} Principal',
        location='Bafoussam', email=f'{school_id.lower()}@example.com', phone='237650800800',
        school_type='mixed', subsystem='bilingual',
    )


def _user(matricule, role, school=None):
    return User.objects.create_user(
        matricule=matricule, name=matricule, email=f'{matricule.lower()}@example.com',
        role=role, school=school, password='pass12345',
    )


class SurveyAudienceTests(TestCase):
    def setUp(self):
        self.school_a = _school('SVA', 'Survey Alpha')
        self.school_b = _school('SVB', 'Survey Beta')
        self.ceo = _user('EDU-CEO-S1', 'CEO')
        self.cto = _user('EDU-CTO-S1', 'CTO')
        self.coo = _user('EDU-COO-S1', 'COO')
        self.principal_a = _user('SVA-ADMIN', 'SCHOOL_ADMIN', self.school_a)
        self.teacher_a = _user('SVA-TE-001', 'TEACHER', self.school_a)
        self.parent_a = _user('SVA-PA-0001', 'PARENT', self.school_a)
        self.teacher_b = _user('SVB-TE-001', 'TEACHER', self.school_b)

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def _publish(self, user, title, **extra):
        body = {
            'title': title,
            'is_active': True,
            'questions': [
                {'question_text': 'Rate us', 'question_type': 'SINGLE_CHOICE', 'options': ['Good', 'Bad'], 'order': 1},
            ],
            **extra,
        }
        return self._client(user).post('/api/v1/surveys/', body, format='json')

    def _pending(self, user):
        response = self._client(user).get('/api/v1/surveys/')
        self.assertEqual(response.status_code, 200, response.data)
        return {row['title']: row for row in response.data['results']}

    def _answer(self, user, survey, option='Good'):
        question = survey.questions.first()
        return self._client(user).post(
            f'/api/v1/surveys/{survey.id}/respond/',
            {'answers': [{'question_id': question.id, 'answer_text': option}]},
            format='json',
        )

    def test_teacher_survey_for_one_school_reaches_only_its_teachers(self):
        created = self._publish(self.ceo, 'Alpha teachers', audience='TEACHER', target_school=self.school_a.id)
        self.assertEqual(created.status_code, 201, created.data)
        self.assertIn('Alpha teachers', self._pending(self.teacher_a))
        for person in (self.teacher_b, self.parent_a, self.principal_a, self.coo):
            self.assertNotIn('Alpha teachers', self._pending(person), person.matricule)

    def test_ineligible_user_can_neither_open_nor_answer(self):
        created = self._publish(self.cto, 'Executives only', audience='EXECUTIVE')
        self.assertEqual(created.status_code, 201, created.data)
        survey = Survey.objects.get(title='Executives only')

        self.assertIn('Executives only', self._pending(self.coo))
        self.assertNotIn('Executives only', self._pending(self.teacher_a))
        self.assertEqual(self._client(self.teacher_a).get(f'/api/v1/surveys/{survey.id}/').status_code, 404)
        self.assertEqual(self._answer(self.teacher_a, survey).status_code, 404)
        self.assertFalse(SurveyResponse.objects.filter(user=self.teacher_a).exists())

    def test_answered_single_response_survey_stops_appearing(self):
        self._publish(self.ceo, 'Once', audience='ALL_SCHOOL_USERS')
        survey = Survey.objects.get(title='Once')
        self.assertEqual(self._answer(self.parent_a, survey).status_code, 201)
        self.assertNotIn('Once', self._pending(self.parent_a))
        self.assertEqual(self._answer(self.parent_a, survey).status_code, 409)

    def test_repeatable_survey_accepts_several_answers(self):
        self._publish(self.ceo, 'Weekly check-in', audience='ALL_SCHOOL_USERS', allow_multiple_responses=True)
        survey = Survey.objects.get(title='Weekly check-in')
        self.assertEqual(self._answer(self.teacher_a, survey).status_code, 201)
        second = self._answer(self.teacher_a, survey, option='Bad')
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(second.data['sequence'], 2)
        pending = self._pending(self.teacher_a)
        self.assertIn('Weekly check-in', pending)
        self.assertTrue(pending['Weekly check-in']['has_responded'])

    def test_target_school_requires_a_school_audience(self):
        response = self._publish(self.ceo, 'Bad', audience='ALL_EDUIGNITE_USERS', target_school=self.school_a.id)
        self.assertEqual(response.status_code, 400, response.data)

    def test_founders_see_collected_responses_and_totals(self):
        self._publish(self.ceo, 'Feedback', audience='ALL_SCHOOL_USERS')
        survey = Survey.objects.get(title='Feedback')
        self._answer(self.teacher_a, survey, 'Good')
        self._answer(self.parent_a, survey, 'Bad')
        self._answer(self.teacher_b, survey, 'Good')

        for founder in (self.ceo, self.cto):
            report = self._client(founder).get(f'/api/v1/surveys/{survey.id}/responses/')
            self.assertEqual(report.status_code, 200, report.data)
            self.assertEqual(report.data['response_count'], 3)
            totals = {row['option']: row['count'] for row in report.data['summary'][0]['options']}
            self.assertEqual(totals, {'Good': 2, 'Bad': 1})
            names = {row['respondent_name'] for row in report.data['responses']}
            self.assertEqual(names, {self.teacher_a.name, self.parent_a.name, self.teacher_b.name})

        self.assertEqual(self._client(self.teacher_a).get(f'/api/v1/surveys/{survey.id}/responses/').status_code, 403)

    def test_authorised_publisher_manages_only_their_own_surveys(self):
        self.assertEqual(self._publish(self.coo, 'Too early').status_code, 403)

        grant = self._client(self.ceo).post('/api/v1/surveys/publishers/', {'user': str(self.coo.id)}, format='json')
        self.assertEqual(grant.status_code, 201, grant.data)
        self.assertEqual(self._publish(self.coo, 'COO survey', audience='PRINCIPAL').status_code, 201)
        self._publish(self.ceo, 'CEO survey', audience='PRINCIPAL')

        coo_survey = Survey.objects.get(title='COO survey')
        ceo_survey = Survey.objects.get(title='CEO survey')
        coo_client = self._client(self.coo)
        self.assertEqual(coo_client.get(f'/api/v1/surveys/{coo_survey.id}/responses/').status_code, 200)
        self.assertEqual(coo_client.get(f'/api/v1/surveys/{ceo_survey.id}/responses/').status_code, 404)
        managed_titles = {row['title'] for row in coo_client.get('/api/v1/surveys/managed/').data['results']}
        self.assertEqual(managed_titles, {'COO survey'})

    def test_only_founders_authorise_publishers(self):
        response = self._client(self.coo).post('/api/v1/surveys/publishers/', {'user': str(self.teacher_a.id)}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(SurveyPublisher.objects.exists())

"""The daily allowance on the assistant.

Every answer costs money, so a free account gets five questions a day. These
check the three things that matter: the count is right, the sixth question is
refused rather than answered, and nobody is refused who should not be.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.ai_features.models import AIRequest
from apps.ai_features.quota import chat_quota

User = get_user_model()

CHAT_URL = '/api/v1/ai/chat/'
QUOTA_URL = '/api/v1/ai/chat/quota/'

ANSWER = {
    'success': True,
    'response': 'Here is the answer.',
    'tokens_used': 12,
    'processing_time_ms': 30,
    'model': 'test',
    'key_source': 'primary',
}


@override_settings(AI_CHAT_DAILY_LIMIT=5, AI_CHAT_PRO_DAILY_LIMIT=100)
class ChatQuotaTests(TestCase):
    def setUp(self):
        self.student = User.objects.create_user(
            matricule='QTA-STU-1', name='A Student', email='quota-student@example.org',
            role='STUDENT', password='not-a-real-password',
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.student)

    def _ask(self, message='What is photosynthesis?'):
        with patch('apps.ai_features.utils.call_groq_api', return_value=dict(ANSWER)):
            return self.api.post(CHAT_URL, {'message': message}, format='json')

    def _spend(self, count):
        for index in range(count):
            AIRequest.objects.create(
                user=self.student, request_type='general', prompt=f'q{index}', status='completed',
            )

    def test_a_fresh_account_has_five_questions(self):
        response = self.api.get(QUOTA_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['limit'], 5)
        self.assertEqual(response.data['used'], 0)
        self.assertEqual(response.data['remaining'], 5)
        self.assertFalse(response.data['exhausted'])

    def test_asking_uses_one(self):
        self.assertEqual(self._ask().status_code, 200)

        self.assertEqual(self.api.get(QUOTA_URL).data['remaining'], 4)

    def test_the_answer_carries_the_new_count(self):
        data = self._ask().data

        self.assertEqual(data['quota']['used'], 1)
        self.assertEqual(data['quota']['remaining'], 4)

    def test_five_questions_are_allowed(self):
        for _ in range(5):
            self.assertEqual(self._ask().status_code, 200)

        self.assertEqual(self.api.get(QUOTA_URL).data['remaining'], 0)

    def test_the_sixth_is_refused(self):
        self._spend(5)

        response = self._ask()

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data['code'], 'ai_quota_exhausted')

    def test_the_sixth_never_reaches_the_model(self):
        """The point of a limit is not spending the money."""
        self._spend(5)

        with patch('apps.ai_features.utils.call_groq_api') as groq:
            self.api.post(CHAT_URL, {'message': 'One more'}, format='json')

        groq.assert_not_called()

    def test_the_refusal_says_what_the_limit_was(self):
        self._spend(5)

        data = self._ask().data

        self.assertIn('5', data['detail'])
        self.assertEqual(data['quota']['limit'], 5)
        self.assertTrue(data['quota']['exhausted'])

    def test_yesterday_does_not_count_against_today(self):
        self._spend(5)
        AIRequest.objects.update(created_at=timezone.now() - timezone.timedelta(days=1))

        self.assertEqual(chat_quota(self.student).remaining, 5)
        self.assertEqual(self._ask().status_code, 200)

    def test_only_the_chat_is_counted(self):
        """A teacher generating an exam is doing work, not asking a question."""
        for request_type in ('ai_exam_generation', 'student_guidance', 'career_orientation'):
            AIRequest.objects.create(
                user=self.student, request_type=request_type, prompt='x', status='completed',
            )

        self.assertEqual(chat_quota(self.student).used, 0)

    def test_one_persons_questions_are_their_own(self):
        other = User.objects.create_user(
            matricule='QTA-STU-2', name='Another Student', email='quota-other@example.org',
            role='STUDENT', password='not-a-real-password',
        )
        self._spend(5)

        self.assertEqual(chat_quota(other).remaining, 5)


@override_settings(AI_CHAT_DAILY_LIMIT=5, AI_CHAT_PRO_DAILY_LIMIT=100)
class ProPlanTests(TestCase):
    def setUp(self):
        self.api = APIClient()

    def _user(self, matricule, **extra):
        return User.objects.create_user(
            matricule=matricule, name='Someone', email=f'{matricule.lower()}@example.org',
            password='not-a-real-password', **extra,
        )

    def test_pro_gets_the_larger_allowance(self):
        pro = self._user('QTA-PRO-1', role='TEACHER', ai_plan='pro')

        quota = chat_quota(pro)
        self.assertTrue(quota.is_pro)
        self.assertEqual(quota.limit, 100)
        self.assertEqual(quota.plan, 'pro')

    def test_a_free_account_is_free_by_default(self):
        free = self._user('QTA-FREE-1', role='TEACHER')

        self.assertFalse(chat_quota(free).is_pro)
        self.assertEqual(chat_quota(free).limit, 5)

    def test_pro_is_not_stopped_at_five(self):
        pro = self._user('QTA-PRO-2', role='TEACHER', ai_plan='pro')
        for index in range(6):
            AIRequest.objects.create(user=pro, request_type='general', prompt=f'q{index}', status='completed')

        self.api.force_authenticate(user=pro)
        with patch('apps.ai_features.utils.call_groq_api', return_value=dict(ANSWER)):
            response = self.api.post(CHAT_URL, {'message': 'Another'}, format='json')

        self.assertEqual(response.status_code, 200)

    def test_the_people_who_run_the_platform_are_not_sold_a_subscription(self):
        ceo = self._user('QTA-CEO-1', role='CEO')

        self.assertTrue(chat_quota(ceo).is_pro)

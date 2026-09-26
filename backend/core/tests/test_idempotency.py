"""The rule that keeps offline work from being recorded twice.

These tests do not go through the fees endpoints, because what is being proved
is not about fees: it is that a repeated write runs the work once, however
many times a device with a bad connection sends it. A counter view makes that
visible in a way a payment fixture would only obscure.
"""

import json
import uuid

from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.test import TestCase, override_settings
from django.urls import path

from apps.platform.models import IdempotencyRecord

User = get_user_model()

# How many times the work behind the endpoint actually ran.
CALLS = {'count': 0}


def counting_view(request):
    CALLS['count'] += 1
    return JsonResponse({'ran': CALLS['count'], 'recorded': True}, status=201)


def failing_view(request):
    CALLS['count'] += 1
    return JsonResponse({'detail': 'No.'}, status=400)


urlpatterns = [
    path('test/record/', counting_view),
    path('test/refuse/', failing_view),
]


@override_settings(ROOT_URLCONF=__name__)
class IdempotencyMiddlewareTests(TestCase):
    def setUp(self):
        CALLS['count'] = 0
        self.user = User.objects.create_user(
            matricule='BURSAR-001',
            name='Bursar',
            email='bursar@example.com',
            role='BURSAR',
            password='not-a-real-password',
        )
        self.client.force_login(self.user)

    def test_repeated_key_runs_the_work_once(self):
        """The case this exists for: the answer was lost, the device resends."""
        key = str(uuid.uuid4())

        first = self.client.post(
            '/test/record/', content_type='application/json', HTTP_IDEMPOTENCY_KEY=key
        )
        second = self.client.post(
            '/test/record/', content_type='application/json', HTTP_IDEMPOTENCY_KEY=key
        )

        self.assertEqual(CALLS['count'], 1, 'the work must run exactly once')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(json.loads(first.content), json.loads(second.content))
        self.assertEqual(second['Idempotent-Replay'], 'true')

    def test_different_keys_are_different_work(self):
        """Two payments from the same bursar are two payments."""
        for _ in range(2):
            self.client.post(
                '/test/record/',
                content_type='application/json',
                HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
            )

        self.assertEqual(CALLS['count'], 2)

    def test_the_same_key_from_another_person_is_not_a_replay(self):
        key = str(uuid.uuid4())
        self.client.post('/test/record/', content_type='application/json', HTTP_IDEMPOTENCY_KEY=key)

        other = User.objects.create_user(
            matricule='BURSAR-002',
            name='Other',
            email='other@example.com',
            role='BURSAR',
            password='not-a-real-password',
        )
        self.client.force_login(other)
        self.client.post('/test/record/', content_type='application/json', HTTP_IDEMPOTENCY_KEY=key)

        self.assertEqual(CALLS['count'], 2)

    def test_a_request_without_a_key_is_untouched(self):
        for _ in range(2):
            self.client.post('/test/record/', content_type='application/json')

        self.assertEqual(CALLS['count'], 2)
        self.assertEqual(IdempotencyRecord.objects.count(), 0)

    def test_a_refused_request_can_be_sent_again(self):
        """A failure is not an answer worth keeping for ever."""
        key = str(uuid.uuid4())

        self.client.post('/test/refuse/', content_type='application/json', HTTP_IDEMPOTENCY_KEY=key)
        self.client.post('/test/refuse/', content_type='application/json', HTTP_IDEMPOTENCY_KEY=key)

        self.assertEqual(CALLS['count'], 2)
        self.assertEqual(IdempotencyRecord.objects.count(), 0)

    def test_the_stored_answer_is_the_first_one(self):
        key = str(uuid.uuid4())
        self.client.post('/test/record/', content_type='application/json', HTTP_IDEMPOTENCY_KEY=key)

        record = IdempotencyRecord.objects.get(key=key, user=self.user)
        self.assertEqual(record.status, IdempotencyRecord.STATUS_COMPLETED)
        self.assertEqual(record.response_status, 201)
        self.assertEqual(json.loads(record.response_body)['ran'], 1)

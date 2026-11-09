from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient


class HealthEndpointTests(TestCase):
    def test_ok_without_auth(self):
        response = APIClient().get('/api/v1/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_not_throttled(self):
        client = APIClient()
        for _ in range(200):  # the anonymous limit is 120/min
            self.assertEqual(client.get('/api/v1/health/').status_code, 200)

    def test_503_when_database_down(self):
        with mock.patch('core.health.connection') as conn:
            conn.cursor.side_effect = Exception('db down: secret detail')
            response = APIClient().get('/api/v1/health/')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'error'})

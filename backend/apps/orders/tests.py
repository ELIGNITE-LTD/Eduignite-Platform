from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import Order
from apps.users.models import User


class FlyerQrAndOrderRequestTests(APITestCase):
    def setUp(self):
        self.founder = User.objects.create_user(
            matricule='EDUCEO2601',
            name='Founder CEO',
            email='founder.qr@example.com',
            role='CEO',
            password='password123',
        )

    def test_founder_can_generate_flyer_qr_code(self):
        self.client.force_authenticate(self.founder)
        response = self.client.get('/api/v1/orders/orders/flyer-qr/', {
            'url': 'https://eduignite.online/school-account-request?source=test-flyer',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['url'], 'https://eduignite.online/school-account-request?source=test-flyer')
        self.assertTrue(response.data['qr_data_url'].startswith('data:image/png;base64,'))

    def test_public_school_account_request_creates_order(self):
        response = self.client.post('/api/v1/orders/orders/', {
            'full_name': 'Principal Requester',
            'occupation': 'Principal',
            'school_name': 'Sample Bilingual High School',
            'whatsapp_number': '+237670000000',
            'email': 'principal@example.com',
            'region': 'Littoral',
            'division': 'Wouri',
            'sub_division': 'Douala III',
            'message': 'Request source: founder-flyer.',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Order.objects.get().school_name, 'Sample Bilingual High School')

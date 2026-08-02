from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.app_store.models import AppStoreItem

User = get_user_model()


@override_settings(SECURE_SSL_REDIRECT=False)
class AppStoreApiTests(TestCase):
    def setUp(self):
        self.ceo = User.objects.create_user(
            matricule='CEO-APP', name='CEO App', email='ceoapp@example.com', role='CEO', password='pass12345'
        )
        self.student = User.objects.create_user(
            matricule='STU-APP', name='Student App', email='stuapp@example.com', role='STUDENT', password='pass12345'
        )
        self.client = APIClient()

    def test_ceo_can_create_app_store_item(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.post('/api/v1/app-store/apps/', {
            'title': 'EduIgnite Mobile',
            'category': 'android',
            'short_description': 'Mobile learning app',
            'full_description': 'A full mobile learning companion.',
            'download_link': 'https://example.com/app.apk',
            'screenshots': ['https://example.com/screen.png'],
            'featured': True,
            'active': True,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(AppStoreItem.objects.count(), 1)

    def test_student_cannot_create_app_store_item_but_can_browse(self):
        AppStoreItem.objects.create(
            title='EduIgnite iOS',
            category='iphone',
            short_description='iOS app',
            full_description='iOS marketplace app.',
            download_link='https://example.com/ios',
            active=True,
        )
        self.client.force_authenticate(self.student)
        response = self.client.post('/api/v1/app-store/apps/', {
            'title': 'Blocked',
            'category': 'mac',
            'short_description': 'Blocked',
            'full_description': 'Blocked',
            'download_link': 'https://example.com/blocked',
        }, format='json')
        self.assertEqual(response.status_code, 403)
        response = self.client.get('/api/v1/app-store/apps/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['title'], 'EduIgnite iOS')

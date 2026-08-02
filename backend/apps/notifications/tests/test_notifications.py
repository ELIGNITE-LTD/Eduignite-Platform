from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.notifications.models import Notification, NotificationType
from apps.notifications.services import create_notification

User = get_user_model()


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, FCM_SERVER_KEY='', SECURE_SSL_REDIRECT=False)
class NotificationApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            matricule='STU-001', name='Student One', email='student@example.com', role='STUDENT', password='pass12345'
        )
        self.admin = User.objects.create_user(
            matricule='CEO-001', name='CEO One', email='ceo@example.com', role='CEO', password='pass12345'
        )
        self.client = APIClient()

    def test_user_can_list_and_mark_notification_read(self):
        notification = create_notification(
            recipient=self.user,
            title='Welcome',
            message='Hello',
            notification_type=NotificationType.PLATFORM,
            deliver_async=False,
        )
        self.client.force_authenticate(self.user)
        response = self.client.get('/api/v1/notifications/notifications/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['id'], str(notification.id))
        response = self.client.post(f'/api/v1/notifications/notifications/{notification.id}/mark_read/')
        self.assertEqual(response.status_code, 200)
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)

    def test_ceo_can_create_role_targeted_notifications(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/v1/notifications/notifications/', {
            'role_targets': ['STUDENT'],
            'title': 'Platform Notice',
            'message': 'Important update',
            'notification_type': NotificationType.PLATFORM,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Notification.objects.filter(recipient=self.user, title='Platform Notice').exists())

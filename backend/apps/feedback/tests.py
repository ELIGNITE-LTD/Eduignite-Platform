from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.schools.models import School
from .models import Feedback


User = get_user_model()


class FeedbackSubmissionTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='FDB-TEST',
            name='Feedback Test Secondary School',
            short_name='FTSS',
            principal='Principal Feedback',
            location='Buea',
            email='feedback-school@example.com',
            phone='237650100100',
            school_type='general',
            subsystem='anglophone',
        )
        self.school_admin = User.objects.create_user(
            matricule='ADM-FDB-001',
            name='Feedback Admin',
            email='feedback.admin@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )
        self.unlinked_admin = User.objects.create_user(
            matricule='ADM-FDB-002',
            name='Unlinked Admin',
            email='feedback.unlinked@example.com',
            role='SCHOOL_ADMIN',
            password='password123',
        )

    def test_school_admin_can_submit_feedback_with_lowercase_priority(self):
        self.client.force_authenticate(self.school_admin)

        response = self.client.post(
            '/api/v1/feedback/feedback/',
            {
                'subject': 'Technical Error',
                'category': 'technical',
                'message': 'The school admin dashboard is not saving staff.',
                'priority': 'medium',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        feedback = Feedback.objects.get(id=response.data['id'])
        self.assertEqual(feedback.sender, self.school_admin)
        self.assertEqual(feedback.school, self.school)
        self.assertEqual(feedback.priority, 'Medium')
        self.assertIn('submitted_at', response.data)

    def test_feedback_requires_user_school_link(self):
        self.client.force_authenticate(self.unlinked_admin)

        response = self.client.post(
            '/api/v1/feedback/feedback/',
            {
                'subject': 'Technical Error',
                'message': 'This account is missing a school link.',
                'priority': 'medium',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('school', response.data)

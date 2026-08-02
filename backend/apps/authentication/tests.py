from unittest.mock import patch
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class PasswordResetEmailTests(APITestCase):
    @override_settings(FRONTEND_URL='https://eduignite.online')
    @patch('apps.authentication.views.send_transactional_email', return_value=True)
    def test_password_reset_uses_transactional_email_provider(self, mocked_send):
        user = User.objects.create_user(
            matricule='TEST2601',
            name='Test Teacher',
            email='teacher@example.com',
            role='TEACHER',
            password='OldPassword123!',
        )

        response = self.client.post(
            '/api/v1/auth/password-reset/',
            {'matricule': user.matricule},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mocked_send.assert_called_once()
        kwargs = mocked_send.call_args.kwargs
        self.assertEqual(kwargs['to_email'], user.email)
        self.assertIn('/reset-password?token=', kwargs['text'])
        self.assertEqual(kwargs['sender_name'], 'EduIgnite')


class SchoolOnboardingAttachmentTests(SimpleTestCase):
    @patch('core.email_service._render_pdf', side_effect=RuntimeError('missing native pdf libs'))
    def test_school_onboarding_attachments_fall_back_to_builtin_pdf(self, _mocked_render):
        from core.email_service import build_school_onboarding_attachments

        school = SimpleNamespace(
            id='school-1',
            name='Test Secondary School',
            matricule='TSS0126',
            principal='Principal Name',
            email='school@example.com',
            phone='237650000000',
            school_type='general',
            subsystem='anglophone',
            region='Centre',
            division='Mfoundi',
            sub_division='Yaounde I',
            city_village='Yaounde',
            address='Campus Road',
            motto='Knowledge and Service',
            status='active',
        )

        attachments = build_school_onboarding_attachments(school)

        self.assertEqual(len(attachments), 2)
        self.assertTrue(all(attachment.filename.endswith('.pdf') for attachment in attachments))
        self.assertTrue(all(attachment.content.startswith(b'%PDF-') for attachment in attachments))

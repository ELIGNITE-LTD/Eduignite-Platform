from unittest.mock import patch
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class PasswordResetEmailTests(APITestCase):
    def setUp(self):
        # The reset endpoint is limited to 5/hour through the cache, which
        # other tests in this module also spend.
        from django.core.cache import cache
        cache.clear()

    @override_settings(FRONTEND_URL='https://eduignite.online')
    @patch('core.email_service.send_transactional_email', return_value=True)
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
        from core.email_service import EmailEvent
        self.assertEqual(kwargs['event'], EmailEvent.PASSWORD_RESET)
        self.assertEqual(kwargs['to_email'], user.email)
        self.assertIn('/reset-password?token=', kwargs['text'])
        self.assertEqual(kwargs['sender_name'], 'EduIgnite')


class PasswordResetConfirmTests(APITestCase):
    """Regression tests for the reset-token flow. It used to mint a plain
    24h JWT access token as the "reset token" -- valid far longer than the
    5 minutes the email promises, and replayable indefinitely since access
    tokens are never blacklisted. It now uses Django's own
    default_token_generator, which self-invalidates once the password
    changes and expires per PASSWORD_RESET_TIMEOUT."""

    def setUp(self):
        # The confirm endpoint shares the 5/hour password_reset rate limit.
        from django.core.cache import cache
        cache.clear()

    def _issue_reset_token(self, user):
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        return f"{uidb64}.{default_token_generator.make_token(user)}"

    def test_valid_token_resets_password(self):
        user = User.objects.create_user(
            matricule='PRC0001', name='Reset User', email='reset.user@example.com',
            role='TEACHER', password='OldPassword123!',
        )
        token = self._issue_reset_token(user)

        response = self.client.post(
            '/api/v1/auth/password-reset/confirm/',
            {'token': token, 'new_password': 'NewPassword456!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.check_password('NewPassword456!'))

    def test_token_cannot_be_replayed_after_use(self):
        user = User.objects.create_user(
            matricule='PRC0002', name='Reset User Two', email='reset.two@example.com',
            role='TEACHER', password='OldPassword123!',
        )
        token = self._issue_reset_token(user)
        self.client.post(
            '/api/v1/auth/password-reset/confirm/',
            {'token': token, 'new_password': 'FirstNewPassword!1'},
            format='json',
        )

        replay_response = self.client.post(
            '/api/v1/auth/password-reset/confirm/',
            {'token': token, 'new_password': 'SecondNewPassword!2'},
            format='json',
        )

        self.assertEqual(replay_response.status_code, status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        self.assertTrue(user.check_password('FirstNewPassword!1'))

    def test_expired_token_is_rejected(self):
        user = User.objects.create_user(
            matricule='PRC0003', name='Reset User Three', email='reset.three@example.com',
            role='TEACHER', password='OldPassword123!',
        )
        token = self._issue_reset_token(user)

        with override_settings(PASSWORD_RESET_TIMEOUT=-1):
            response = self.client.post(
                '/api/v1/auth/password-reset/confirm/',
                {'token': token, 'new_password': 'NewPassword456!'},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        self.assertTrue(user.check_password('OldPassword123!'))

    def test_token_issued_for_one_user_cannot_reset_another(self):
        victim = User.objects.create_user(
            matricule='PRC0004', name='Victim', email='victim@example.com',
            role='TEACHER', password='VictimPassword123!',
        )
        attacker = User.objects.create_user(
            matricule='PRC0005', name='Attacker', email='attacker@example.com',
            role='TEACHER', password='AttackerPassword123!',
        )
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        attacker_uidb64 = urlsafe_base64_encode(force_bytes(attacker.pk))
        victims_raw_token = default_token_generator.make_token(victim)
        forged_token = f"{attacker_uidb64}.{victims_raw_token}"

        response = self.client.post(
            '/api/v1/auth/password-reset/confirm/',
            {'token': forged_token, 'new_password': 'HackedPassword123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        attacker.refresh_from_db()
        self.assertTrue(attacker.check_password('AttackerPassword123!'))


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

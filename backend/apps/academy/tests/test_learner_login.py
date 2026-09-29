"""Academy learner login and email password recovery.

A standalone learner (Path B) signs back in with their email and password
and gets their own account back: same courses, progress and certificates.
Recovery emails a single-use, expiring link to the Academy's reset page and
never says whether an email is registered.
"""

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.academy.certificate_export import _SHIELD_PNG_B64, _certificate_html
from apps.academy.models import Certificate, Course, CourseEnrollment
from core.email_service import EmailEvent

User = get_user_model()

REGISTER = '/api/v1/academy/register/'
LOGIN = '/api/v1/academy/login/'
RESET = '/api/v1/academy/password-reset/'
CONFIRM = '/api/v1/auth/password-reset/confirm/'
SEND = 'core.email_service.send_transactional_email'


@override_settings(FRONTEND_URL='https://eduignite.online')
class AcademyLearnerLoginTests(TestCase):
    def setUp(self):
        cache.clear()  # login and reset are rate-limited through the cache
        self.client = APIClient()
        created = self.client.post(
            REGISTER,
            {'name': 'Ada Learner', 'email': 'ada@example.org', 'password': 'Original!Pass1'},
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.learner = User.objects.get(email='ada@example.org')

    def tearDown(self):
        cache.clear()

    def _login(self, email='ada@example.org', password='Original!Pass1'):
        return self.client.post(LOGIN, {'email': email, 'password': password}, format='json')

    def _reset_link(self):
        with mock.patch(SEND, return_value=True) as send:
            self.client.post(RESET, {'email': 'ada@example.org'}, format='json')
        text = send.call_args.kwargs['text']
        return text.split('token=')[1].split()[0]

    # --- login ---------------------------------------------------------------

    def test_a_learner_logs_in_with_email_and_password(self):
        response = self._login()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access_token', response.data)
        self.assertEqual(response.data['user']['id'], str(self.learner.id))
        self.assertEqual(response.data['return_path'], '/academy')

    def test_email_is_matched_whatever_its_case(self):
        self.assertEqual(self._login(email='ADA@Example.org').status_code, 200)

    def test_wrong_password_and_unknown_email_get_the_same_answer(self):
        wrong = self._login(password='not-it')
        unknown = self._login(email='nobody@example.org')
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(wrong.data['detail'], unknown.data['detail'])

    def test_a_school_account_cannot_use_the_learner_login(self):
        User.objects.create_user(matricule='TCH-ACAD', name='Teacher', email='teacher@example.org',
                                 role='TEACHER', password='Teacher!Pass1')
        self.assertEqual(self._login(email='teacher@example.org', password='Teacher!Pass1').status_code, 400)

    def test_a_deactivated_learner_cannot_log_in(self):
        self.learner.is_active = False
        self.learner.save(update_fields=['is_active'])
        self.assertEqual(self._login().status_code, 400)

    def test_logging_in_brings_back_courses_and_certificates(self):
        creator = User.objects.create_user(matricule='CRT-ACAD', name='Creator', email='crt@example.org',
                                           role='TEACHER', password='x')
        course = Course.objects.create(title='EduIgnite Basics', slug='eduignite-basics-login',
                                       role_pathway=Course.RolePathway.TEACHER, status=Course.Status.PUBLISHED,
                                       created_by=creator)
        CourseEnrollment.objects.create(user=self.learner, course=course)
        Certificate.objects.create(user=self.learner, course=course, tier=Certificate.Tier.COMPLETION)

        token = self._login().data['access_token']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        certificates = self.client.get('/api/v1/academy/certificates/')
        self.assertEqual(certificates.status_code, 200)
        self.assertIn('EduIgnite Basics', str(certificates.data))

    # --- recovery ------------------------------------------------------------

    def test_reset_request_emails_a_link_to_the_academy_reset_page(self):
        with mock.patch(SEND, return_value=True) as send:
            response = self.client.post(RESET, {'email': 'ada@example.org'}, format='json')
        self.assertEqual(response.status_code, 200)
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs['event'], EmailEvent.PASSWORD_RESET)
        self.assertEqual(kwargs['to_email'], 'ada@example.org')
        self.assertIn('https://eduignite.online/academy/reset-password?token=', kwargs['html'])
        self.assertNotIn('Original!Pass1', kwargs['html'] + kwargs['text'])

    def test_an_unknown_email_gets_the_same_reply_and_no_email(self):
        with mock.patch(SEND, return_value=True) as send:
            known = self.client.post(RESET, {'email': 'ada@example.org'}, format='json')
            unknown = self.client.post(RESET, {'email': 'nobody@example.org'}, format='json')
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(send.call_count, 1)

    def test_the_link_resets_the_password_once_and_keeps_the_account(self):
        enrollments_before = CourseEnrollment.objects.filter(user=self.learner).count()
        token = self._reset_link()

        done = self.client.post(CONFIRM, {'token': token, 'new_password': 'Brand!NewPass2'}, format='json')
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(self._login(password='Brand!NewPass2').status_code, 200)
        self.assertEqual(self._login().status_code, 400)

        again = self.client.post(CONFIRM, {'token': token, 'new_password': 'Other!Pass3'}, format='json')
        self.assertEqual(again.status_code, 400)
        self.assertEqual(User.objects.filter(email='ada@example.org').count(), 1)
        self.assertEqual(CourseEnrollment.objects.filter(user=self.learner).count(), enrollments_before)

    def test_an_invalid_link_is_refused(self):
        response = self.client.post(CONFIRM, {'token': 'not-a-real.token', 'new_password': 'Brand!NewPass2'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_an_expired_link_is_refused(self):
        token = self._reset_link()
        from django.contrib.auth.tokens import PasswordResetTokenGenerator

        later = PasswordResetTokenGenerator()._now() + timedelta(hours=2)
        with mock.patch.object(PasswordResetTokenGenerator, '_now', return_value=later):
            response = self.client.post(CONFIRM, {'token': token, 'new_password': 'Brand!NewPass2'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self._login().status_code, 200)

    def test_reset_requests_are_rate_limited(self):
        with mock.patch(SEND, return_value=True):
            codes = [self.client.post(RESET, {'email': 'ada@example.org'}, format='json').status_code for _ in range(7)]
        self.assertIn(429, codes)


class CertificateLogoTests(TestCase):
    def test_every_certificate_carries_the_eduignite_logo_in_its_header(self):
        creator = User.objects.create_user(matricule='CRT-LOGO', name='Creator', email='logo@example.org',
                                           role='TEACHER', password='x')
        learner = User.objects.create_user(matricule='LRN-LOGO', name='Logo Learner', email='ll@example.org',
                                           role='ACADEMY_LEARNER', password='x')
        course = Course.objects.create(title='Logo Course', slug='logo-course', role_pathway=Course.RolePathway.TEACHER,
                                       status=Course.Status.PUBLISHED, created_by=creator)
        certificate = Certificate.objects.create(user=learner, course=course, tier=Certificate.Tier.COMPLETION)

        # The logo must be a real, decodable PNG: an earlier inline copy was
        # corrupt, so certificates silently came out without it.
        import base64
        self.assertTrue(base64.b64decode(_SHIELD_PNG_B64, validate=True).startswith(b'\x89PNG\r\n\x1a\n'))

        html = _certificate_html(certificate)
        self.assertIn(f'src="data:image/png;base64,{_SHIELD_PNG_B64}"', html)
        # The logo leads the certificate, before the learner's details.
        self.assertLess(html.index('class="shield"'), html.index('Logo Learner'))
        for detail in ('Logo Learner', 'Logo Course', certificate.verification_id):
            self.assertIn(detail, html)

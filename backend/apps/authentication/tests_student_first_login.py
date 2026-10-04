"""A student's first way in, and every way in after that.

The school creates a student and the account is active from that moment, so
teachers can mark a register and enter a grade against it the same day. But the
password is still a placeholder, and the student has never chosen one.

So the first time is theirs: they claim the account with their matricule, like
anyone else on the platform. Only once that one-time activation is spent does a
forgotten password become something only the principal can fix.

These pin down both halves, because getting it wrong in either direction is bad:
a student sent to the principal on day one is a student who cannot start, and a
student who can re-activate after setting a password is an account anyone
holding a matricule can take over.
"""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.schools.models import School
from apps.students import api as students_api
from apps.students.models import Student

User = get_user_model()

RESET_URL = '/api/v1/auth/password-reset/'
ACTIVATE_URL = '/api/v1/auth/activate/'
LOGIN_URL = '/api/v1/auth/login/'

PENDING = '!pending_activation'
CHOSEN = 'a-password-of-my-own'


class StudentFirstLoginTests(TestCase):
    def setUp(self):
        # Both endpoints are throttled per address; each test is a new person.
        cache.clear()
        self.addCleanup(cache.clear)

        self.school = School.objects.create(
            id='FST-1', name='First Login Secondary School', short_name='FLSS',
            principal='Mrs Principal', location='Bamenda', email='school@example.org',
            phone='+237600000001',
        )
        self.principal = User.objects.create_user(
            matricule='FLSS-ADM-1', name='Mrs Principal', email='principal@example.org',
            role='SCHOOL_ADMIN', school=self.school, password='not-a-real-password',
            phone='+237600000002',
        )
        self.school.principal_user = self.principal
        self.school.save(update_fields=['principal_user'])

        # A student as the school creates one: active, with no password yet.
        self.student_user = User.objects.create_user(
            matricule='FLSS-STU-1', name='A Student', email='student@example.org',
            role='STUDENT', school=self.school, password=PENDING,
        )
        self.student = Student.objects.create(
            user=self.student_user,
            school=self.school,
            student_class='Form 5',
            admission_number='FLSS/2026/001',
        )
        self.api = APIClient()

    # ---- The account is usable by the school from the moment it exists ----

    def test_a_new_student_account_is_active(self):
        """Teachers must be able to mark a register against it the same day."""
        self.assertTrue(self.student_user.is_active)

    def test_a_new_student_appears_to_staff(self):
        visible = User.objects.filter(school=self.school, role='STUDENT', is_active=True)
        self.assertIn(self.student_user, list(visible))

    def test_a_new_student_has_their_one_activation_to_spend(self):
        self.assertTrue(students_api.self_activation_available(self.student.pk))

    # ---- The first time in belongs to the student ----

    def test_a_student_who_has_never_activated_is_told_to_activate(self):
        response = self.api.post(RESET_URL, {'matricule': 'FLSS-STU-1'}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['is_student'])
        self.assertTrue(response.data['can_self_activate'])
        self.assertIn('matricule', response.data['detail'].lower())

    def test_that_student_is_not_sent_to_the_principal(self):
        data = self.api.post(RESET_URL, {'matricule': 'FLSS-STU-1'}, format='json').data

        self.assertNotIn('principal_contact', data)
        self.assertNotIn('principal', data['detail'].lower())

    def test_the_student_can_set_their_own_password_with_their_matricule(self):
        response = self.api.post(
            ACTIVATE_URL,
            {'matricule': 'FLSS-STU-1', 'new_password': CHOSEN, 'confirm_password': CHOSEN},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.student_user.refresh_from_db()
        self.assertTrue(self.student_user.check_password(CHOSEN))

    def test_and_can_then_sign_in_with_it(self):
        self.api.post(
            ACTIVATE_URL,
            {'matricule': 'FLSS-STU-1', 'new_password': CHOSEN, 'confirm_password': CHOSEN},
            format='json',
        )

        signed_in = self.api.post(
            LOGIN_URL, {'matricule': 'FLSS-STU-1', 'password': CHOSEN}, format='json'
        )
        self.assertEqual(signed_in.status_code, 200, signed_in.data)

    def test_no_email_is_sent_to_a_student_at_any_point(self):
        from unittest.mock import patch

        with patch('apps.authentication.views.send_password_reset_email') as send:
            self.api.post(RESET_URL, {'matricule': 'FLSS-STU-1'}, format='json')
        send.assert_not_called()

    # ---- After that, a forgotten password is the principal's to reset ----

    def _activate(self):
        self.api.post(
            ACTIVATE_URL,
            {'matricule': 'FLSS-STU-1', 'new_password': CHOSEN, 'confirm_password': CHOSEN},
            format='json',
        )
        cache.clear()

    def test_an_activated_student_is_sent_to_their_principal(self):
        self._activate()

        data = self.api.post(RESET_URL, {'matricule': 'FLSS-STU-1'}, format='json').data

        self.assertTrue(data['is_student'])
        self.assertFalse(data['can_self_activate'])
        self.assertIn('principal', data['detail'].lower())
        self.assertEqual(data['principal_contact']['principal_name'], 'Mrs Principal')

    def test_activation_cannot_be_used_twice(self):
        """Otherwise anyone holding a matricule could take the account over."""
        self._activate()

        second = self.api.post(
            ACTIVATE_URL,
            {'matricule': 'FLSS-STU-1', 'new_password': 'someone-elses-password', 'confirm_password': 'someone-elses-password'},
            format='json',
        )

        self.assertEqual(second.status_code, 400, second.data)
        self.student_user.refresh_from_db()
        self.assertTrue(self.student_user.check_password(CHOSEN))

    def test_a_principal_reset_does_not_hand_activation_back(self):
        """A reset gives a password; it must not reopen the self-claim route."""
        self._activate()
        self.api.force_authenticate(user=self.principal)
        self.api.post(f'/api/v1/users/{self.student_user.id}/admin-reset-password/', {}, format='json')
        self.api.force_authenticate(user=None)
        cache.clear()

        data = self.api.post(RESET_URL, {'matricule': 'FLSS-STU-1'}, format='json').data

        self.assertFalse(data['can_self_activate'])
        self.assertFalse(students_api.self_activation_available(self.student.pk))

    # ---- An account the school has closed stays closed ----

    def test_a_suspended_student_is_not_offered_activation(self):
        self.student_user.is_active = False
        self.student_user.save(update_fields=['is_active'])

        data = self.api.post(RESET_URL, {'matricule': 'FLSS-STU-1'}, format='json').data

        self.assertFalse(data['can_self_activate'])

    def test_a_suspended_student_cannot_activate(self):
        self.student_user.is_active = False
        self.student_user.save(update_fields=['is_active'])

        response = self.api.post(
            ACTIVATE_URL,
            {'matricule': 'FLSS-STU-1', 'new_password': CHOSEN, 'confirm_password': CHOSEN},
            format='json',
        )

        self.assertEqual(response.status_code, 400)

    # ---- Everyone else is unaffected ----

    def test_a_teacher_still_gets_an_email_link(self):
        from unittest.mock import patch

        User.objects.create_user(
            matricule='FLSS-TCH-1', name='A Teacher', email='teacher@example.org',
            role='TEACHER', school=self.school, password='not-a-real-password',
        )

        with patch('apps.authentication.views.send_password_reset_email', return_value=True) as send:
            response = self.api.post(RESET_URL, {'matricule': 'FLSS-TCH-1'}, format='json')

        self.assertEqual(response.status_code, 200)
        send.assert_called_once()

"""Student self-activation ("Activate My Account").

The school creates a student and the account is active at once. Separately,
the student may set their own password exactly once. That privilege is spent
on the student record, is enforced by the server, survives password resets,
never overwrites credentials a student already has, and never signs anyone in
past the normal login checks.
"""

from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from apps.schools.models import School, SchoolClass
from apps.students import api as students_api
from apps.students.models import Student

User = get_user_model()

ACTIVATE = '/api/v1/auth/activate/'
LOGIN = '/api/v1/auth/login/'
NEW_PASSWORD = 'MyOwnPass!2026'


class StudentSelfActivationTests(APITestCase):
    def setUp(self):
        cache.clear()  # activation and login are rate-limited through the cache
        self.school = School.objects.create(
            id='ACT-TEST', name='Activation Test College', short_name='ATC', principal='Principal',
            location='Buea', email='act@example.org', phone='237650000000',
            school_type='general', subsystem='anglophone',
        )
        self.school_class = SchoolClass.objects.create(school=self.school, name='Form 1A')
        self.admin = User.objects.create_user(
            matricule='ADM-ACT', name='Admin', email='adm-act@example.org', role='SCHOOL_ADMIN',
            school=self.school, password='password123', is_license_paid=True,
        )

    def tearDown(self):
        cache.clear()

    def _create_student_as_admin(self, password=''):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f'/api/v1/schools/{self.school.id}/students/',
            {
                'name': 'New Learner', 'email': '', 'phone': '', 'whatsapp': '', 'password': password,
                'school_class': str(self.school_class.id), 'student_class': self.school_class.name,
                'class_level': '', 'section': '', 'date_of_birth': '', 'gender': 'female',
                'guardian_name': '', 'guardian_phone': '', 'guardian_whatsapp': '',
                'admission_number': '', 'admission_date': '', 'parent_name': '', 'parent_email': '',
                'parent_phone': '', 'parent_whatsapp': '',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.client.force_authenticate(None)
        return User.objects.get(matricule=response.data['student_matricule'])

    def _activate(self, matricule, password=NEW_PASSWORD, confirm=None):
        return self.client.post(
            ACTIVATE,
            {'matricule': matricule, 'new_password': password, 'confirm_password': confirm or password},
            format='json',
        )

    def _login(self, matricule, password):
        return self.client.post(LOGIN, {'matricule': matricule, 'password': password}, format='json')

    # Case 1
    def test_new_student_is_active_and_can_still_self_activate(self):
        user = self._create_student_as_admin()
        self.assertTrue(user.is_active)
        self.assertFalse(user.student_profile.self_activation_used)
        # Teachers and staff work with the student straight away.
        self.client.force_authenticate(self.admin)
        listed = self.client.get('/api/v1/students/students/')
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(user.matricule, str(listed.data))

    # Case 2 and Case 9
    def test_student_activates_once_then_logs_in_normally(self):
        user = self._create_student_as_admin()
        response = self._activate(user.matricule)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data['activated'])
        # It sets the password; it does not sign the student in.
        self.assertNotIn('access_token', response.data)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(user.student_profile.self_activation_used)
        self.assertIsNotNone(user.student_profile.self_activated_at)
        self.assertNotIn(NEW_PASSWORD, user.password)

        login = self._login(user.matricule, NEW_PASSWORD)
        self.assertEqual(login.status_code, status.HTTP_200_OK, login.data)

    # Case 3
    def test_the_same_matricule_cannot_activate_twice(self):
        user = self._create_student_as_admin()
        self._activate(user.matricule)

        again = self._activate(user.matricule, password='Another!Pass2026')
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('log in with your password', again.data['detail'])
        self.assertEqual(self._login(user.matricule, NEW_PASSWORD).status_code, status.HTTP_200_OK)
        self.assertNotEqual(self._login(user.matricule, 'Another!Pass2026').status_code, status.HTTP_200_OK)

    # Case 4
    def test_unknown_matricule_fails_safely(self):
        response = self._activate('NO-SUCH-MATRICULE')
        self.assertIn(response.status_code, (status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND))
        self.assertFalse(User.objects.filter(matricule='NO-SUCH-MATRICULE').exists())

    # Case 5
    def test_mismatched_confirmation_changes_nothing(self):
        user = self._create_student_as_admin()
        response = self._activate(user.matricule, confirm='Different!Pass2026')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        self.assertFalse(user.student_profile.self_activation_used)
        self.assertTrue(user.check_password('!pending_activation'))

    def test_a_weak_password_is_refused_by_the_existing_rules(self):
        user = self._create_student_as_admin()
        response = self._activate(user.matricule, password='123')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        self.assertFalse(user.student_profile.self_activation_used)

    # Case 6
    def test_an_ineligible_account_cannot_self_activate(self):
        for field, value in (('is_active', False), ('is_suspended', True), ('is_drafted', True)):
            with self.subTest(field=field):
                cache.clear()
                user = self._create_student_as_admin()
                setattr(user, field, value)
                user.save(update_fields=[field])
                response = self._activate(user.matricule)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                user.refresh_from_db()
                self.assertFalse(user.student_profile.self_activation_used)
                # The account status itself is untouched.
                self.assertEqual(getattr(user, field), value)

    # Case 7
    def test_admin_reset_after_activation_keeps_the_privilege_spent(self):
        user = self._create_student_as_admin()
        self._activate(user.matricule)

        self.client.force_authenticate(self.admin)
        reset = self.client.post(f'/api/v1/users/{user.id}/admin-reset-password/', {}, format='json')
        self.assertEqual(reset.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(None)

        user.refresh_from_db()
        self.assertTrue(user.student_profile.self_activation_used)
        self.assertEqual(self._login(user.matricule, reset.data['password']).status_code, status.HTTP_200_OK)
        cache.clear()
        self.assertEqual(self._activate(user.matricule).status_code, status.HTTP_400_BAD_REQUEST)

    # Case 8
    def test_only_one_of_two_racing_claims_can_succeed(self):
        user = self._create_student_as_admin()
        student_id = user.student_profile.pk
        self.assertTrue(students_api.claim_self_activation(student_id))
        self.assertFalse(students_api.claim_self_activation(student_id))

    def test_a_request_that_loses_the_race_leaves_the_winners_password(self):
        user = self._create_student_as_admin()
        # Both requests pass the eligibility checks; the other one claims first.
        real_claim = students_api.claim_self_activation

        def claimed_by_the_other_request(student_id):
            real_claim(student_id)
            return real_claim(student_id)

        with mock.patch.object(students_api, 'claim_self_activation', side_effect=claimed_by_the_other_request):
            response = self._activate(user.matricule)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        self.assertTrue(user.check_password('!pending_activation'))

    # Case 10
    def test_a_student_who_already_has_a_password_is_not_overwritten(self):
        user = self._create_student_as_admin(password='GivenBySchool!26')
        response = self._activate(user.matricule)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        self.assertTrue(user.check_password('GivenBySchool!26'))
        self.assertFalse(user.student_profile.self_activation_used)

    def test_refusals_do_not_reveal_why(self):
        given = self._create_student_as_admin(password='GivenBySchool!26')
        spent = self._create_student_as_admin()
        self._activate(spent.matricule)
        cache.clear()
        first = self._activate(given.matricule).data['detail']
        second = self._activate(spent.matricule).data['detail']
        self.assertEqual(first, second)
        self.assertNotIn('student', first.lower())

    def test_a_student_waiting_on_an_activation_sheet_activates_once(self):
        from apps.students.models import StudentActivationToken

        StudentActivationToken.objects.create(
            school=self.school, school_class=self.school_class, matricule='SHEET-001',
            student_name='Sheet Learner', student_class=self.school_class.name,
        )
        response = self._activate('SHEET-001')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertNotIn('access_token', response.data)
        user = User.objects.get(matricule='SHEET-001')
        self.assertTrue(user.is_active)
        self.assertTrue(user.student_profile.self_activation_used)
        self.assertEqual(self._login('SHEET-001', NEW_PASSWORD).status_code, status.HTTP_200_OK)

        cache.clear()
        again = self._activate('SHEET-001', password='Another!Pass2026')
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(User.objects.filter(matricule='SHEET-001').count(), 1)

    def test_staff_activation_is_unchanged(self):
        """A principal's first activation still works exactly as before, including sign-in."""
        principal = User.objects.create_user(
            matricule='PRN-ACT', name='Principal', email='prn-act@example.org', role='SCHOOL_ADMIN',
            school=self.school, password='!pending_activation', is_license_paid=True,
        )
        response = self._activate(principal.matricule)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('access_token', response.data)
        self.assertFalse(hasattr(principal, 'student_profile') and Student.objects.filter(user=principal).exists())

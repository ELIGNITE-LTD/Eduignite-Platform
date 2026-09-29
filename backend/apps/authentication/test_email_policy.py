"""EduIgnite's email policy, end to end.

Email goes out only for: school created, staff account created, executive
account created, and forgot-password for non-students. Students recover
through their principal, who resets the password without ever seeing the old
one; the student then has to choose their own. Notifications stay in-app and
push, never email.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notifications.models import Notification
from apps.notifications.tasks import deliver_notification
from apps.schools.models import School
from core import email_service
from core.email_service import EmailEvent

User = get_user_model()

SEND = 'core.email_service.send_transactional_email'


class ThrottleFreeAPITestCase(APITestCase):
    """Login and reset are rate-limited through the cache; start and end each test clean."""

    def setUp(self):
        cache.clear()
        super().setUp()

    def tearDown(self):
        cache.clear()
        super().tearDown()


def _school(code, name, **extra):
    return School.objects.create(
        id=code, name=name, short_name=code, principal=f'{name} Principal', location='Buea',
        email=f'{code.lower()}@example.org', phone='237650000000', school_type='general',
        subsystem='anglophone', **extra,
    )


def _user(matricule, role, school=None, **extra):
    return User.objects.create_user(
        matricule=matricule, name=f'{role.title()} {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='OldPassword123!', is_license_paid=True, **extra,
    )


class EmailPolicyGateTests(TestCase):
    @patch('core.email_service.requests.post')
    def test_unapproved_event_never_reaches_the_provider(self, post):
        sent = email_service.send_transactional_email(
            event='attendance_marked', to_email='parent@school.org', to_name='Parent',
            subject='Absent today', html='<p>x</p>', text='x',
        )
        self.assertFalse(sent)
        post.assert_not_called()

    def test_student_and_parent_accounts_get_no_account_email(self):
        school = _school('POL-A', 'Policy College A')
        with patch(SEND, return_value=True) as send:
            for role in ('STUDENT', 'PARENT'):
                self.assertFalse(email_service.send_account_created_email(_user(f'{role}-1', role, school)))
        send.assert_not_called()

    def test_staff_account_email_comes_from_the_principals_office(self):
        school = _school('POL-B', 'Policy College B')
        with patch(SEND, return_value=True) as send:
            email_service.send_account_created_email(_user('TCH-1', 'TEACHER', school))
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs['event'], EmailEvent.STAFF_ACCOUNT_CREATED)
        self.assertEqual(kwargs['sender_name'], "Principal's Office - Policy College B")
        self.assertIn('TCH-1', kwargs['text'])
        self.assertNotIn('OldPassword123!', kwargs['html'] + kwargs['text'])

    def test_executive_account_email_comes_from_the_ceo_office(self):
        with patch(SEND, return_value=True) as send:
            email_service.send_account_created_email(_user('COO-1', 'COO'))
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs['event'], EmailEvent.EXECUTIVE_ACCOUNT_CREATED)
        self.assertEqual(kwargs['sender_name'], email_service.CEO_OFFICE_SENDER)


class NotificationsAreNotEmailedTests(TestCase):
    def test_delivery_pushes_but_never_emails(self):
        user = _user('NOTIF-1', 'TEACHER', _school('POL-N', 'Policy College N'))
        notification = Notification.objects.create(recipient=user, title='Marks published', message='Term 1')
        with patch(SEND, return_value=True) as send, \
                patch('apps.notifications.tasks.send_push_notification.delay') as push:
            self.assertTrue(deliver_notification.run(str(notification.id)))
        push.assert_called_once_with(str(notification.id))
        send.assert_not_called()
        self.assertTrue(Notification.objects.filter(pk=notification.pk).exists())


class ForgotPasswordTests(ThrottleFreeAPITestCase):
    def setUp(self):
        super().setUp()
        self.school = _school('POL-C', 'Policy College C')
        self.other_school = _school('POL-D', 'Policy College D')
        self.principal = _user('PRN-C', 'SCHOOL_ADMIN', self.school, phone='+237677000111')
        self.school.principal_user = self.principal
        self.school.save(update_fields=['principal_user'])
        other_principal = _user('PRN-D', 'SCHOOL_ADMIN', self.other_school)
        self.other_school.principal_user = other_principal
        self.other_school.save(update_fields=['principal_user'])
        self.student = _user('STU-C', 'STUDENT', self.school)

    def test_student_sees_their_own_principal_and_no_email_is_sent(self):
        with patch(SEND, return_value=True) as send:
            response = self.client.post('/api/v1/auth/password-reset/', {'matricule': 'STU-C'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        send.assert_not_called()
        self.assertTrue(response.data['is_student'])
        contact = response.data['principal_contact']
        self.assertEqual(contact['school_name'], 'Policy College C')
        self.assertEqual(contact['principal_name'], self.principal.name)
        self.assertEqual(contact['phone'], '+237677000111')
        self.assertNotIn('email', contact)
        self.assertNotIn('PRN-D', str(response.data))

    def test_staff_principal_and_executive_get_a_reset_email(self):
        _user('TCH-C', 'TEACHER', self.school)
        _user('CTO-1', 'CTO')
        for matricule in ('TCH-C', 'PRN-C', 'CTO-1'):
            with patch(SEND, return_value=True) as send:
                self.client.post('/api/v1/auth/password-reset/', {'matricule': matricule}, format='json')
            send.assert_called_once()
            self.assertEqual(send.call_args.kwargs['event'], EmailEvent.PASSWORD_RESET, matricule)


class PrincipalResetsStudentPasswordTests(ThrottleFreeAPITestCase):
    def setUp(self):
        super().setUp()
        self.school = _school('POL-E', 'Policy College E')
        self.other_school = _school('POL-F', 'Policy College F')
        self.principal = _user('PRN-E', 'SCHOOL_ADMIN', self.school)
        self.other_principal = _user('PRN-F', 'SCHOOL_ADMIN', self.other_school)
        self.teacher = _user('TCH-E', 'TEACHER', self.school)
        self.student = _user('STU-E', 'STUDENT', self.school)

    def _reset(self, actor):
        self.client.force_authenticate(actor)
        return self.client.post(f'/api/v1/users/{self.student.id}/admin-reset-password/', {}, format='json')

    def _login(self, password):
        self.client.force_authenticate(None)
        return self.client.post('/api/v1/auth/login/', {'matricule': 'STU-E', 'password': password}, format='json')

    def test_reset_replaces_password_and_forces_a_new_one_without_email(self):
        with patch(SEND, return_value=True) as send:
            response = self._reset(self.principal)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        send.assert_not_called()
        temporary = response.data['password']
        self.assertGreaterEqual(len(temporary), 12)

        self.student.refresh_from_db()
        self.assertTrue(self.student.must_change_password)
        # Only a hash is stored, never the temporary password itself.
        self.assertNotIn(temporary, self.student.password)

        self.assertEqual(self._login('OldPassword123!').status_code, status.HTTP_401_UNAUTHORIZED)
        login = self._login(temporary)
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertTrue(login.data['user']['must_change_password'])

        self.client.force_authenticate(self.student)
        changed = self.client.post(
            '/api/v1/auth/change-password/',
            {'old_password': temporary, 'new_password': 'MyOwnPass!2026', 'confirm_password': 'MyOwnPass!2026'},
            format='json',
        )
        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertFalse(self.student.must_change_password)

    def test_principal_of_another_school_cannot_reset(self):
        response = self._reset(self.other_principal)
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password('OldPassword123!'))

    def test_teacher_cannot_reset(self):
        response = self._reset(self.teacher)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_no_endpoint_returns_the_existing_password_or_hash(self):
        self.client.force_authenticate(self.principal)
        detail = self.client.get(f'/api/v1/users/{self.student.id}/')
        self.assertNotIn('password', detail.data)


class PendingActivationMarkerTests(ThrottleFreeAPITestCase):
    def test_marker_is_not_a_working_password(self):
        school = _school('POL-G', 'Policy College G')
        User.objects.create_user(
            matricule='PEND-1', name='Pending Teacher', email='pend@example.org', role='TEACHER',
            school=school, password='!pending_activation', is_license_paid=True,
        )
        response = self.client.post(
            '/api/v1/auth/login/', {'matricule': 'PEND-1', 'password': '!pending_activation'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

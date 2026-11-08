"""Learners who exist without a login account (e.g. nursery / primary pupils).

Covers creation, matricule allocation (one generator, never a duplicate, same
format as before), attaching a login later, institution isolation, and that
every place that used to read ``student.user`` copes with a learner who has none.
"""

import re

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.test import APITestCase

from apps.schools.models import School, SchoolClass
from apps.students import api as students_api
from apps.students.models import (
    Guardian,
    ParentStudentLink,
    Student,
    StudentActivationToken,
    StudentGuardian,
)
from apps.users.matricules import generate_school_user_matricule

User = get_user_model()

STUDENTS = '/api/v1/students/students/'


def make_school(sid, name, short):
    return School.objects.create(
        id=sid, name=name, short_name=short, principal='Principal', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone',
    )


class LoginlessPupilBase(APITestCase):
    def setUp(self):
        self.school = make_school('LL-ONE', 'Little Lambs Primary', 'LLP')
        self.other_school = make_school('LL-TWO', 'Other Primary School', 'OPS')
        self.klass = SchoolClass.objects.create(school=self.school, name='Class 1')
        self.admin = User.objects.create_user(
            matricule='ADM-LL1', name='Admin', email='adm-ll1@example.org', role='SCHOOL_ADMIN',
            school=self.school, password='password123', is_license_paid=True,
        )
        self.other_admin = User.objects.create_user(
            matricule='ADM-LL2', name='Other Admin', email='adm-ll2@example.org', role='SCHOOL_ADMIN',
            school=self.other_school, password='password123', is_license_paid=True,
        )

    def payload(self, **extra):
        data = {
            'name': 'Little Pupil', 'school_class': str(self.klass.id), 'student_class': self.klass.name,
            'gender': 'female',
        }
        data.update(extra)
        return data

    def create_pupil(self, **extra):
        self.client.force_authenticate(self.admin)
        response = self.client.post(STUDENTS, self.payload(**extra), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return Student.objects.get(id=response.data['id']), response

    def create_user_student(self, name='With Login', **extra):
        self.client.force_authenticate(self.admin)
        response = self.client.post(STUDENTS, self.payload(name=name, **extra), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return Student.objects.get(id=response.data['id'])


class LoginlessCreationTests(LoginlessPupilBase):
    def test_create_login_false_creates_pupil_without_user(self):
        pupil, response = self.create_pupil(create_login=False)
        self.assertIsNone(pupil.user_id)
        self.assertEqual(pupil.name, 'Little Pupil')
        self.assertEqual(pupil.school_id, self.school.id)
        self.assertEqual(pupil.display_name, 'Little Pupil')
        self.assertEqual(response.data['student_matricule'], pupil.matricule)
        # No placeholder account was created for the pupil.
        self.assertFalse(User.objects.filter(email__endswith='@students.eduignite.local').exists())

    def test_default_still_creates_login(self):
        student = self.create_user_student()
        self.assertIsNotNone(student.user_id)
        self.assertEqual(student.user.role, 'STUDENT')
        self.assertIsNone(student.matricule)
        self.assertEqual(student.display_matricule, student.user.matricule)
        self.assertEqual(student.display_name, 'With Login')

    def test_explicit_create_login_true_matches_default(self):
        student = self.create_user_student(create_login=True)
        self.assertIsNotNone(student.user_id)

    def test_pupil_without_name_is_rejected(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(STUDENTS, self.payload(name='', create_login=False), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_model_rejects_loginless_pupil_without_name(self):
        with self.assertRaises(ValidationError):
            Student.objects.create(
                user=None, school=self.school, student_class='Class 1', admission_number='X-1',
            )

    def test_only_school_admins_can_create(self):
        teacher = User.objects.create_user(
            matricule='TCH-LL1', name='Teacher', email='t-ll1@example.org', role='TEACHER',
            school=self.school, password='password123',
        )
        self.client.force_authenticate(teacher)
        response = self.client.post(STUDENTS, self.payload(create_login=False), format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pupil_is_created_in_the_requesters_school_only(self):
        pupil, _ = self.create_pupil(create_login=False)
        self.client.force_authenticate(self.other_admin)
        listing = self.client.get(STUDENTS)
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        ids = [row['id'] for row in (listing.data['results'] if isinstance(listing.data, dict) else listing.data)]
        self.assertNotIn(str(pupil.id), ids)
        detail = self.client.get(f'{STUDENTS}{pupil.id}/')
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)


class LoginlessMatriculeTests(LoginlessPupilBase):
    FORMAT = re.compile(r'^[A-Z0-9]{2,4}\d{2,}\d{2}ST\d{4}$')

    def test_matricule_comes_from_generator_with_unchanged_format(self):
        pupil, _ = self.create_pupil(create_login=False)
        self.assertRegex(pupil.matricule, self.FORMAT)
        self.assertTrue(pupil.matricule.startswith(f'{self.school.matricule}ST'))
        self.assertEqual(len(pupil.matricule), len(self.school.matricule) + 2 + 4)

    def test_sequence_is_shared_between_pupils_with_and_without_logins(self):
        a, _ = self.create_pupil(create_login=False, name='A')
        b = self.create_user_student(name='B')
        c, _ = self.create_pupil(create_login=False, name='C')
        suffixes = [int(code[-4:]) for code in (a.matricule, b.user.matricule, c.matricule)]
        self.assertEqual(suffixes, [suffixes[0], suffixes[0] + 1, suffixes[0] + 2])
        self.assertEqual(len({a.matricule, b.user.matricule, c.matricule}), 3)

    def test_generator_counts_loginless_matricules(self):
        pupil, _ = self.create_pupil(create_login=False)
        nxt = generate_school_user_matricule(self.school, 'STUDENT')
        self.assertNotEqual(nxt, pupil.matricule)
        self.assertEqual(int(nxt[-4:]), int(pupil.matricule[-4:]) + 1)

    def test_generator_counts_activation_tokens_alongside_pupils(self):
        pupil, _ = self.create_pupil(create_login=False)
        token_code = generate_school_user_matricule(self.school, 'STUDENT')
        StudentActivationToken.objects.create(
            school=self.school, school_class=self.klass, matricule=token_code, student_class='Class 1',
        )
        pupil2, _ = self.create_pupil(create_login=False, name='Second')
        codes = {pupil.matricule, token_code, pupil2.matricule}
        self.assertEqual(len(codes), 3)
        self.assertEqual(int(pupil2.matricule[-4:]), int(token_code[-4:]) + 1)

    def test_activation_token_matricule_blocks_reuse_by_pupil(self):
        token_code = generate_school_user_matricule(self.school, 'STUDENT')
        StudentActivationToken.objects.create(
            school=self.school, school_class=self.klass, matricule=token_code, student_class='Class 1',
        )
        pupil, _ = self.create_pupil(create_login=False)
        self.assertNotEqual(pupil.matricule, token_code)

    def test_matricule_is_unique_per_school_in_the_database(self):
        pupil, _ = self.create_pupil(create_login=False)
        with self.assertRaises((IntegrityError, ValidationError)):
            with transaction.atomic():
                Student.objects.create(
                    user=None, name='Clash', matricule=pupil.matricule, school=self.school,
                    student_class='Class 1', admission_number='CLASH-1',
                )

    def test_two_logins_less_pupils_with_null_matricule_do_not_clash(self):
        # The constraint only applies to stored matricules; users keep theirs on User.
        s1 = self.create_user_student(name='U1')
        s2 = self.create_user_student(name='U2')
        self.assertIsNone(s1.matricule)
        self.assertIsNone(s2.matricule)

    def test_existing_user_student_matricule_format_unchanged(self):
        student = self.create_user_student()
        self.assertRegex(student.user.matricule, self.FORMAT)
        self.assertTrue(student.user.matricule.startswith(f'{self.school.matricule}ST'))

    def test_activation_api_helpers_see_pupil_matricules(self):
        pupil, _ = self.create_pupil(create_login=False)
        self.assertIn(pupil.matricule, students_api.list_activation_matricules(self.school.matricule))
        self.assertTrue(students_api.activation_matricule_exists(pupil.matricule))
        self.assertFalse(students_api.activation_matricule_exists('NOPE0000'))


class AttachLoginTests(LoginlessPupilBase):
    def test_attach_login_keeps_stored_matricule(self):
        pupil, _ = self.create_pupil(create_login=False)
        stored = pupil.matricule
        students_api.attach_login(pupil)
        pupil.refresh_from_db()
        self.assertIsNotNone(pupil.user_id)
        self.assertEqual(pupil.user.matricule, stored)
        self.assertEqual(pupil.user.role, 'STUDENT')
        self.assertEqual(pupil.user.school_id, self.school.id)
        self.assertEqual(pupil.user.name, 'Little Pupil')
        self.assertEqual(pupil.display_matricule, stored)
        self.assertFalse(pupil.user.has_usable_password() and pupil.user.check_password('anything'))

    def test_attach_login_is_idempotent(self):
        pupil, _ = self.create_pupil(create_login=False)
        students_api.attach_login(pupil)
        user_id = pupil.user_id
        students_api.attach_login(pupil)
        self.assertEqual(pupil.user_id, user_id)
        self.assertEqual(User.objects.filter(role='STUDENT', school=self.school).count(), 1)

    def test_attach_login_on_user_student_is_a_noop(self):
        student = self.create_user_student()
        user_id = student.user_id
        students_api.attach_login(student)
        self.assertEqual(student.user_id, user_id)

    def test_attach_login_generates_matricule_when_none_stored(self):
        student = Student.objects.create(
            user=None, name='Old Style', school=self.school, student_class='Class 1', admission_number='OS-1',
        )
        students_api.attach_login(student)
        student.refresh_from_db()
        self.assertRegex(student.user.matricule, r'ST\d{4}$')

    def test_next_matricule_after_attach_does_not_duplicate(self):
        pupil, _ = self.create_pupil(create_login=False)
        students_api.attach_login(pupil)
        nxt = generate_school_user_matricule(self.school, 'STUDENT')
        self.assertNotEqual(nxt, pupil.user.matricule)
        self.assertEqual(int(nxt[-4:]), int(pupil.user.matricule[-4:]) + 1)


class NullSafeReadsTests(LoginlessPupilBase):
    def setUp(self):
        super().setUp()
        self.pupil, _ = self.create_pupil(create_login=False)
        self.with_login = self.create_user_student(name='Has Login')
        self.parent = User.objects.create_user(
            matricule='PAR-LL1', name='Parent', email='par-ll1@example.org', role='PARENT',
            school=self.school, password='password123', is_license_paid=True,
        )
        ParentStudentLink.objects.create(parent=self.parent, student=self.pupil, relationship='guardian', is_primary=True)
        guardian = Guardian.objects.create(name='Guardian G', phone='237650111111')
        StudentGuardian.objects.create(student=self.pupil, guardian=guardian, relationship='legal_guardian', is_primary=True)

    def _rows(self, response):
        return response.data['results'] if isinstance(response.data, dict) and 'results' in response.data else response.data

    def test_list_includes_pupil_with_name(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(STUDENTS)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = {row['id']: row for row in self._rows(response)}
        self.assertIn(str(self.pupil.id), rows)
        self.assertIsNone(rows[str(self.pupil.id)]['user'])
        self.assertEqual(rows[str(self.pupil.id)]['full_name'], 'Little Pupil')
        self.assertEqual(rows[str(self.with_login.id)]['full_name'], 'Has Login')
        self.assertEqual(rows[str(self.with_login.id)]['user']['name'], 'Has Login')
        # guardian / parent-link nested serializers
        pupil_row = rows[str(self.pupil.id)]
        self.assertEqual(pupil_row['parent_links'][0]['student_name'], 'Little Pupil')
        self.assertEqual(pupil_row['guardian_links'][0]['student_name'], 'Little Pupil')

    def test_search_finds_pupil_by_name_and_matricule(self):
        self.client.force_authenticate(self.admin)
        by_name = self._rows(self.client.get(STUDENTS, {'search': 'Little Pupil'}))
        self.assertEqual([r['id'] for r in by_name], [str(self.pupil.id)])
        by_code = self._rows(self.client.get(STUDENTS, {'search': self.pupil.matricule}))
        self.assertIn(str(self.pupil.id), [r['id'] for r in by_code])

    def test_detail_and_student_card(self):
        self.client.force_authenticate(self.admin)
        detail = self.client.get(f'{STUDENTS}{self.pupil.id}/')
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertIsNone(detail.data['user'])
        card = self.client.get(f'{STUDENTS}{self.pupil.id}/student_card/')
        self.assertEqual(card.status_code, status.HTTP_200_OK)
        self.assertEqual(card.data['name'], 'Little Pupil')
        self.assertEqual(card.data['matricule'], self.pupil.matricule)
        self.assertEqual(card.data['email'], '')
        # Fields the Basic Education ID card needs, with no login behind them.
        for key in ('class_level', 'place_of_birth', 'guardian_name', 'guardian_phone',
                    'avatar', 'school_logo', 'academic_year_label'):
            self.assertIn(key, card.data)
        self.assertEqual(card.data['avatar'], '')

    def test_list_exposes_display_matricule_for_pupil(self):
        self.client.force_authenticate(self.admin)
        rows = {r['id']: r for r in self._rows(self.client.get(STUDENTS))}
        row = rows[str(self.pupil.id)]
        self.assertEqual(row['display_matricule'], self.pupil.matricule)
        self.assertEqual(row['display_avatar'], '')

    def test_card_for_user_student_is_unchanged(self):
        self.client.force_authenticate(self.admin)
        card = self.client.get(f'{STUDENTS}{self.with_login.id}/student_card/')
        self.assertEqual(card.data['name'], 'Has Login')
        self.assertEqual(card.data['matricule'], self.with_login.user.matricule)
        self.assertEqual(card.data['email'], self.with_login.user.email)

    def test_public_verify_works_for_pupil(self):
        self.client.force_authenticate(None)
        response = self.client.get(f'{STUDENTS}verify/{self.pupil.admission_number}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['student_name'], 'Little Pupil')
        self.assertEqual(response.data['matricule'], self.pupil.matricule)
        self.assertEqual(response.data['status'], 'ACTIVE')

    def test_picker_and_registry_summary(self):
        self.client.force_authenticate(self.admin)
        picker = self.client.get(f'{STUDENTS}picker/', {'school_class': str(self.klass.id)})
        self.assertEqual(picker.status_code, status.HTTP_200_OK)
        names = {row['full_name'] for row in picker.data}
        self.assertEqual(names, {'Little Pupil', 'Has Login'})
        summary = self.client.get(f'{STUDENTS}registry_summary/')
        self.assertEqual(summary.status_code, status.HTTP_200_OK)

    def test_update_name_of_pupil_without_login(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f'{STUDENTS}{self.pupil.id}/', {'name': 'Renamed Pupil'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.pupil.refresh_from_db()
        self.assertEqual(self.pupil.name, 'Renamed Pupil')

    def test_update_of_user_student_still_updates_user(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f'{STUDENTS}{self.with_login.id}/', {'name': 'Renamed Login'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.with_login.user.refresh_from_db()
        self.assertEqual(self.with_login.user.name, 'Renamed Login')
        self.assertEqual(self.with_login.name, '')

    def test_parent_sees_linked_pupil(self):
        self.client.force_authenticate(self.parent)
        response = self.client.get(STUDENTS)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(str(self.pupil.id), [r['id'] for r in self._rows(response)])

    def test_api_lookups_with_no_user(self):
        self.assertIsNone(students_api.get_student_for_user(None))
        found = students_api.get_student_by_admission_number(self.pupil.admission_number)
        self.assertEqual(found.id, self.pupil.id)
        self.assertEqual(str(self.pupil), f'Little Pupil ({self.pupil.admission_number})')

    def test_guardian_helpers_skip_missing_user(self):
        self.assertEqual([u.id for u in students_api.get_guardian_users(self.pupil)], [self.parent.id])
        self.assertTrue(students_api.is_guardian_of(self.parent, self.pupil))

    def test_promotion_notification_helper_does_not_break(self):
        from apps.students.views import _notify_promotion_outcome

        _notify_promotion_outcome(
            self.pupil, promoted=True, from_class_name='Class 1', to_class_name='Class 2',
            academic_year='2026/2027', sender=self.admin,
        )

    def test_notification_signals_skip_missing_user(self):
        from apps.attendance.models import AttendanceRecord, AttendanceSession
        from apps.notifications.models import Notification

        session = AttendanceSession.objects.create(
            school=self.school, school_class=self.klass, student_class=self.klass.name,
            date='2026-11-02', period=AttendanceSession._meta.get_field('period').choices[0][0],
            teacher=self.admin,
        )
        AttendanceRecord.objects.create(session=session, student=self.pupil, status='absent')
        # The linked parent is told; there is no learner account to notify.
        recipients = set(Notification.objects.values_list('recipient_id', flat=True))
        self.assertIn(self.parent.id, recipients)


class LoginlessDetailNameTests(APITestCase):
    """The guardian-facing detail serializer must show a name for pupils with no login."""

    def test_detail_serializer_exposes_display_names(self):
        from apps.students.serializers import StudentDetailSerializer

        school = make_school('DET-ONE', 'Detail School', 'DETS')
        klass = SchoolClass.objects.create(school=school, name='Class 2')
        pupil = students_api.enrol_student(
            user=None, name='Nameless Login', matricule='DETSP001', school=school,
            school_class=klass, student_class='Class 2', class_level='Class 2', section='General',
            admission_number='D-1',
        )
        data = StudentDetailSerializer(pupil).data
        self.assertEqual(data['full_name'], 'Nameless Login')
        self.assertEqual(data['display_name'], 'Nameless Login')
        self.assertIn('display_matricule', data)
        self.assertIn('display_avatar', data)
        self.assertIsNone(data['user'])
        self.assertIn('school_class_name', data)

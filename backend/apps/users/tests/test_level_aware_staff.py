"""Level-aware staff creation: a nursery/primary school gets a short payload
(no subjects, departments, email or employment type) while secondary schools
keep their existing rules."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.schools.class_teaching import basic_class_ids_for_teacher
from apps.schools.models import ClassTeacherAssignment, School, SchoolClass

User = get_user_model()
USERS = '/api/v1/users/'


def make_school(sid, short, category):
    return School.objects.create(
        id=sid, name=f'{short} School', short_name=short, principal='Head',
        location='Buea', email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone', education_category=category,
    )


class LevelAwareStaffTests(APITestCase):
    def setUp(self):
        self.basic = make_school('LV-BASIC', 'LVB', 'basic')
        self.secondary = make_school('LV-SEC', 'LVS', 'secondary')
        self.basic_admin = User.objects.create_user(
            matricule='LVB-ADMIN', name='Basic Head', email='head@lvb.example.org',
            role='SCHOOL_ADMIN', school=self.basic, password='password123',
        )
        self.sec_admin = User.objects.create_user(
            matricule='LVS-ADMIN', name='Sec Head', email='head@lvs.example.org',
            role='SCHOOL_ADMIN', school=self.secondary, password='password123',
        )
        self.basic_class = SchoolClass.objects.create(school=self.basic, name='Class 3 A')
        self.sec_class = SchoolClass.objects.create(school=self.secondary, name='Form 2 A')

    def _basic_payload(self, **extra):
        payload = {
            'name': 'Mary Teacher', 'phone': '670000111', 'role': 'TEACHER',
            'job_title': 'Class teacher', 'gender': 'female', 'hire_date': '2026-09-01',
            'school': self.basic.id, 'school_id': self.basic.id,
        }
        payload.update(extra)
        return payload

    def test_basic_teacher_needs_no_subjects_email_or_employment_type(self):
        self.client.force_authenticate(self.basic_admin)
        response = self.client.post(USERS, self._basic_payload(), format='json')
        self.assertEqual(response.status_code, 201, response.content)
        user = User.objects.get(id=response.data['id'])
        self.assertEqual(user.school_id, self.basic.id)
        self.assertEqual(user.job_title, 'Class teacher')
        self.assertEqual(user.gender, 'female')
        self.assertEqual(str(user.hire_date), '2026-09-01')
        self.assertTrue(user.matricule)
        self.assertTrue(user.email.endswith('.eduignite.local'))

    def test_basic_teacher_assigned_to_class_gets_class_assignment(self):
        self.client.force_authenticate(self.basic_admin)
        response = self.client.post(
            USERS, self._basic_payload(class_teacher_for=str(self.basic_class.id)), format='json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        user = User.objects.get(id=response.data['id'])
        assignment = ClassTeacherAssignment.objects.get(teacher=user)
        self.assertEqual(assignment.school_class_id, self.basic_class.id)
        self.assertTrue(assignment.is_lead)
        self.assertIn(self.basic_class.id, basic_class_ids_for_teacher(user))

    def test_second_teacher_on_same_class_is_not_lead(self):
        self.client.force_authenticate(self.basic_admin)
        for name in ('First Teacher', 'Second Teacher'):
            r = self.client.post(
                USERS, self._basic_payload(name=name, class_teacher_for=str(self.basic_class.id)),
                format='json',
            )
            self.assertEqual(r.status_code, 201, r.content)
        leads = list(ClassTeacherAssignment.objects.filter(school_class=self.basic_class).values_list('is_lead', flat=True))
        self.assertEqual(sorted(leads), [False, True])

    def test_class_teacher_for_rejected_in_secondary_school(self):
        self.client.force_authenticate(self.sec_admin)
        response = self.client.post(
            USERS,
            self._basic_payload(school=self.secondary.id, school_id=self.secondary.id,
                                class_teacher_for=str(self.sec_class.id)),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('class_teacher_for', response.data['errors'])
        self.assertFalse(ClassTeacherAssignment.objects.exists())

    def test_class_teacher_for_from_another_school_is_rejected(self):
        self.client.force_authenticate(self.basic_admin)
        other = make_school('LV-BASIC2', 'LB2', 'basic')
        foreign_class = SchoolClass.objects.create(school=other, name='Class 1')
        response = self.client.post(
            USERS, self._basic_payload(class_teacher_for=str(foreign_class.id)), format='json',
        )
        # The class queryset is not narrowed to the school, so the serializer rule must catch it.
        self.assertEqual(response.status_code, 400)
        self.assertIn('class_teacher_for', response.data['errors'])

    def test_class_teacher_for_requires_teacher_role(self):
        self.client.force_authenticate(self.basic_admin)
        response = self.client.post(
            USERS,
            self._basic_payload(role='BURSAR', class_teacher_for=str(self.basic_class.id)),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('class_teacher_for', response.data['errors'])

    def test_secondary_rules_unchanged_subject_assignments_still_validated(self):
        self.client.force_authenticate(self.sec_admin)
        response = self.client.post(
            USERS,
            {'name': 'Sec Teacher', 'phone': '670000222', 'role': 'TEACHER',
             'school': self.secondary.id, 'school_id': self.secondary.id,
             'teaching_assignments': ['11111111-1111-1111-1111-111111111111']},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('teaching_assignments', response.data['errors'])

    def test_school_scoped_create_requires_email_for_secondary_but_not_basic(self):
        self.client.force_authenticate(self.sec_admin)
        sec = self.client.post(
            f'/api/v1/schools/{self.secondary.id}/staff/',
            {'name': 'No Email', 'phone': '670000333', 'role': 'TEACHER'}, format='json',
        )
        self.assertEqual(sec.status_code, 400)
        self.assertIn('email', sec.data)

        self.client.force_authenticate(self.basic_admin)
        basic = self.client.post(
            f'/api/v1/schools/{self.basic.id}/staff/',
            {'name': 'No Email', 'phone': '670000333', 'role': 'TEACHER'}, format='json',
        )
        self.assertEqual(basic.status_code, 201, basic.content)

    def test_isolation_admin_cannot_create_staff_in_other_school(self):
        self.client.force_authenticate(self.basic_admin)
        response = self.client.post(
            USERS,
            self._basic_payload(school=self.secondary.id, school_id=self.secondary.id),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('school', response.data['errors'])
        self.assertFalse(User.objects.filter(name='Mary Teacher').exists())

    def test_invalid_gender_rejected(self):
        self.client.force_authenticate(self.basic_admin)
        response = self.client.post(USERS, self._basic_payload(gender='robot'), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('gender', response.data['errors'])


class ExecutiveCreatesBasicStaffTests(APITestCase):
    """An executive staffing a nursery/primary school gets the same short rules,
    keyed on the TARGET school's category (not the creator's)."""

    def setUp(self):
        self.basic = make_school('EX-BASIC', 'EXB', 'basic')
        self.secondary = make_school('EX-SEC', 'EXS', 'secondary')
        self.home = make_school('EX-HOME', 'EXH', 'secondary')
        self.ceo = User.objects.create_user(
            matricule='EX-CEO', name='The CEO', email='ceo@example.org',
            role='CEO', school=self.home, password='password123',
        )
        self.klass = SchoolClass.objects.create(school=self.basic, name='Class 1 A')

    def _payload(self, school, **extra):
        payload = {
            'name': 'Exec Made Teacher', 'phone': '670000999', 'role': 'TEACHER',
            'job_title': 'Class teacher', 'school': school.id, 'school_id': school.id,
        }
        payload.update(extra)
        return payload

    def test_executive_creates_class_teacher_in_basic_school_without_email(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.post(
            USERS, self._payload(self.basic, class_teacher_for=str(self.klass.id)), format='json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        user = User.objects.get(id=response.data['id'])
        self.assertEqual(user.school_id, self.basic.id)
        self.assertTrue(ClassTeacherAssignment.objects.filter(teacher=user, school_class=self.klass).exists())

    def test_executive_school_scoped_email_rule_follows_target_school(self):
        self.client.force_authenticate(self.ceo)
        basic = self.client.post(
            f'/api/v1/schools/{self.basic.id}/staff/',
            {'name': 'No Email', 'phone': '670000444', 'role': 'TEACHER'}, format='json',
        )
        self.assertEqual(basic.status_code, 201, basic.content)
        sec = self.client.post(
            f'/api/v1/schools/{self.secondary.id}/staff/',
            {'name': 'No Email', 'phone': '670000445', 'role': 'TEACHER'}, format='json',
        )
        self.assertEqual(sec.status_code, 400)

    def test_executive_class_teacher_for_rejected_in_secondary_target(self):
        sec_class = SchoolClass.objects.create(school=self.secondary, name='Form 1 A')
        self.client.force_authenticate(self.ceo)
        response = self.client.post(
            USERS, self._payload(self.secondary, class_teacher_for=str(sec_class.id)), format='json',
        )
        self.assertEqual(response.status_code, 400)

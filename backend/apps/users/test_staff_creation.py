"""Staff creation through POST /api/v1/users/, with the exact payloads the
website, desktop and mobile staff pages send, followed by a real login."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.grades.models import ClassSubject, Subject
from apps.schools.models import School, SchoolClass

User = get_user_model()


class StaffCreationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.school = School.objects.create(
            id='STAFF-TEST',
            name='Staff Creation Test College',
            short_name='SCTC',
            principal='Principal Staff',
            location='Bamenda',
            email='staff-creation@example.com',
            phone='237650400400',
            school_type='mixed',
            subsystem='bilingual',
        )
        self.other_school = School.objects.create(
            id='OTHER-TEST',
            name='Another Test College',
            short_name='ATC',
            principal='Other Principal',
            location='Buea',
            email='other-school@example.com',
            phone='237650500500',
            school_type='mixed',
            subsystem='bilingual',
        )
        self.sub_school = self.school.sub_schools.order_by('name').first()
        self.school_class = SchoolClass.objects.create(
            school=self.school, sub_school=self.sub_school, name='Form 2 B',
        )
        self.subject = Subject.objects.create(
            school=self.school, name='Physics', code='PHY-STAFF', level='Form 2', coefficient='3.00',
        )
        self.class_subject = ClassSubject.objects.create(school_class=self.school_class, subject=self.subject)
        self.principal = User.objects.create_user(
            matricule='SCTC-ADMIN', name='Principal Staff', email='principal.staff@example.com',
            role='SCHOOL_ADMIN', school=self.school, password='password123',
        )
        self.teacher = User.objects.create_user(
            matricule='SCTC-TE-001', name='Existing Teacher', email='existing.teacher@example.com',
            role='TEACHER', school=self.school, password='password123',
        )

    def _website_teacher_payload(self, **overrides):
        payload = {
            'name': 'New Physics Teacher',
            'email': 'new.physics@example.com',
            'phone': '+237 670 000 111',
            'whatsapp': '670000111',
            'role': 'TEACHER',
            'employment_type': 'civil_servant',
            'school': self.school.id,
            'school_id': self.school.id,
            'sub_school': str(self.sub_school.id),
            'class_master_for': str(self.school_class.id),
            'teaching_assignments': [str(self.class_subject.id)],
            'password': 'Kilimanjaro#2026',
            'password_confirm': 'Kilimanjaro#2026',
        }
        payload.update(overrides)
        return payload

    def _login(self, matricule, password):
        return APIClient().post('/api/v1/auth/login/', {'matricule': matricule, 'password': password}, format='json')

    def test_principal_creates_teacher_with_website_payload_and_teacher_can_log_in(self):
        self.client.force_authenticate(self.principal)
        response = self.client.post('/api/v1/users/', self._website_teacher_payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)

        teacher = User.objects.get(id=response.data['id'])
        self.assertEqual(teacher.school, self.school)
        self.assertEqual(teacher.employment_type, 'civil_servant')
        self.class_subject.refresh_from_db()
        self.assertEqual(self.class_subject.teacher, teacher)

        login = self._login(teacher.matricule, 'Kilimanjaro#2026')
        self.assertEqual(login.status_code, 200, login.data)

    def test_mobile_payload_without_employment_type_or_links(self):
        self.client.force_authenticate(self.principal)
        payload = {
            'name': 'Mobile Created Teacher',
            'email': 'mobile.teacher@example.com',
            'role': 'TEACHER',
            'school': self.school.id,
            'school_id': self.school.id,
        }
        response = self.client.post('/api/v1/users/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)

    def test_principal_creates_each_non_teaching_staff_role(self):
        self.client.force_authenticate(self.principal)
        for index, role in enumerate(['SUB_ADMIN', 'BURSAR', 'LIBRARIAN']):
            payload = {
                'name': f'Staff {role}',
                'email': f'staff.{role.lower()}@example.com',
                'role': role,
                'school': self.school.id,
                'school_id': self.school.id,
                'password': 'Kilimanjaro#2026',
                'password_confirm': 'Kilimanjaro#2026',
            }
            response = self.client.post('/api/v1/users/', payload, format='json')
            self.assertEqual(response.status_code, 201, (role, response.data))
            created = User.objects.get(id=response.data['id'])
            self.assertEqual(self._login(created.matricule, 'Kilimanjaro#2026').status_code, 200, role)

    def test_duplicate_email_returns_a_readable_validation_error(self):
        self.client.force_authenticate(self.principal)
        response = self.client.post(
            '/api/v1/users/',
            self._website_teacher_payload(email='existing.teacher@example.com', teaching_assignments=[]),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', str(response.data).lower())

    def test_teacher_cannot_create_staff(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            '/api/v1/users/', self._website_teacher_payload(teaching_assignments=[]), format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_principal_cannot_create_staff_in_another_school(self):
        self.client.force_authenticate(self.principal)
        payload = {
            'name': 'Cross School Teacher',
            'email': 'cross.school@example.com',
            'role': 'TEACHER',
            'school': self.other_school.id,
            'school_id': self.other_school.id,
        }
        response = self.client.post('/api/v1/users/', payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email='cross.school@example.com').exists())

"""Class -> Student selectors used by Skill Gap Analysis and the Academic Roadmap.

The class list and the student list are built from the same role-scoped
queryset as the student directory, so a teacher is only offered the classes
they teach, and staff must narrow to a class before any students are listed.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.schools.models import School, SchoolClass
from .models import Student

User = get_user_model()


class StudentSelectorTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='SEL-TEST',
            name='Selector Test College',
            short_name='STC',
            principal='Principal',
            location='Buea',
            email='selector@example.com',
            phone='237650000001',
            school_type='general',
            subsystem='anglophone',
        )
        self.admin = self._user('ADM-SEL-1', 'Admin', 'SCHOOL_ADMIN')
        self.teacher = self._user('TCH-SEL-1', 'Teacher', 'TEACHER')
        self.form5 = SchoolClass.objects.create(school=self.school, name='Form 5 Science', class_master=self.teacher)
        self.form4 = SchoolClass.objects.create(school=self.school, name='Form 4 Arts')

        self.rene = self._student('STU-SEL-1', 'NSAME RENE', '0001', self.form5)
        self._student('STU-SEL-2', 'NSAME RENE', '0007', self.form5)
        self._student('STU-SEL-3', 'Awa Bih', '0002', self.form5)
        self._student('STU-SEL-4', 'Other Learner', '0003', self.form4)

    def _user(self, matricule, name, role):
        return User.objects.create_user(
            matricule=matricule, name=name, email=f'{matricule.lower()}@example.com',
            role=role, school=self.school, password='password123', is_license_paid=True,
        )

    def _student(self, matricule, name, admission_number, school_class):
        return Student.objects.create(
            user=self._user(matricule, name, 'STUDENT'), school=self.school, school_class=school_class,
            student_class=school_class.name, admission_number=admission_number,
        )

    def test_admin_sees_every_class_with_counts(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/v1/students/students/class_options/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        counts = {item['name']: item['student_count'] for item in response.data}
        self.assertEqual(counts, {'Form 4 Arts': 1, 'Form 5 Science': 3})

    def test_teacher_only_sees_classes_they_teach(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.get('/api/v1/students/students/class_options/')
        self.assertEqual([item['name'] for item in response.data], ['Form 5 Science'])

    def test_picker_lists_one_class_by_name(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/v1/students/students/picker/', {'school_class': str(self.form5.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)
        self.assertEqual(response.data[0]['full_name'], 'Awa Bih')
        self.assertEqual({row['class_name'] for row in response.data}, {'Form 5 Science'})

    def test_picker_search_matches_part_of_a_name(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            '/api/v1/students/students/picker/', {'school_class': str(self.form5.id), 'search': 'Ren'},
        )
        self.assertEqual({row['admission_number'] for row in response.data}, {'0001', '0007'})

    def test_staff_must_choose_a_class_first(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/v1/students/students/picker/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_teacher_gets_nothing_from_a_class_they_do_not_teach(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.get('/api/v1/students/students/picker/', {'school_class': str(self.form4.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_invalid_class_id_is_a_clean_400(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/v1/students/students/picker/', {'school_class': 'not-a-uuid'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

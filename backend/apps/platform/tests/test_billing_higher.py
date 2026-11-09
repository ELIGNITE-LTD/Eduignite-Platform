"""count_billable_pupils: higher schools count enrolled students without a class; others are unchanged."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.schools.models import School, SchoolClass
from apps.students import api as students_api

User = get_user_model()


def make_school(sid, category):
    return School.objects.create(
        id=sid, name=f'Bill {sid}', short_name=sid[:4], principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone', education_category=category,
    )


class BillableCountTests(APITestCase):
    def setUp(self):
        self.higher = make_school('BH-HIGH', 'higher')
        self.basic = make_school('BH-BASIC', 'basic')
        self.secondary = make_school('BH-SEC', 'secondary')
        self.klass = {
            'basic': SchoolClass.objects.create(school=self.basic, name='Class 1'),
            'secondary': SchoolClass.objects.create(school=self.secondary, name='Form 1'),
        }

    def student(self, school, number, school_class=None, drafted=False):
        student, _ = students_api.upsert_student(school=school, admission_number=number, defaults={
            'name': number, 'student_class': 'Year One', 'school_class': school_class,
        })
        if drafted:
            user = User.objects.create_user(
                matricule=f'U-{number}', name=number, email=f'{number.lower()}@example.org',
                role='STUDENT', school=school, password='password123')
            user.is_drafted = True
            user.save(update_fields=['is_drafted'])
            students_api.list_students(school=school).filter(admission_number=number).update(user=user)
        return student

    def test_higher_counts_students_without_a_class(self):
        self.student(self.higher, 'H1')
        self.student(self.higher, 'H2')
        self.assertEqual(students_api.count_billable_pupils(self.higher), 2)
        self.assertEqual(students_api.count_billable_pupils_by_school()[self.higher.id], 2)

    def test_higher_drafted_login_still_excluded_and_other_schools_not_mixed(self):
        self.student(self.higher, 'H1')
        self.student(self.higher, 'H2', drafted=True)
        self.student(self.basic, 'B1', self.klass['basic'])
        self.assertEqual(students_api.count_billable_pupils(self.higher), 1)

    def test_basic_and_secondary_unchanged_class_less_not_counted(self):
        self.student(self.basic, 'B1', self.klass['basic'])
        self.student(self.basic, 'B2')  # not enrolled in a class yet
        self.student(self.secondary, 'S1', self.klass['secondary'])
        self.student(self.secondary, 'S2')
        self.student(self.secondary, 'S3', self.klass['secondary'], drafted=True)
        self.assertEqual(students_api.count_billable_pupils(self.basic), 1)
        self.assertEqual(students_api.count_billable_pupils(self.secondary), 1)
        counts = students_api.count_billable_pupils_by_school()
        self.assertEqual(counts[self.basic.id], 1)
        self.assertEqual(counts[self.secondary.id], 1)
        self.assertNotIn(self.higher.id, counts)

    def test_none_school_is_zero(self):
        self.assertEqual(students_api.count_billable_pupils(None), 0)

"""Every record created in one module must be retrievable by the modules that depend on it.

The API paginates (default 20, ceiling 1000). These tests create volumes well
beyond a page - 130 staff, 45 sub-schools, 70 classes, 260 students, 130 fee
types - and assert that following ``next`` yields every record exactly once,
that the ``limit`` alias is honoured, that the ceiling clamps instead of
failing, and that school / sub-school isolation still holds.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.fees.models import FeeStructure
from apps.schools.models import School, SchoolClass, SubSchool
from apps.students.models import Student

User = get_user_model()

STAFF = '/api/v1/schools/hierarchy/staff/'
SUB_SCHOOLS = '/api/v1/schools/hierarchy/sub-schools/'
CLASSES = '/api/v1/schools/hierarchy/classes/'
STUDENTS = '/api/v1/students/students/'
USERS = '/api/v1/users/'
FEE_STRUCTURES = '/api/v1/fees/fee-structures/'


def make_school(sid, name, short):
    return School.objects.create(
        id=sid, name=name, short_name=short, principal='Principal', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone',
    )


def fetch_all(client, url, **params):
    """Follow ``next`` like the apps' fetchAllPages helper; return (rows, pages)."""
    rows, pages = [], 0
    query = dict(params)
    query.setdefault('page', 1)
    while True:
        response = client.get(url, query)
        assert response.status_code == 200, (url, response.status_code, response.data)
        data = response.data
        rows.extend(data['results'])
        pages += 1
        if not data.get('next'):
            return rows, pages
        query['page'] = int(query['page']) + 1
        assert pages < 200


class CompleteListsBase(APITestCase):
    STAFF_COUNT = 130
    SUB_SCHOOL_COUNT = 45
    CLASS_COUNT = 70
    STUDENT_COUNT = 260

    @classmethod
    def setUpTestData(cls):
        cls.school = make_school('CL-ONE', 'Complete Lists College', 'CLC')
        cls.other_school = make_school('CL-TWO', 'Other College', 'OTC')
        cls.admin = User.objects.create_user(
            matricule='ADM-CL1', name='Admin', email='adm-cl1@example.org', role='SCHOOL_ADMIN',
            school=cls.school, password='password123', is_license_paid=True,
        )
        cls.other_admin = User.objects.create_user(
            matricule='ADM-CL2', name='Other Admin', email='adm-cl2@example.org', role='SCHOOL_ADMIN',
            school=cls.other_school, password='password123', is_license_paid=True,
        )
        roles = ['TEACHER', 'TEACHER', 'TEACHER', 'BURSAR', 'LIBRARIAN']
        cls.staff = [
            User.objects.create_user(
                matricule=f'STF-CL-{i:04d}', name=f'Staff {i:04d}', email=f'staff{i}@example.org',
                role=roles[i % len(roles)], school=cls.school, password='password123',
            )
            for i in range(cls.STAFF_COUNT)
        ]
        for i in range(12):
            User.objects.create_user(
                matricule=f'STF-OT-{i:04d}', name=f'Other Staff {i}', email=f'ostaff{i}@example.org',
                role='TEACHER', school=cls.other_school, password='password123',
            )
        cls.sub_schools = [
            SubSchool.objects.create(school=cls.school, name=f'Custom Section {i:03d}', is_system_managed=False)
            for i in range(cls.SUB_SCHOOL_COUNT)
        ]
        SubSchool.objects.create(school=cls.other_school, name='Foreign Section', is_system_managed=False)
        cls.classes = [
            SchoolClass.objects.create(
                school=cls.school, name=f'Class {i:03d}', sub_school=cls.sub_schools[i % cls.SUB_SCHOOL_COUNT],
            )
            for i in range(cls.CLASS_COUNT)
        ]
        SchoolClass.objects.create(school=cls.other_school, name='Foreign Class')
        cls.students = [
            Student.objects.create(
                user=None, school=cls.school, school_class=cls.classes[i % cls.CLASS_COUNT],
                student_class=cls.classes[i % cls.CLASS_COUNT].name, admission_number=f'ADM-{i:05d}',
                name=f'Pupil {i:05d}',
            )
            for i in range(cls.STUDENT_COUNT)
        ]
        Student.objects.create(
            user=None, school=cls.other_school, student_class='Foreign', admission_number='F-1', name='Foreign Pupil',
        )
        for i in range(cls.STAFF_COUNT):
            FeeStructure.objects.create(
                school=cls.school, name=f'Fee {i:03d}', role='STUDENT', amount=1000 + i,
                academic_year='2025/2026',
            )
        FeeStructure.objects.create(
            school=cls.other_school, name='Foreign Fee', role='STUDENT', amount=5, academic_year='2025/2026',
        )

    def setUp(self):
        self.client.force_authenticate(self.admin)


class StaffSelectorTests(CompleteListsBase):
    """Class-master and subject-teacher selectors read /hierarchy/staff/."""

    def real_staff_count(self):
        # The school admin is also eligible staff on this endpoint.
        return self.STAFF_COUNT + 1

    def test_default_page_is_a_page_not_the_whole_list(self):
        response = self.client.get(STAFF)
        self.assertEqual(len(response.data['results']), 20)
        self.assertEqual(response.data['count'], self.real_staff_count())
        self.assertIsNotNone(response.data['next'])

    def test_following_next_returns_every_staff_member_once(self):
        rows, pages = fetch_all(self.client, STAFF, page_size=50)
        ids = [row['id'] for row in rows]
        self.assertEqual(len(ids), self.real_staff_count())
        self.assertEqual(len(set(ids)), len(ids))
        self.assertGreater(pages, 1)
        self.assertEqual({str(s.id) for s in self.staff} | {str(self.admin.id)}, set(ids))

    def test_limit_alias_is_honoured_up_to_the_ceiling(self):
        response = self.client.get(STAFF, {'limit': 500})
        self.assertEqual(len(response.data['results']), self.real_staff_count())
        self.assertIsNone(response.data['next'])

    def test_page_size_above_ceiling_is_clamped_not_rejected(self):
        response = self.client.get(STAFF, {'page_size': 100000})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), self.real_staff_count())

    def test_page_size_wins_over_limit(self):
        response = self.client.get(STAFF, {'page_size': 7, 'limit': 100})
        self.assertEqual(len(response.data['results']), 7)

    def test_garbage_limit_falls_back_to_default(self):
        for bad in ('abc', '0', '-5', ''):
            response = self.client.get(STAFF, {'limit': bad})
            self.assertEqual(response.status_code, 200, bad)
            self.assertEqual(len(response.data['results']), 20, bad)

    def test_other_school_staff_never_leak(self):
        rows, _ = fetch_all(self.client, STAFF, page_size=100)
        self.assertFalse(any(row['name'].startswith('Other Staff') for row in rows))
        self.client.force_authenticate(self.other_admin)
        rows, _ = fetch_all(self.client, STAFF, page_size=100)
        self.assertEqual(len(rows), 12 + 1)

    def test_users_endpoint_role_filter_returns_all_teachers(self):
        expected = sum(1 for s in self.staff if s.role == 'TEACHER')
        rows, pages = fetch_all(self.client, USERS, role='TEACHER', page_size=25)
        self.assertEqual(len(rows), expected)
        self.assertGreater(pages, 1)
        self.assertEqual(len({r['id'] for r in rows}), expected)


class SubSchoolAndClassTests(CompleteListsBase):
    def test_all_sub_schools_are_retrievable(self):
        rows, pages = fetch_all(self.client, SUB_SCHOOLS, page_size=20)
        names = {r['name'] for r in rows}
        expected = set(SubSchool.objects.filter(school=self.school).values_list('name', flat=True))
        self.assertEqual(names, expected)
        self.assertTrue({f'Custom Section {i:03d}' for i in range(self.SUB_SCHOOL_COUNT)} <= names)
        self.assertGreater(pages, 1)
        self.assertNotIn('Foreign Section', names)

    def test_limit_returns_every_sub_school_in_one_request(self):
        response = self.client.get(SUB_SCHOOLS, {'limit': 500})
        self.assertEqual(len(response.data['results']), SubSchool.objects.filter(school=self.school).count())

    def test_all_classes_are_retrievable_and_filter_by_sub_school(self):
        rows, _ = fetch_all(self.client, CLASSES, page_size=25)
        self.assertEqual(len(rows), self.CLASS_COUNT)
        sub = self.sub_schools[3]
        rows, _ = fetch_all(self.client, CLASSES, sub_school=str(sub.id))
        expected = sum(1 for c in self.classes if c.sub_school_id == sub.id)
        self.assertEqual(len(rows), expected)
        self.assertTrue(all(str(r['sub_school']) == str(sub.id) for r in rows))

    def test_vice_principal_only_sees_own_sub_school(self):
        sub = self.sub_schools[0]
        vp = User.objects.create_user(
            matricule='VP-CL-1', name='Vice', email='vp-cl@example.org', role='SUB_ADMIN',
            school=self.school, sub_school=sub, password='password123',
        )
        self.client.force_authenticate(vp)
        rows, _ = fetch_all(self.client, CLASSES, page_size=100)
        self.assertTrue(rows)
        self.assertTrue(all(str(r['sub_school']) == str(sub.id) for r in rows))
        rows, _ = fetch_all(self.client, SUB_SCHOOLS, page_size=100)
        self.assertEqual([str(r['id']) for r in rows], [str(sub.id)])

    def test_new_sub_school_appears_immediately(self):
        before = self.client.get(SUB_SCHOOLS, {'limit': 500}).data['count']
        created = self.client.post(SUB_SCHOOLS, {'name': 'Brand New Section'}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        after = self.client.get(SUB_SCHOOLS, {'limit': 500})
        self.assertEqual(after.data['count'], before + 1)
        self.assertIn('Brand New Section', {r['name'] for r in after.data['results']})


class StudentSelectorTests(CompleteListsBase):
    def test_all_students_retrievable_across_pages(self):
        rows, pages = fetch_all(self.client, STUDENTS, page_size=100)
        self.assertEqual(len(rows), self.STUDENT_COUNT)
        self.assertEqual(len({r['id'] for r in rows}), self.STUDENT_COUNT)
        self.assertGreaterEqual(pages, 3)

    def test_limit_alias_on_students(self):
        response = self.client.get(STUDENTS, {'limit': 1000})
        self.assertEqual(len(response.data['results']), self.STUDENT_COUNT)

    def test_filter_by_school_class(self):
        klass = self.classes[5]
        rows, _ = fetch_all(self.client, STUDENTS, school_class=str(klass.id))
        expected = sum(1 for s in self.students if s.school_class_id == klass.id)
        self.assertEqual(len(rows), expected)
        self.assertGreater(expected, 0)

    def test_filter_by_sub_school(self):
        sub = self.sub_schools[2]
        rows, _ = fetch_all(self.client, STUDENTS, sub_school=str(sub.id))
        expected = sum(1 for s in self.students if s.school_class.sub_school_id == sub.id)
        self.assertEqual(len(rows), expected)
        self.assertGreater(expected, 0)

    def test_search_still_works_across_pages(self):
        rows, pages = fetch_all(self.client, STUDENTS, search='0025', page_size=4)
        expected = [s for s in self.students if '0025' in s.admission_number or '0025' in s.name]
        self.assertGreater(len(expected), 4)
        self.assertEqual(len(rows), len(expected))
        self.assertGreater(pages, 1)

    def test_other_school_students_never_leak(self):
        rows, _ = fetch_all(self.client, STUDENTS, page_size=100)
        self.assertFalse(any(r.get('admission_number') == 'F-1' for r in rows))

    def test_vice_principal_students_scoped_to_sub_school(self):
        sub = self.sub_schools[1]
        vp = User.objects.create_user(
            matricule='VP-CL-2', name='Vice Two', email='vp-cl2@example.org', role='SUB_ADMIN',
            school=self.school, sub_school=sub, password='password123',
        )
        self.client.force_authenticate(vp)
        rows, _ = fetch_all(self.client, STUDENTS, page_size=100)
        expected = sum(1 for s in self.students if s.school_class.sub_school_id == sub.id)
        self.assertEqual(len(rows), expected)


class FeeSelectorTests(CompleteListsBase):
    def setUp(self):
        super().setUp()
        # The fees app licence is not what is under test here.
        patcher = patch('apps.registry.api.is_installed_for_user', return_value=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_all_fee_types_retrievable(self):
        rows, pages = fetch_all(self.client, FEE_STRUCTURES, page_size=50)
        self.assertEqual(len(rows), self.STAFF_COUNT)
        self.assertGreater(pages, 1)
        self.assertFalse(any(r['name'] == 'Foreign Fee' for r in rows))

    def test_limit_alias_on_fee_types(self):
        response = self.client.get(FEE_STRUCTURES, {'limit': 500})
        self.assertEqual(len(response.data['results']), self.STAFF_COUNT)

"""Proprietor side: read-only statistics, strictly limited to linked schools."""

from datetime import timedelta

from django.core.cache import cache
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.attendance.models import AttendanceRecord, AttendanceSession
from apps.proprietors.models import ProprietorSchoolLink
from apps.proprietors.tests.helpers import make_proprietor, make_school, make_user
from apps.schools.models import SchoolClass
from apps.students import api as students_api

OVERVIEW = '/api/v1/proprietor/overview/'


def pupil(school, number, gender, school_class=None):
    student, _ = students_api.upsert_student(
        school=school, admission_number=number,
        defaults={'name': f'Pupil {number}', 'gender': gender, 'school_class': school_class,
                  'student_class': school_class.name if school_class else 'Class 1'},
    )
    return student


def register(school, school_class, students, statuses, day=None):
    session = AttendanceSession.objects.create(
        school=school, school_class=school_class, date=day or timezone.localdate(), period='daily',
        session_type=AttendanceSession.TYPE_DAILY,
    )
    for student, status in zip(students, statuses):
        AttendanceRecord.objects.create(session=session, student=student, status=status)


class ProprietorStatsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.mine1 = make_school('MIN1', 'Mine Nursery', category='basic')
        cls.mine2 = make_school('MIN2', 'Mine College', category='secondary')
        cls.foreign = make_school('FOR1', 'Foreign School', category='secondary')
        cls.prop = make_proprietor('PRP01', [cls.mine1, cls.mine2])
        cls.other_prop = make_proprietor('PRP02', [cls.foreign])

        cls.class1 = SchoolClass.objects.create(school=cls.mine1, name='Class 1')
        cls.class2 = SchoolClass.objects.create(school=cls.mine2, name='Form 1')
        cls.class_f = SchoolClass.objects.create(school=cls.foreign, name='Form 5')
        a = [pupil(cls.mine1, 'A1', 'male', cls.class1), pupil(cls.mine1, 'A2', 'female', cls.class1)]
        b = [pupil(cls.mine2, 'B1', 'female', cls.class2), pupil(cls.mine2, 'B2', 'female', cls.class2),
             pupil(cls.mine2, 'B3', 'male', cls.class2)]
        f = [pupil(cls.foreign, f'F{i}', 'male', cls.class_f) for i in range(7)]
        register(cls.mine1, cls.class1, a, ['present', 'absent'])
        register(cls.mine2, cls.class2, b, ['present', 'late', 'absent'])
        register(cls.foreign, cls.class_f, f, ['absent'] * 7)

        cls.admin1 = make_user('ADM1', 'SCHOOL_ADMIN', school=cls.mine1)
        make_user('TCH1', 'TEACHER', school=cls.mine1)
        make_user('TCH2', 'TEACHER', school=cls.mine2)
        make_user('TCH3', 'TEACHER', school=cls.foreign)
        make_user('ADM9', 'SCHOOL_ADMIN', school=cls.foreign)

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.prop)

    def test_overview_aggregates_only_linked_schools(self):
        body = self.client.get(OVERVIEW).json()
        totals = body['totals']
        self.assertEqual(totals['schools'], 2)
        self.assertEqual(totals['students'], 5)  # the foreign school's 7 pupils are not counted
        self.assertEqual((totals['students_male'], totals['students_female']), (2, 3))
        self.assertEqual(totals['staff'], 3)  # admin + 2 teachers; foreign staff excluded
        self.assertEqual(totals['classes'], 2)
        # present+late / all marks: (1 + 2) / 5 = 60 %
        self.assertEqual(totals['attendance_today'], {'rate': 60.0, 'records': 5})
        self.assertEqual(sorted(r['id'] for r in body['schools']), ['MIN1', 'MIN2'])
        self.assertNotIn('FOR1', str(body))
        row = next(r for r in body['schools'] if r['id'] == 'MIN2')
        self.assertEqual(row['students'], 3)
        self.assertEqual(row['attendance_today'], {'rate': 66.7, 'records': 3})
        self.assertEqual(row['platform_billing']['state'], 'free')
        self.assertEqual(totals['platform_billing']['free'], 2)

    def test_each_proprietor_sees_only_his_own_set(self):
        self.client.force_authenticate(self.other_prop)
        body = self.client.get(OVERVIEW).json()
        self.assertEqual([r['id'] for r in body['schools']], ['FOR1'])
        self.assertEqual(body['totals']['students'], 7)

    def test_detail_for_a_linked_school(self):
        body = self.client.get('/api/v1/proprietor/schools/MIN2/').json()
        self.assertEqual(body['school']['id'], 'MIN2')
        self.assertEqual(body['students']['total'], 3)
        self.assertEqual(body['students']['by_class'], [
            {'class_id': str(self.class2.id), 'class_name': 'Form 1', 'male': 1, 'female': 2, 'other': 0, 'total': 3}])
        self.assertEqual(body['staff']['by_role'], {'TEACHER': 1})
        self.assertEqual(body['classes'], 1)
        self.assertEqual(body['attendance']['today']['rate'], 66.7)
        self.assertEqual(len(body['attendance']['trend']), 1)
        self.assertEqual(body['marks']['max_score'], 20.0)
        for key in ('fees', 'platform_billing', 'announcements', 'admins'):
            self.assertIn(key, body)

    def test_every_school_scoped_endpoint_hides_unlinked_schools(self):
        paths = [
            '/api/v1/proprietor/schools/FOR1/',
            '/api/v1/proprietor/schools/FOR1/admins/',
            '/api/v1/proprietor/schools/NOPE/',
            '/api/v1/proprietor/schools/NOPE/admins/',
        ]
        for path in paths:
            self.assertEqual(self.client.get(path).status_code, 404, path)
        # a school drafted after being linked disappears as well
        self.mine1.is_drafted = True
        self.mine1.save(update_fields=['is_drafted'])
        try:
            self.assertEqual(self.client.get('/api/v1/proprietor/schools/MIN1/').status_code, 404)
            self.assertEqual([r['id'] for r in self.client.get(OVERVIEW).json()['schools']], ['MIN2'])
        finally:
            self.mine1.is_drafted = False
            self.mine1.save(update_fields=['is_drafted'])

    def test_unlinking_removes_access_at_once(self):
        ProprietorSchoolLink.objects.filter(proprietor=self.prop, school=self.mine2).delete()
        self.assertEqual(self.client.get('/api/v1/proprietor/schools/MIN2/').status_code, 404)
        self.assertEqual(self.client.get(OVERVIEW).json()['totals']['schools'], 1)

    def test_admins_list_contains_only_that_schools_administrators(self):
        make_user('SUB1', 'SUB_ADMIN', school=self.mine1)
        make_user('CEO9', 'CEO', school=self.mine1)  # an executive pinned to a school is never listed
        twin = make_user('TWN1', 'TEACHER', school=self.mine1, is_teacher_twin=True)
        body = self.client.get('/api/v1/proprietor/schools/MIN1/admins/').json()
        self.assertEqual(sorted(a['matricule'] for a in body['admins']), ['ADM1', 'SUB1'])
        self.assertNotIn(twin.matricule, str(body))
        admin = next(a for a in body['admins'] if a['matricule'] == 'ADM1')
        self.assertEqual(admin['display_role'], 'Discipline Master')  # basic school
        for secret in ('password', 'token'):
            self.assertNotIn(secret, admin)

    def test_other_roles_are_refused(self):
        for user in (make_user('X1', 'SCHOOL_ADMIN', school=self.mine1), make_user('X2', 'CEO'),
                     make_user('X3', 'TEACHER', school=self.mine1), make_user('X4', 'PARTNER')):
            self.client.force_authenticate(user)
            for path in (OVERVIEW, '/api/v1/proprietor/schools/MIN1/', '/api/v1/proprietor/schools/MIN1/admins/'):
                self.assertEqual(self.client.get(path).status_code, 403, (user.role, path))
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(OVERVIEW).status_code, 401)

    def test_inactive_or_unchanged_temporary_password_is_refused(self):
        self.prop.must_change_password = True
        self.prop.save(update_fields=['must_change_password'])
        try:
            self.assertEqual(self.client.get(OVERVIEW).status_code, 403)
        finally:
            self.prop.must_change_password = False
            self.prop.save(update_fields=['must_change_password'])

    def test_read_only_no_write_methods_and_no_data_change(self):
        before = self._snapshot()
        for path in (OVERVIEW, '/api/v1/proprietor/schools/MIN1/', '/api/v1/proprietor/schools/MIN1/admins/'):
            self.assertEqual(self.client.get(path).status_code, 200)
            for method in ('post', 'put', 'patch', 'delete'):
                response = getattr(self.client, method)(path, {'name': 'hacked', 'is_active': False}, format='json')
                self.assertEqual(response.status_code, 405, (method, path))
        self.assertEqual(self._snapshot(), before)

    def test_proprietor_cannot_write_through_the_regular_school_apis(self):
        """He has no school of his own, so the school-scoped write APIs refuse him."""
        before = self._snapshot()
        attempts = [
            ('patch', f'/api/v1/schools/schools/{self.mine1.pk}/', {'name': 'Hacked'}),
            ('delete', f'/api/v1/schools/schools/{self.mine1.pk}/', None),
            ('post', '/api/v1/users/', {'name': 'x', 'email': 'x@gmail.com', 'role': 'TEACHER', 'school': 'MIN1'}),
            ('patch', f'/api/v1/users/{self.admin1.pk}/', {'email': 'taken-over@gmail.com'}),
            ('post', f'/api/v1/users/{self.admin1.pk}/admin-reset-password/', {'new_password': 'Abcdef!2345'}),
        ]
        for method, path, payload in attempts:
            response = getattr(self.client, method)(path, payload, format='json')
            self.assertIn(response.status_code, (400, 403, 404, 405), (method, path, response.status_code))
        self.assertEqual(self._snapshot(), before)

    def test_regular_list_endpoints_leak_nothing_to_a_proprietor(self):
        for path in ('/api/v1/users/', '/api/v1/schools/schools/', '/api/v1/students/students/',
                     '/api/v1/announcements/announcements/'):
            response = self.client.get(path)
            self.assertLess(response.status_code, 500, path)
            if response.status_code == 200:
                payload = response.json()
                results = payload.get('results', payload) if isinstance(payload, dict) else payload
                # The only record he may see is his own profile.
                others = [r for r in results if r.get('matricule') != self.prop.matricule]
                self.assertEqual(others, [], path)

    def test_overview_query_count_does_not_grow_with_the_number_of_schools(self):
        def count():
            cache.clear()
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(self.client.get(OVERVIEW).status_code, 200)
            return len(ctx)

        baseline = count()
        for i in range(6):
            school = make_school(f'EXT{i}', f'Extra School {i}', category=['basic', 'secondary', 'higher'][i % 3])
            ProprietorSchoolLink.objects.create(proprietor=self.prop, school=school)
            pupil(school, f'E{i}', 'male')
        self.assertEqual(count(), baseline)
        self.assertEqual(self.client.get(OVERVIEW).json()['totals']['schools'], 8)

    def test_attendance_week_and_trend(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        extra = [pupil(self.mine2, 'B9', 'male', self.class2)]
        register(self.mine2, self.class2, extra, ['present'], day=yesterday)
        body = self.client.get('/api/v1/proprietor/schools/MIN2/').json()
        trend = {row['date']: row for row in body['attendance']['trend']}
        self.assertEqual(trend[yesterday.isoformat()]['rate'], 100.0)
        self.assertEqual(len(trend), 2)

    def _snapshot(self):
        from django.contrib.auth import get_user_model
        from apps.schools.models import School

        User = get_user_model()
        return (
            sorted(User.objects.values_list('matricule', 'email', 'is_active', 'password')),
            sorted(School.objects.values_list('id', 'name', 'status')),
            AttendanceRecord.objects.count(), ProprietorSchoolLink.objects.count(),
            len(students_api.list_students()),
        )

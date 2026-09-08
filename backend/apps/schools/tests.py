from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from apps.grades.models import ClassSubject, Subject
from apps.students.models import ParentStudentLink, Student, StudentActivationToken, StudentGuardian
from apps.users.matricules import generate_founder_matricule, generate_school_user_matricule
from .models import School, SchoolClass, SchoolSettings, SubSchool, TimetableEntry, sync_sub_schools_for_school


User = get_user_model()


class MatriculeGenerationTests(APITestCase):
    def test_school_matricule_sanitizes_short_name_and_uses_platform_sequence(self):
        yy = timezone.now().strftime('%y')
        first_school = School.objects.create(
            id='GBHS-MAT-1',
            name='Government Bilingual High School Matricule',
            short_name='G.B.H.S.',
            principal='Principal One',
            location='Douala',
            email='gbhs-matricule@example.com',
            phone='237650100100',
            school_type='general',
            subsystem='bilingual',
        )
        second_school = School.objects.create(
            id='LYB-MAT-2',
            name='Lycee de Bafoussam Matricule',
            short_name='',
            principal='Principal Two',
            location='Bafoussam',
            email='lycee-matricule@example.com',
            phone='237650100101',
            school_type='general',
            subsystem='francophone',
        )

        self.assertEqual(first_school.matricule, f'GBHS01{yy}')
        self.assertEqual(second_school.matricule, f'LBM02{yy}')

    def test_school_user_matricules_increment_by_role_inside_school(self):
        yy = timezone.now().strftime('%y')
        school = School.objects.create(
            id='ROLE-MAT',
            name='Role Matrix Secondary School',
            short_name='RMSS',
            principal='Principal Role',
            location='Bamenda',
            email='role-matrix@example.com',
            phone='237650100102',
            school_type='general',
            subsystem='anglophone',
        )
        self.assertEqual(school.matricule, f'RMSS01{yy}')

        teacher_one = User.objects.create_user(
            matricule=generate_school_user_matricule(school, 'TEACHER'),
            name='Teacher One',
            email='teacher.one@example.com',
            role='TEACHER',
            school=school,
            password='password123',
        )
        teacher_two = User.objects.create_user(
            matricule=generate_school_user_matricule(school, 'TEACHER'),
            name='Teacher Two',
            email='teacher.two@example.com',
            role='TEACHER',
            school=school,
            password='password123',
        )
        student_matricule = generate_school_user_matricule(school, 'STUDENT')
        parent_matricule = generate_school_user_matricule(school, 'PARENT')

        self.assertEqual(teacher_one.matricule, f'{school.matricule}TE001')
        self.assertEqual(teacher_two.matricule, f'{school.matricule}TE002')
        self.assertEqual(student_matricule, f'{school.matricule}ST0001')
        self.assertEqual(parent_matricule, f'{school.matricule}PA0001')

    def test_founder_matricules_use_role_year_and_two_digit_sequence(self):
        yy = timezone.now().strftime('%y')
        first = generate_founder_matricule('CEO')
        User.objects.create_user(
            matricule=first,
            name='CEO One',
            email='ceo.one@example.com',
            role='CEO',
            password='password123',
        )
        second = generate_founder_matricule('CEO')

        self.assertEqual(first, f'EDUCEO{yy}01')
        self.assertEqual(second, f'EDUCEO{yy}02')


class SchoolHierarchyRouteTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='GBHS-TEST',
            name='Government Bilingual High School Test',
            short_name='GBHS TEST',
            principal='Principal Test',
            location='Douala',
            email='gbhs-test@example.com',
            phone='237650000000',
            school_type='mixed',
            subsystem='bilingual',
        )
        self.admin = User.objects.create_user(
            matricule='ADM-HIER-001',
            name='School Admin',
            email='admin.hierarchy@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )

    def test_hierarchy_staff_get_is_not_swallowed_by_school_scoped_staff_route(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            '/api/v1/schools/hierarchy/staff/',
            {'school_id': self.school.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        if isinstance(response.data, dict):
            self.assertNotEqual(response.data.get('detail'), 'Method "GET" not allowed.')

    def test_school_scoped_sub_schools_returns_auto_generated_sections(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(f'/api/v1/schools/{self.school.id}/sub-schools/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {item['name'] for item in response.data}
        self.assertEqual(
            names,
            {
                'Anglophone General Section',
                'Francophone General Section',
                'Anglophone Technical Section',
                'Francophone Technical Section',
            },
        )

    def test_school_admin_can_create_custom_sub_school(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            f'/api/v1/schools/{self.school.id}/sub-schools/',
            {'name': 'Evening Remedial Section'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Evening Remedial Section')
        self.assertFalse(response.data['is_system_managed'])
        self.assertTrue(
            SubSchool.objects.filter(
                school=self.school,
                name='Evening Remedial Section',
                is_system_managed=False,
            ).exists()
        )

    def test_custom_sub_school_survives_auto_sync(self):
        custom = SubSchool.objects.create(
            school=self.school,
            name='Evening Remedial Section',
            is_system_managed=False,
        )

        sync_sub_schools_for_school(self.school)

        self.assertTrue(SubSchool.objects.filter(id=custom.id).exists())
        self.assertEqual(
            set(SubSchool.objects.filter(school=self.school, is_system_managed=True).values_list('name', flat=True)),
            {
                'Anglophone General Section',
                'Francophone General Section',
                'Anglophone Technical Section',
                'Francophone Technical Section',
            },
        )


class SchoolPublicSearchTests(APITestCase):
    """
    GET /api/v1/schools/schools/search/?q=<query>

    Unauthenticated by design (the offline installer wizard uses this before a
    technician has any login credentials). Every assertion here that touches
    the response body also pins down the exact serialized key set, so this
    test fails loudly if the endpoint is ever changed to leak a sensitive
    field (email, phone, principal, subscription data, counts, etc.).
    """

    SEARCH_URL = '/api/v1/schools/schools/search/'

    def setUp(self):
        self.gbhs = School.objects.create(
            id='GBHS-D',
            name='Government Bilingual High School Douala',
            short_name='GBHS Douala',
            principal='Mr. John Nkongho',
            location='Douala',
            email='gbhs-douala@example.com',
            phone='237650100200',
            school_type='general',
            subsystem='bilingual',
            region='Littoral',
            city_village='Douala',
        )
        self.lycee = School.objects.create(
            id='LYC-BAF',
            name='Lycee Bilingue de Bafoussam',
            short_name='LBB',
            principal='Mme Ateba',
            location='Bafoussam',
            email='lycee-bafoussam@example.com',
            phone='237650100201',
            school_type='general',
            subsystem='francophone',
            region='Ouest',
            city_village='Bafoussam',
        )
        # A drafted (soft-deleted) school must never surface in public search.
        self.drafted = School.objects.create(
            id='DRAFT-SEARCH',
            name='Drafted Government School',
            short_name='DGS',
            principal='Former Principal',
            location='Douala',
            email='drafted-search@example.com',
            phone='237650100202',
            school_type='general',
            subsystem='bilingual',
            is_drafted=True,
        )
        # A suspended school must never surface in public search either.
        self.suspended = School.objects.create(
            id='SUSPENDED-SEARCH',
            name='Suspended Government School',
            short_name='SGS',
            principal='Suspended Principal',
            location='Douala',
            email='suspended-search@example.com',
            phone='237650100203',
            school_type='general',
            subsystem='bilingual',
            status='Suspended',
        )

    def test_unauthenticated_request_succeeds(self):
        """No login/credentials required at all -- the whole point."""
        response = self.client.get(self.SEARCH_URL, {'q': 'Government'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_matches_partial_name(self):
        response = self.client.get(self.SEARCH_URL, {'q': 'Bilingual High School'})

        ids = {row['id'] for row in response.data}
        self.assertEqual(ids, {'GBHS-D'})

    def test_matches_are_case_insensitive(self):
        response = self.client.get(self.SEARCH_URL, {'q': 'government bilingual'})

        ids = {row['id'] for row in response.data}
        self.assertEqual(ids, {'GBHS-D'})

    def test_matches_short_name_and_matricule_too(self):
        by_short_name = self.client.get(self.SEARCH_URL, {'q': 'lbb'})
        self.assertEqual({row['id'] for row in by_short_name.data}, {'LYC-BAF'})

        by_matricule = self.client.get(self.SEARCH_URL, {'q': self.gbhs.matricule})
        self.assertEqual({row['id'] for row in by_matricule.data}, {'GBHS-D'})

    def test_too_short_query_returns_empty_rather_than_the_full_directory(self):
        """
        A single character must not be usable to scrape every school one
        letter at a time -- the endpoint returns an empty list instead of
        rejecting the request with an error.
        """
        response = self.client.get(self.SEARCH_URL, {'q': 'a'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

        no_query_response = self.client.get(self.SEARCH_URL)
        self.assertEqual(no_query_response.status_code, status.HTTP_200_OK)
        self.assertEqual(no_query_response.data, [])

    def test_results_are_capped(self):
        for i in range(30):
            School.objects.create(
                id=f'CAP-{i:03d}',
                name=f'Capped Search Secondary School {i:03d}',
                short_name=f'CAP{i:03d}',
                principal='Principal Cap',
                location='Douala',
                email=f'cap-{i:03d}@example.com',
                phone='237650100204',
                school_type='general',
                subsystem='bilingual',
            )

        response = self.client.get(self.SEARCH_URL, {'q': 'Capped Search'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLessEqual(len(response.data), 20)

    def test_drafted_and_suspended_schools_are_excluded(self):
        response = self.client.get(self.SEARCH_URL, {'q': 'Government'})

        ids = {row['id'] for row in response.data}
        self.assertIn('GBHS-D', ids)
        self.assertNotIn('DRAFT-SEARCH', ids)
        self.assertNotIn('SUSPENDED-SEARCH', ids)

    def test_response_never_includes_sensitive_fields(self):
        """
        Pin the serialized key set down exactly. This must fail the moment
        anyone reuses/relaxes an internal serializer here instead of the
        dedicated narrow one -- no email, phone, principal name, address,
        subscription/financial data, logo, counts, or internal timestamps.
        """
        response = self.client.get(self.SEARCH_URL, {'q': 'Government'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
        for row in response.data:
            self.assertEqual(set(row.keys()), {'id', 'name', 'shortName', 'matricule', 'region_or_town'})

        row = next(r for r in response.data if r['id'] == 'GBHS-D')
        self.assertEqual(row['name'], 'Government Bilingual High School Douala')
        self.assertEqual(row['shortName'], 'GBHS Douala')
        self.assertEqual(row['matricule'], self.gbhs.matricule)
        self.assertEqual(row['region_or_town'], 'Littoral')


class DraftDeletionLifecycleTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='DRAFT-LIFE',
            name='Draft Lifecycle Secondary School',
            short_name='DLSS',
            principal='Principal Draft',
            location='Yaounde',
            email='draft-life@example.com',
            phone='237650500500',
            school_type='general',
            subsystem='anglophone',
        )
        self.admin = User.objects.create_user(
            matricule='DLSS-ADMIN',
            name='Draft Admin',
            email='draft.admin@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )
        self.teacher = User.objects.create_user(
            matricule='DLSS-TEACHER',
            name='Draft Teacher',
            email='draft.teacher@example.com',
            role='TEACHER',
            school=self.school,
            password='password123',
        )
        self.ceo = User.objects.create_user(
            matricule='EDUCEO2601',
            name='Founder CEO',
            email='founder.ceo@example.com',
            role='CEO',
            password='password123',
        )

    @patch('apps.users.views.send_draft_lifecycle_email', return_value=True)
    def test_school_admin_moves_user_to_draft_and_restores_without_losing_data(self, _email):
        self.client.force_authenticate(self.admin)

        delete_response = self.client.delete(
            f'/api/v1/users/{self.teacher.id}/',
            {
                'matricule': self.admin.matricule,
                'password': 'password123',
                'deletion_reason': 'Teacher transferred to another school.',
            },
            format='json',
        )

        self.assertEqual(delete_response.status_code, status.HTTP_200_OK)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.is_drafted)
        self.assertFalse(self.teacher.is_active)
        self.assertIsNotNone(self.teacher.draft_delete_after)

        active_response = self.client.get('/api/v1/users/', {'role': 'TEACHER', 'school_id': self.school.id})
        draft_response = self.client.get('/api/v1/users/', {'role': 'TEACHER', 'school_id': self.school.id, 'draft': 'true'})
        active_results = active_response.data.get('results', active_response.data) if isinstance(active_response.data, dict) else active_response.data
        draft_results = draft_response.data.get('results', draft_response.data) if isinstance(draft_response.data, dict) else draft_response.data
        self.assertFalse(any(str(row['id']) == str(self.teacher.id) for row in active_results))
        self.assertTrue(any(str(row['id']) == str(self.teacher.id) for row in draft_results))

        restore_response = self.client.post(f'/api/v1/users/{self.teacher.id}/restore/', {}, format='json')

        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)
        self.teacher.refresh_from_db()
        self.assertFalse(self.teacher.is_drafted)
        self.assertTrue(self.teacher.is_active)
        self.assertEqual(self.teacher.school_id, self.school.id)

    def test_user_draft_requires_reason(self):
        self.client.force_authenticate(self.admin)

        response = self.client.delete(
            f'/api/v1/users/{self.teacher.id}/',
            {
                'matricule': self.admin.matricule,
                'password': 'password123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.teacher.refresh_from_db()
        self.assertFalse(self.teacher.is_drafted)

    @patch('apps.schools.views.send_draft_lifecycle_email', return_value=True)
    def test_founder_moves_school_to_draft_and_restores_linked_users(self, email_mock):
        self.client.force_authenticate(self.ceo)

        delete_response = self.client.delete(
            f'/api/v1/schools/schools/{self.school.id}/',
            {
                'matricule': self.ceo.matricule,
                'password': 'password123',
                'deletion_reason': 'School account closed for review.',
            },
            format='json',
        )

        self.assertEqual(delete_response.status_code, status.HTTP_200_OK)
        self.school.refresh_from_db()
        self.teacher.refresh_from_db()
        self.assertTrue(self.school.is_drafted)
        self.assertTrue(self.teacher.is_drafted)
        self.assertFalse(self.teacher.is_active)

        draft_response = self.client.get('/api/v1/schools/schools/', {'draft': 'true'})
        draft_results = draft_response.data.get('results', draft_response.data) if isinstance(draft_response.data, dict) else draft_response.data
        self.assertTrue(any(row['id'] == self.school.id for row in draft_results))

        restore_response = self.client.post(f'/api/v1/schools/schools/{self.school.id}/restore/', {}, format='json')

        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)
        self.school.refresh_from_db()
        self.teacher.refresh_from_db()
        self.assertFalse(self.school.is_drafted)
        self.assertEqual(self.school.status, 'Active')
        self.assertFalse(self.teacher.is_drafted)
        self.assertTrue(self.teacher.is_active)
        restore_subjects = [
            call.kwargs.get('subject', '')
            for call in email_mock.call_args_list
            if 'restored from Draft' in call.kwargs.get('subject', '')
        ]
        self.assertIn(f'{self.school.name} restored from Draft', restore_subjects)
        self.assertGreaterEqual(
            restore_subjects.count(f'{self.school.name} account restored from Draft'),
            2,
            'All linked school users should receive a restore email when their school is restored.',
        )


class SchoolTimetableRouteTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='TMT-TEST',
            name='Timetable Test Secondary School',
            short_name='TTSS',
            principal='Principal Timetable',
            location='Buea',
            email='timetable-test@example.com',
            phone='237650400400',
            school_type='general',
            subsystem='bilingual',
        )
        self.sub_school = self.school.sub_schools.order_by('name').first()
        self.school_class = SchoolClass.objects.create(
            school=self.school,
            sub_school=self.sub_school,
            name='Form 2 A',
        )
        self.subject = Subject.objects.create(
            school=self.school,
            name='Physics',
            code='PHY-TMT',
            level='Form 2',
            coefficient='3.00',
        )
        self.teacher = User.objects.create_user(
            matricule='TCH-TMT-001',
            name='Physics Teacher',
            email='physics.teacher@example.com',
            role='TEACHER',
            school=self.school,
            password='password123',
        )
        self.class_subject = ClassSubject.objects.create(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
        )
        self.admin = User.objects.create_user(
            matricule='ADM-TMT-001',
            name='Timetable Admin',
            email='timetable.admin@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )
        self.student_user = User.objects.create_user(
            matricule='STD-TMT-001',
            name='Timetable Student',
            email='timetable.student@example.com',
            role='STUDENT',
            school=self.school,
            password='password123',
        )
        self.student = Student.objects.create(
            user=self.student_user,
            school=self.school,
            school_class=self.school_class,
            student_class=self.school_class.name,
            class_level='Form 2',
            section='General',
            admission_number='TMT-ST-001',
            gender='female',
        )
        self.parent = User.objects.create_user(
            matricule='PAR-TMT-001',
            name='Timetable Parent',
            email='timetable.parent@example.com',
            role='PARENT',
            school=self.school,
            password='password123',
        )
        ParentStudentLink.objects.create(
            parent=self.parent,
            student=self.student,
            relationship='guardian',
            is_primary=True,
        )

    def _payload(self, start='07:30', end='08:25'):
        return {
            'school_class': str(self.school_class.id),
            'class_subject': str(self.class_subject.id),
            'subject': str(self.subject.id),
            'teacher': str(self.teacher.id),
            'academic_year': '2026-2027',
            'term': 'First',
            'day_of_week': 1,
            'start_time': start,
            'end_time': end,
            'room': 'Science Lab',
        }

    def _items(self, response):
        if isinstance(response.data, dict) and 'results' in response.data:
            return response.data['results']
        return response.data

    def test_school_admin_can_publish_timetable_to_teacher_student_and_parent(self):
        self.client.force_authenticate(self.admin)

        create_response = self.client.post('/api/v1/timetable/', self._payload(), format='json')
        publish_response = self.client.post(
            '/api/v1/timetable/publish-all/',
            {'academic_year': '2026-2027', 'term': 'First'},
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.data['status'], TimetableEntry.Status.DRAFT)
        self.assertEqual(publish_response.status_code, status.HTTP_200_OK)
        self.assertEqual(publish_response.data['published_count'], 1)

        self.client.force_authenticate(self.teacher)
        teacher_response = self.client.get('/api/v1/timetable/', {'status': 'PUBLISHED'})
        self.assertEqual(teacher_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(self._items(teacher_response)), 1)

        self.client.force_authenticate(self.student_user)
        student_response = self.client.get('/api/v1/timetable/', {'status': 'PUBLISHED'})
        self.assertEqual(student_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(self._items(student_response)), 1)

        self.client.force_authenticate(self.parent)
        parent_response = self.client.get('/api/v1/timetable/', {'status': 'PUBLISHED'})
        self.assertEqual(parent_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(self._items(parent_response)), 1)

    def test_timetable_rejects_overlapping_periods_for_same_class(self):
        self.client.force_authenticate(self.admin)
        first_response = self.client.post('/api/v1/timetable/', self._payload(), format='json')
        overlap_response = self.client.post('/api/v1/timetable/', self._payload('08:00', '08:45'), format='json')

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(overlap_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already has a timetable period', str(overlap_response.data))

    def test_timetable_direct_and_nested_route_aliases_are_mounted(self):
        self.client.force_authenticate(self.admin)

        stable_response = self.client.get('/api/v1/timetable/')
        legacy_response = self.client.get('/api/v1/schools/timetable/')
        nested_response = self.client.get('/api/v1/schools/schools/timetable/')
        unversioned_response = self.client.get('/api/timetable/')
        unversioned_legacy_response = self.client.get('/api/schools/timetable/')

        self.assertEqual(stable_response.status_code, status.HTTP_200_OK)
        self.assertEqual(legacy_response.status_code, status.HTTP_200_OK)
        self.assertEqual(nested_response.status_code, status.HTTP_200_OK)
        self.assertEqual(unversioned_response.status_code, status.HTTP_200_OK)
        self.assertEqual(unversioned_legacy_response.status_code, status.HTTP_200_OK)


class SchoolScopedAccountCreationTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='ACCT-TEST',
            name='Account Creation Test Secondary School',
            short_name='ACTSS',
            principal='Principal Account',
            location='Yaounde',
            email='account-creation@example.com',
            phone='237650200200',
            school_type='mixed',
            subsystem='bilingual',
        )
        self.sub_school = self.school.sub_schools.order_by('name').first()
        self.school_class = SchoolClass.objects.create(
            school=self.school,
            sub_school=self.sub_school,
            name='Form 1 A',
        )
        self.subject = Subject.objects.create(
            school=self.school,
            name='Mathematics',
            code='MATH-ACCT',
            level='Form 1',
            coefficient='4.00',
        )
        self.class_subject = ClassSubject.objects.create(
            school_class=self.school_class,
            subject=self.subject,
        )
        self.admin = User.objects.create_user(
            matricule='ADM-ACCT-001',
            name='Account Admin',
            email='account.admin@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )
        self.parent = User.objects.create_user(
            matricule='PAR-ACCT-001',
            name='Existing Parent',
            email='existing.parent@example.com',
            phone='237650300300',
            role='PARENT',
            school=self.school,
            password='password123',
        )
        self.class_master = User.objects.create_user(
            matricule='TCH-ACCT-001',
            name='Class Master Teacher',
            email='class.master@example.com',
            role='TEACHER',
            school=self.school,
            password='password123',
        )
        self.school_class.class_master = self.class_master
        self.school_class.save(update_fields=['class_master'])

    def test_school_admin_can_create_teacher_with_hierarchy_links(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            f'/api/v1/schools/{self.school.id}/staff/',
            {
                'name': 'Teacher Account',
                'email': 'teacher.account@example.com',
                'role': 'TEACHER',
                'school_id': self.school.id,
                'sub_school': str(self.sub_school.id),
                'class_master_for': str(self.school_class.id),
                'teaching_assignments': [str(self.class_subject.id)],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        teacher = User.objects.get(id=response.data['id'])
        self.assertEqual(teacher.role, 'TEACHER')
        self.assertEqual(teacher.school, self.school)
        self.assertEqual(teacher.sub_school, self.sub_school)
        self.school_class.refresh_from_db()
        self.class_subject.refresh_from_db()
        self.assertEqual(self.school_class.class_master, teacher)
        self.assertEqual(self.class_subject.teacher, teacher)

    def test_school_admin_cannot_create_staff_without_email(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            f'/api/v1/schools/{self.school.id}/staff/',
            {
                'name': 'No Email Teacher',
                'role': 'TEACHER',
                'school_id': self.school.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_school_admin_can_create_student_and_link_existing_parent_guardian(self):
        self.client.force_authenticate(self.admin)

        create_response = self.client.post(
            f'/api/v1/schools/{self.school.id}/students/',
            {
                'name': 'Student Account',
                'email': '',
                'phone': '',
                'whatsapp': '',
                'password': '',
                'school_class': str(self.school_class.id),
                'student_class': self.school_class.name,
                'class_level': '',
                'section': '',
                'date_of_birth': '',
                'gender': 'female',
                'guardian_name': self.parent.name,
                'guardian_phone': self.parent.phone,
                'guardian_whatsapp': '',
                'admission_number': '',
                'admission_date': '',
                'parent_name': '',
                'parent_email': '',
                'parent_phone': '',
                'parent_whatsapp': '',
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        student = Student.objects.get(id=create_response.data['id'])
        self.assertEqual(student.school, self.school)
        self.assertEqual(student.school_class, self.school_class)
        self.assertTrue(create_response.data['student_matricule'])

        link_response = self.client.post(
            f'/api/v1/schools/{self.school.id}/students/{student.id}/guardians/',
            {
                'user_id': str(self.parent.id),
                'relationship': 'mother',
                'is_primary': True,
                'can_pickup': True,
                'emergency_contact': True,
            },
            format='json',
        )

        self.assertEqual(link_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            StudentGuardian.objects.filter(
                student=student,
                guardian__user=self.parent,
                relationship='mother',
            ).exists()
        )

    def test_teacher_class_master_cannot_create_student(self):
        self.client.force_authenticate(self.class_master)

        response = self.client.post(
            f'/api/v1/schools/{self.school.id}/students/',
            {
                'name': 'Blocked Student',
                'school_class': str(self.school_class.id),
                'student_class': self.school_class.name,
                'gender': 'female',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data['detail'],
            'Only school administrators and sub-admins can register students.',
        )
        self.assertFalse(Student.objects.filter(user__name='Blocked Student').exists())

    def test_teacher_class_master_cannot_bulk_register_students(self):
        self.client.force_authenticate(self.class_master)

        response = self.client.post(
            f'/api/v1/schools/{self.school.id}/students/bulk/',
            {
                'sub_school': str(self.sub_school.id),
                'school_class': str(self.school_class.id),
                'student_class': self.school_class.name,
                'generation_count': 3,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data['detail'],
            'Only school administrators and sub-admins can register students.',
        )
        self.assertFalse(StudentActivationToken.objects.filter(school=self.school).exists())

    def test_teacher_class_master_cannot_create_student_from_core_endpoint(self):
        self.client.force_authenticate(self.class_master)

        response = self.client.post(
            '/api/v1/students/students/',
            {
                'name': 'Core Blocked Student',
                'school': self.school.id,
                'school_class': str(self.school_class.id),
                'student_class': self.school_class.name,
                'gender': 'male',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data['detail'],
            'Only school administrators and sub-admins can register students.',
        )
        self.assertFalse(Student.objects.filter(user__name='Core Blocked Student').exists())

    def test_school_admin_can_update_academic_calendar_when_settings_are_missing(self):
        SchoolSettings.objects.filter(school=self.school).delete()
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f'/api/v1/schools/settings/{self.school.id}/',
            {
                'academic_year': '2026-2027',
                'term': 'Second',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        settings = SchoolSettings.objects.get(school=self.school)
        self.assertEqual(settings.academic_year, '2026-2027')
        self.assertEqual(settings.term, 'Second')

    def test_school_admin_can_save_and_reload_honour_roll_threshold(self):
        self.client.force_authenticate(self.admin)

        default_response = self.client.get(
            f'/api/v1/schools/settings/{self.school.id}/honour-roll-threshold/'
        )
        save_response = self.client.patch(
            f'/api/v1/schools/settings/{self.school.id}/honour-roll-threshold/',
            {'honour_roll_threshold': 16.5},
            format='json',
        )
        read_response = self.client.get(
            f'/api/v1/schools/settings/{self.school.id}/honour-roll-threshold/'
        )

        self.assertEqual(default_response.status_code, status.HTTP_200_OK)
        self.assertEqual(float(default_response.data['honour_roll_threshold']), 12.0)
        self.assertEqual(save_response.status_code, status.HTTP_200_OK)
        self.assertEqual(float(save_response.data['honour_roll_threshold']), 16.5)
        self.assertEqual(read_response.status_code, status.HTTP_200_OK)
        self.assertEqual(float(read_response.data['honour_roll_threshold']), 16.5)

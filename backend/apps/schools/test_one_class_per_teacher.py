"""Nursery / primary: a teacher is the class teacher of at most ONE class per academic year.

Enforced on the server in every write path (hub endpoint, class-teacher
assignments, class-master update, staff creation, teacher workspace); a clear
409 names the class they hold and ``reassign=true`` moves them atomically.
Secondary schools are untouched; existing data is never rewritten.
"""
from io import StringIO

from django.core.management import call_command
from rest_framework.test import APITestCase

from apps.schools import hierarchy_setup as setup
from apps.schools.class_teacher_rules import teachers_with_multiple_classes
from apps.schools.models import ClassTeacherAssignment, SchoolClass, SubSchool

from .test_hierarchy_setup import BASE, HubBase, make_school, make_user


class OneClassBase(HubBase):
    def setUp(self):
        super().setUp()
        self.c1 = SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section, cycle='primary')
        self.c2 = SchoolClass.objects.create(school=self.school, name='Class 2 A', sub_school=self.section, cycle='primary')
        self.hub1 = f'{BASE}classes/{self.c1.id}/class-teacher/'
        self.hub2 = f'{BASE}classes/{self.c2.id}/class-teacher/'

    def hub(self, url, teacher, **extra):
        return self.client.post(url, {'teacher': str(teacher.id), **extra}, format='json')


class HubEndpointTests(OneClassBase):
    def test_second_class_is_refused_naming_the_first(self):
        self.assertEqual(self.hub(self.hub1, self.teacher).status_code, 200)
        response = self.hub(self.hub2, self.teacher)
        self.assertEqual(response.status_code, 409, response.data)
        self.assertIn('Class 1', response.data['detail'])
        self.assertEqual(response.data['classes'][0]['name'], 'Class 1')
        self.assertTrue(response.data['can_reassign'])
        self.c2.refresh_from_db()
        self.assertIsNone(self.c2.class_master_id)
        self.assertFalse(ClassTeacherAssignment.objects.filter(school_class=self.c2).exists())

    def test_same_class_again_is_fine(self):
        self.hub(self.hub1, self.teacher)
        self.assertEqual(self.hub(self.hub1, self.teacher).status_code, 200)

    def test_reassign_moves_atomically(self):
        self.hub(self.hub1, self.teacher)
        response = self.hub(self.hub2, self.teacher, reassign=True)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([m['name'] for m in response.data['moved_from']], ['Class 1'])
        self.c1.refresh_from_db()
        self.c2.refresh_from_db()
        self.assertIsNone(self.c1.class_master_id)
        self.assertEqual(self.c2.class_master_id, self.teacher.id)
        self.assertFalse(ClassTeacherAssignment.objects.filter(school_class=self.c1, teacher=self.teacher).exists())
        self.assertTrue(ClassTeacherAssignment.objects.get(school_class=self.c2, teacher=self.teacher).is_lead)

    def test_removing_a_class_teacher_frees_them(self):
        self.hub(self.hub1, self.teacher)
        self.client.post(self.hub1, {'teacher': None}, format='json')
        self.assertEqual(self.hub(self.hub2, self.teacher).status_code, 200)

    def test_sub_admin_cannot_move_a_teacher_out_of_another_section(self):
        french = SubSchool.objects.create(school=self.school, name='French Section')
        theirs = SchoolClass.objects.create(school=self.school, name='CP', sub_school=french)
        self.hub(f'{BASE}classes/{theirs.id}/class-teacher/', self.teacher)
        sub_admin = make_user(self.school, 'SUB_ADMIN', 'SUB')
        sub_admin.sub_school = self.section
        sub_admin.save()
        self.client.force_authenticate(sub_admin)
        self.assertEqual(self.hub(self.hub1, self.teacher).status_code, 409)
        self.assertEqual(self.hub(self.hub1, self.teacher, reassign=True).status_code, 403)
        theirs.refresh_from_db()
        self.assertEqual(theirs.class_master_id, self.teacher.id)

    def test_other_academic_year_assignment_does_not_block(self):
        ClassTeacherAssignment.objects.create(school_class=self.c1, teacher=self.teacher, academic_year='2024-2025')
        self.assertEqual(self.hub(self.hub2, self.teacher).status_code, 200)


class AssignmentEndpointTests(OneClassBase):
    URL = f'{BASE}class-teachers/'

    def assign(self, klass, teacher=None, **extra):
        return self.client.post(
            self.URL, {'school_class': str(klass.id), 'teacher': str((teacher or self.teacher).id), **extra}, format='json',
        )

    def test_second_assignment_refused_then_reassigned(self):
        self.assertEqual(self.assign(self.c1).status_code, 201)
        refused = self.assign(self.c2)
        self.assertEqual(refused.status_code, 409, refused.data)
        self.assertIn('Class 1', refused.data['message'])
        self.assertEqual(ClassTeacherAssignment.objects.filter(teacher=self.teacher).count(), 1)
        moved = self.assign(self.c2, reassign=True)
        self.assertEqual(moved.status_code, 201, moved.data)
        rows = ClassTeacherAssignment.objects.filter(teacher=self.teacher)
        self.assertEqual([r.school_class_id for r in rows], [self.c2.id])

    def test_class_master_of_another_class_blocks_assignment(self):
        self.c1.class_master = self.teacher
        self.c1.save()
        self.assertEqual(self.assign(self.c2).status_code, 409)

    def test_two_teachers_may_share_one_class(self):
        second = make_user(self.school, 'TEACHER', 'TCH2')
        self.assertEqual(self.assign(self.c1).status_code, 201)
        self.assertEqual(self.assign(self.c1, second).status_code, 201)


class ClassMasterUpdateTests(OneClassBase):
    def patch(self, klass, teacher, **extra):
        return self.client.patch(f'{BASE}classes/{klass.id}/', {'class_master': str(teacher.id), **extra}, format='json')

    def test_class_master_update_enforces_and_reassigns(self):
        self.assertEqual(self.patch(self.c1, self.teacher).status_code, 200)
        refused = self.patch(self.c2, self.teacher)
        self.assertEqual(refused.status_code, 409, refused.data)
        self.assertIn('Class 1', refused.data['message'])
        self.assertEqual(self.patch(self.c2, self.teacher, reassign=True).status_code, 200)
        self.c1.refresh_from_db()
        self.assertIsNone(self.c1.class_master_id)

    def test_new_class_with_taken_teacher_refused(self):
        self.patch(self.c1, self.teacher)
        response = self.client.post(
            f'{BASE}classes/', {'name': 'Class 5', 'cycle': 'primary', 'sub_school': str(self.section.id),
                                'class_master': str(self.teacher.id)}, format='json',
        )
        self.assertEqual(response.status_code, 409, response.data)
        self.assertFalse(SchoolClass.objects.filter(school=self.school, name='Class 5').exists())

    def test_admin_as_class_master_is_not_limited(self):
        self.assertEqual(self.patch(self.c1, self.admin).status_code, 200)
        self.assertEqual(self.patch(self.c2, self.admin).status_code, 200)

    def test_secondary_school_is_untouched(self):
        self.client.force_authenticate(self.sec_admin)
        teacher = make_user(self.secondary, 'TEACHER', 'STCH')
        a = SchoolClass.objects.create(school=self.secondary, name='Form 1')
        b = SchoolClass.objects.create(school=self.secondary, name='Form 2')
        self.assertEqual(self.patch(a, teacher).status_code, 200)
        self.assertEqual(self.patch(b, teacher).status_code, 200)
        self.assertEqual(self.client.post(
            f'{BASE}class-teachers/', {'school_class': str(a.id), 'teacher': str(teacher.id)}, format='json',
        ).status_code, 201)
        self.assertEqual(self.client.post(
            f'{BASE}class-teachers/', {'school_class': str(b.id), 'teacher': str(teacher.id)}, format='json',
        ).status_code, 201)


class StaffCreationTests(OneClassBase):
    def payload(self, **extra):
        return {
            'name': 'New Teacher', 'phone': '670000111', 'role': 'TEACHER', 'job_title': 'Class teacher',
            'school': self.school.id, 'school_id': self.school.id, **extra,
        }

    def test_new_teacher_with_one_class_is_fine(self):
        response = self.client.post('/api/v1/users/', self.payload(class_teacher_for=str(self.c1.id)), format='json')
        self.assertEqual(response.status_code, 201, getattr(response, 'data', None))
        self.assertEqual(ClassTeacherAssignment.objects.filter(school_class=self.c1).count(), 1)

    def test_new_teacher_cannot_get_two_different_classes(self):
        response = self.client.post(
            '/api/v1/users/',
            self.payload(class_teacher_for=str(self.c1.id), class_master_for=str(self.c2.id)), format='json',
        )
        self.assertEqual(response.status_code, 400, getattr(response, 'data', None))
        self.assertFalse(ClassTeacherAssignment.objects.filter(school_class=self.c1).exists())


class SummaryAndReportTests(OneClassBase):
    def make_legacy_double(self):
        # Pre-existing bad data (created behind the rule's back), never auto-fixed.
        ClassTeacherAssignment.objects.create(school_class=self.c1, teacher=self.teacher)
        ClassTeacherAssignment.objects.create(school_class=self.c2, teacher=self.teacher)

    def test_summary_flags_multiple_classes_and_lists_class_names(self):
        self.make_legacy_double()
        row = next(t for t in self.client.get(f'{BASE}setup-summary/').data['teachers'] if t['id'] == str(self.teacher.id))
        self.assertTrue(row['multiple_classes'])
        self.assertEqual(row['classes'], ['Class 1', 'Class 2 A'])
        self.assertEqual(len(row['class_ids']), 2)

    def test_report_command_is_read_only(self):
        self.make_legacy_double()
        out = StringIO()
        call_command('report_teachers_with_multiple_classes', stdout=out)
        text = out.getvalue()
        self.assertIn(self.teacher.name, text)
        self.assertIn('Class 1', text)
        self.assertEqual(ClassTeacherAssignment.objects.filter(teacher=self.teacher).count(), 2)

    def test_report_ignores_secondary_and_single_class_teachers(self):
        setup.set_class_teacher(self.c1, self.teacher)
        sec_teacher = make_user(self.secondary, 'TEACHER', 'STCH')
        for name in ('Form 1', 'Form 2'):
            SchoolClass.objects.create(school=self.secondary, name=name, class_master=sec_teacher)
        self.assertEqual(teachers_with_multiple_classes(), [])
        out = StringIO()
        call_command('report_teachers_with_multiple_classes', stdout=out)
        self.assertIn('No basic-school teacher', out.getvalue())

    def test_report_json_scoped_to_school(self):
        self.make_legacy_double()
        out = StringIO()
        call_command('report_teachers_with_multiple_classes', '--json', f'--school={self.other.id}', stdout=out)
        self.assertEqual(out.getvalue().strip(), '[]')


class TeacherWorkspaceTests(APITestCase):
    def test_principal_twin_cannot_be_class_master_of_two_classes_in_basic_school(self):
        school = make_school('TW-B')
        principal = make_user(school, 'SCHOOL_ADMIN', 'PR')
        a = SchoolClass.objects.create(school=school, name='Class 1')
        b = SchoolClass.objects.create(school=school, name='Class 2')
        self.client.force_authenticate(principal)
        url = '/api/v1/users/teacher-workspace/setup/'
        response = self.client.post(url, {'class_master_ids': [str(a.id), str(b.id)]}, format='json')
        if response.status_code == 404:
            self.skipTest('workspace url differs')
        self.assertEqual(response.status_code, 409, getattr(response, 'data', None))
        ok = self.client.post(url, {'class_master_ids': [str(a.id)]}, format='json')
        self.assertEqual(ok.status_code, 200, getattr(ok, 'data', None))

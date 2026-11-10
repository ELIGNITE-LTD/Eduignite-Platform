"""Course units, curriculum, offerings, lecturers and department heads (H2/H3)."""

from datetime import date

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework.test import APITestCase

from apps.higher_ed.models import (
    AcademicPeriod,
    AcademicYear,
    CourseOffering,
    CourseUnit,
    CurriculumEntry,
    DepartmentHead,
    OrganizationalUnit,
    Programme,
    ProgrammeYear,
)
from apps.schools.models import School

User = get_user_model()
BASE = '/api/v1/higher-ed/'


def make_school(sid, category='higher'):
    return School.objects.create(
        id=sid, name=f'Institution {sid}', short_name=sid[:4], principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone', education_category=category,
    )


def make_user(matricule, role, school=None):
    return User.objects.create_user(
        matricule=matricule, name=matricule, email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='password123',
    )


def rows(response):
    data = response.data
    return data['results'] if isinstance(data, dict) and 'results' in data else data


class Fixture(APITestCase):
    def setUp(self):
        self.school = make_school('HE-C1')
        self.other = make_school('HE-C2')
        self.admin = make_user('HE-CADM1', 'SCHOOL_ADMIN', self.school)
        self.other_admin = make_user('HE-CADM2', 'SCHOOL_ADMIN', self.other)
        self.teacher = make_user('HE-CTCH1', 'TEACHER', self.school)
        self.other_teacher = make_user('HE-CTCH2', 'TEACHER', self.other)
        self.sub = make_user('HE-CSUB1', 'SUB_ADMIN', self.school)
        self.dept = OrganizationalUnit.objects.create(school=self.school, unit_type='department', name='CS')
        self.other_dept = OrganizationalUnit.objects.create(school=self.other, unit_type='department', name='CS')
        self.programme = Programme.objects.create(
            school=self.school, department=self.dept, name='BSc CS', award_level='licence', duration_years=3)
        self.year1 = ProgrammeYear.objects.create(programme=self.programme, number=1)
        self.year2 = ProgrammeYear.objects.create(programme=self.programme, number=2)
        self.ay = AcademicYear.objects.create(
            school=self.school, label='2025/2026', start_date=date(2025, 9, 1), end_date=date(2026, 7, 1))
        self.period = AcademicPeriod.objects.create(
            academic_year=self.ay, name='Semester 1', start_date=date(2025, 9, 1), end_date=date(2026, 1, 31))

    def unit(self, code='CS101', credits=6, dept=None, school=None):
        return CourseUnit.objects.create(
            school=school or self.school, department=dept or self.dept, code=code, title=f'Title {code}',
            credits=credits)

    def post(self, user, path, data):
        self.client.force_authenticate(user)
        return self.client.post(BASE + path, data, format='json')

    def get(self, user, path):
        self.client.force_authenticate(user)
        return self.client.get(BASE + path)

    def patch(self, user, path, data):
        self.client.force_authenticate(user)
        return self.client.patch(BASE + path, data, format='json')


class ModelRuleTests(Fixture):
    def test_course_unit_credits_must_be_positive(self):
        with self.assertRaises(ValidationError):
            self.unit('CS000', 0)

    def test_course_unit_code_normalised_and_unique_per_school(self):
        cu = self.unit('cs101')
        self.assertEqual(cu.code, 'CS101')
        with self.assertRaises((IntegrityError, ValidationError)), transaction.atomic():
            self.unit('CS101')
        self.unit('CS101', dept=self.other_dept, school=self.other)  # other institution may reuse the code

    def test_course_unit_department_must_be_same_institution_and_a_department(self):
        with self.assertRaises(ValidationError):
            self.unit('X1', dept=self.other_dept)
        faculty = OrganizationalUnit.objects.create(school=self.school, unit_type='faculty', name='Sci')
        with self.assertRaises(ValidationError):
            self.unit('X2', dept=faculty)

    def test_curriculum_entry_rules_and_effective_credits(self):
        cu = self.unit('CS101', 6)
        entry = CurriculumEntry.objects.create(
            school=self.school, programme=self.programme, programme_year=self.year1, course_unit=cu)
        self.assertEqual(entry.effective_credits, 6)
        entry.credits_override = 4
        entry.save()
        self.assertEqual(entry.effective_credits, 4)
        entry.credits_override = 0
        with self.assertRaises(ValidationError):
            entry.save()

    def test_curriculum_entry_cross_institution_and_cross_programme_rejected(self):
        cu = self.unit('CS101')
        foreign_unit = self.unit('CS999', dept=self.other_dept, school=self.other)
        with self.assertRaises(ValidationError):
            CurriculumEntry.objects.create(
                school=self.school, programme=self.programme, programme_year=self.year1, course_unit=foreign_unit)
        other_prog = Programme.objects.create(
            school=self.school, department=self.dept, name='Other', duration_years=2)
        other_year = ProgrammeYear.objects.create(programme=other_prog, number=1)
        with self.assertRaises(ValidationError):
            CurriculumEntry.objects.create(
                school=self.school, programme=self.programme, programme_year=other_year, course_unit=cu)

    def test_same_course_can_sit_in_two_programmes_but_not_twice_in_one_slot(self):
        cu = self.unit('CS101')
        other_prog = Programme.objects.create(
            school=self.school, department=self.dept, name='Other', duration_years=2)
        other_year = ProgrammeYear.objects.create(programme=other_prog, number=1)
        CurriculumEntry.objects.create(school=self.school, programme=self.programme,
                                       programme_year=self.year1, course_unit=cu)
        CurriculumEntry.objects.create(school=self.school, programme=other_prog,
                                       programme_year=other_year, course_unit=cu, category='elective')
        with self.assertRaises((IntegrityError, ValidationError)), transaction.atomic():
            CurriculumEntry.objects.create(school=self.school, programme=self.programme,
                                           programme_year=self.year1, course_unit=cu)

    def test_offering_rules(self):
        cu = self.unit('CS101')
        offering = CourseOffering.objects.create(course_unit=cu, academic_period=self.period, school=self.school)
        offering.lecturers.add(self.teacher)
        self.assertEqual(list(offering.lecturers.all()), [self.teacher])
        with self.assertRaises((IntegrityError, ValidationError)), transaction.atomic():
            CourseOffering.objects.create(course_unit=cu, academic_period=self.period, school=self.school)
        foreign_unit = self.unit('CS999', dept=self.other_dept, school=self.other)
        with self.assertRaises(ValidationError):
            CourseOffering.objects.create(course_unit=foreign_unit, academic_period=self.period, school=self.school)

    def test_department_head_rules(self):
        DepartmentHead.objects.create(school=self.school, unit=self.dept, user=self.teacher)
        with self.assertRaises(ValidationError):  # a department has one head
            DepartmentHead.objects.create(school=self.school, unit=self.dept, user=self.teacher)
        faculty = OrganizationalUnit.objects.create(school=self.school, unit_type='faculty', name='Sci')
        with self.assertRaises(ValidationError):
            DepartmentHead.objects.create(school=self.school, unit=faculty, user=self.teacher)
        other_dept = OrganizationalUnit.objects.create(school=self.school, unit_type='department', name='Law')
        with self.assertRaises(ValidationError):  # not a lecturer
            DepartmentHead.objects.create(school=self.school, unit=other_dept, user=self.sub)
        with self.assertRaises(ValidationError):  # lecturer of another institution
            DepartmentHead.objects.create(school=self.school, unit=other_dept, user=self.other_teacher)


class CourseUnitApiTests(Fixture):
    def test_admin_creates_and_members_read(self):
        response = self.post(self.admin, 'course-units/', {
            'code': 'cs102', 'title': 'Algorithms', 'credits': 5, 'department': str(self.dept.id)})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['code'], 'CS102')
        self.assertEqual(response.data['department_name'], 'CS')
        for user in (self.teacher, self.sub, self.admin):
            self.assertEqual(len(rows(self.get(user, 'course-units/'))), 1)

    def test_non_admin_cannot_write(self):
        payload = {'code': 'X1', 'title': 'T', 'credits': 3, 'department': str(self.dept.id)}
        for user in (self.teacher, self.sub):
            self.assertEqual(self.post(user, 'course-units/', payload).status_code, 403)
        cu = self.unit()
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.delete(f'{BASE}course-units/{cu.id}/').status_code, 403)

    def test_validation_400s(self):
        base = {'code': 'X1', 'title': 'T', 'department': str(self.dept.id)}
        self.assertEqual(self.post(self.admin, 'course-units/', {**base, 'credits': 0}).status_code, 400)
        self.assertEqual(self.post(self.admin, 'course-units/', {**base, 'credits': -2}).status_code, 400)
        self.assertEqual(self.post(self.admin, 'course-units/', base).status_code, 400)
        self.assertEqual(self.post(self.admin, 'course-units/', {**base, 'credits': 3}).status_code, 201)
        self.assertEqual(self.post(self.admin, 'course-units/', {**base, 'credits': 3}).status_code, 400)  # dup code

    def test_cross_institution_department_rejected_and_school_in_payload_ignored(self):
        response = self.post(self.admin, 'course-units/', {
            'code': 'X1', 'title': 'T', 'credits': 3, 'department': str(self.other_dept.id)})
        self.assertEqual(response.status_code, 400)
        ok = self.post(self.admin, 'course-units/', {
            'code': 'X2', 'title': 'T', 'credits': 3, 'department': str(self.dept.id), 'school': self.other.id})
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(CourseUnit.objects.get(code='X2').school_id, self.school.id)

    def test_isolation_of_list_detail_update_delete(self):
        theirs = self.unit('T1', dept=self.other_dept, school=self.other)
        mine = self.unit('M1')
        self.assertEqual([r['code'] for r in rows(self.get(self.admin, 'course-units/'))], ['M1'])
        self.assertEqual(self.get(self.admin, f'course-units/{theirs.id}/').status_code, 404)
        self.assertEqual(self.patch(self.admin, f'course-units/{theirs.id}/', {'title': 'x'}).status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f'{BASE}course-units/{theirs.id}/').status_code, 404)
        self.assertEqual(self.get(self.admin, f'course-units/{mine.id}/').status_code, 200)

    def test_unit_in_use_cannot_be_deleted(self):
        cu = self.unit()
        CurriculumEntry.objects.create(school=self.school, programme=self.programme,
                                       programme_year=self.year1, course_unit=cu)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f'{BASE}course-units/{cu.id}/').status_code, 400)


class CurriculumApiTests(Fixture):
    def entry(self, cu, **extra):
        data = {'programme': str(self.programme.id), 'programme_year': self.year1.id, 'period_number': 1,
                'course_unit': str(cu.id), **extra}
        return self.post(self.admin, 'curriculum/', data)

    def test_create_and_credit_override(self):
        cu = self.unit('CS101', 6)
        response = self.entry(cu, category='elective', credits_override=4)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['credits'], 4)
        self.assertEqual(response.data['category'], 'elective')
        self.assertEqual(response.data['course_code'], 'CS101')

    def test_invalid_override_and_period_rejected(self):
        cu = self.unit()
        self.assertEqual(self.entry(cu, credits_override=0).status_code, 400)
        self.assertEqual(self.entry(cu, period_number=9).status_code, 400)

    def test_cross_institution_references_rejected(self):
        foreign_unit = self.unit('F1', dept=self.other_dept, school=self.other)
        self.assertEqual(self.entry(foreign_unit).status_code, 400)
        theirs_prog = Programme.objects.create(
            school=self.other, department=self.other_dept, name='X', duration_years=2)
        theirs_year = ProgrammeYear.objects.create(programme=theirs_prog, number=1)
        cu = self.unit()
        response = self.post(self.admin, 'curriculum/', {
            'programme': str(theirs_prog.id), 'programme_year': theirs_year.id, 'course_unit': str(cu.id)})
        self.assertEqual(response.status_code, 400)
        mismatch = self.post(self.admin, 'curriculum/', {
            'programme': str(self.programme.id), 'programme_year': theirs_year.id, 'course_unit': str(cu.id)})
        self.assertEqual(mismatch.status_code, 400)

    def test_duplicate_slot_is_400(self):
        cu = self.unit()
        self.assertEqual(self.entry(cu).status_code, 201)
        self.assertEqual(self.entry(cu).status_code, 400)

    def test_writes_admin_only_reads_members_and_isolated(self):
        cu = self.unit()
        data = {'programme': str(self.programme.id), 'programme_year': self.year1.id, 'course_unit': str(cu.id)}
        for user in (self.teacher, self.sub):
            self.assertEqual(self.post(user, 'curriculum/', data).status_code, 403)
        self.entry(cu)
        self.assertEqual(len(rows(self.get(self.teacher, 'curriculum/'))), 1)
        self.assertEqual(rows(self.get(self.other_admin, 'curriculum/')), [])
        self.assertEqual(len(rows(self.get(self.admin, f'curriculum/?programme={self.programme.id}'))), 1)

    def test_semester_total_is_a_warning_not_a_block(self):
        a, b = self.unit('A1', 20), self.unit('A2', 15)
        first = self.entry(a)
        self.assertEqual(first.status_code, 201)
        self.assertIn('30', first.data['credit_warning'])  # 20 != 30 for a licence, yet it was saved
        second = self.entry(b)  # now 35, over target: still accepted
        self.assertEqual(second.status_code, 201)
        summary = self.get(self.admin, f'curriculum/summary/?programme={self.programme.id}').data
        self.assertEqual(len(summary['periods']), 1)
        period = summary['periods'][0]
        self.assertEqual((period['total_credits'], period['target_credits']), (35, 30))
        self.assertIsNotNone(period['warning'])
        listed = rows(self.get(self.admin, 'curriculum/'))
        self.assertTrue(all(row['credit_warning'] for row in listed))

    def test_exact_30_has_no_warning_and_non_lmd_has_no_target(self):
        self.entry(self.unit('A1', 18))
        ok = self.entry(self.unit('A2', 12))
        self.assertIsNone(ok.data['credit_warning'])
        hnd = Programme.objects.create(
            school=self.school, department=self.dept, name='HND CS', award_level='hnd', duration_years=2)
        year = ProgrammeYear.objects.create(programme=hnd, number=1)
        self.post(self.admin, 'curriculum/', {
            'programme': str(hnd.id), 'programme_year': year.id, 'course_unit': str(self.unit('H1', 7).id)})
        summary = self.get(self.admin, f'curriculum/summary/?programme={hnd.id}').data['periods'][0]
        self.assertIsNone(summary['target_credits'])
        self.assertIsNone(summary['warning'])

    def test_summary_requires_own_programme(self):
        other_prog = Programme.objects.create(
            school=self.other, department=self.other_dept, name='X', duration_years=2)
        self.assertEqual(self.get(self.admin, f'curriculum/summary/?programme={other_prog.id}').status_code, 400)
        self.assertEqual(self.get(self.admin, 'curriculum/summary/').status_code, 400)
        self.assertEqual(self.get(self.admin, 'curriculum/summary/?programme=nope').status_code, 400)


class OfferingApiTests(Fixture):
    def test_create_and_assign_lecturers(self):
        cu = self.unit()
        response = self.post(self.admin, 'offerings/', {
            'course_unit': str(cu.id), 'academic_period': str(self.period.id)})
        self.assertEqual(response.status_code, 201, response.data)
        oid = response.data['id']
        assigned = self.patch(self.admin, f'offerings/{oid}/', {'lecturers': [str(self.teacher.id)]})
        self.assertEqual(assigned.status_code, 200, assigned.data)
        self.assertEqual(assigned.data['lecturer_names'], [self.teacher.name])
        cleared = self.patch(self.admin, f'offerings/{oid}/', {'lecturers': []})
        self.assertEqual(cleared.data['lecturers'], [])

    def test_only_same_institution_lecturers_can_be_assigned(self):
        cu = self.unit()
        oid = self.post(self.admin, 'offerings/', {
            'course_unit': str(cu.id), 'academic_period': str(self.period.id)}).data['id']
        for bad in (self.other_teacher, self.sub, self.admin):
            response = self.patch(self.admin, f'offerings/{oid}/', {'lecturers': [str(bad.id)]})
            self.assertEqual(response.status_code, 400, bad.role)
        self.assertEqual(CourseOffering.objects.get(id=oid).lecturers.count(), 0)

    def test_only_admin_assigns_and_everyone_reads(self):
        cu = self.unit()
        oid = self.post(self.admin, 'offerings/', {
            'course_unit': str(cu.id), 'academic_period': str(self.period.id)}).data['id']
        for user in (self.teacher, self.sub):
            self.assertEqual(self.patch(user, f'offerings/{oid}/', {'lecturers': [str(self.teacher.id)]}).status_code,
                             403)
            self.assertEqual(self.post(user, 'offerings/', {
                'course_unit': str(cu.id), 'academic_period': str(self.period.id)}).status_code, 403)
        self.assertEqual(len(rows(self.get(self.teacher, 'offerings/'))), 1)

    def test_cross_institution_and_duplicate_rejected_and_isolated(self):
        cu = self.unit()
        foreign_unit = self.unit('F1', dept=self.other_dept, school=self.other)
        foreign_year = AcademicYear.objects.create(
            school=self.other, label='2025/2026', start_date=date(2025, 9, 1), end_date=date(2026, 7, 1))
        foreign_period = AcademicPeriod.objects.create(
            academic_year=foreign_year, name='S1', start_date=date(2025, 9, 1), end_date=date(2026, 1, 31))
        self.assertEqual(self.post(self.admin, 'offerings/', {
            'course_unit': str(foreign_unit.id), 'academic_period': str(self.period.id)}).status_code, 400)
        self.assertEqual(self.post(self.admin, 'offerings/', {
            'course_unit': str(cu.id), 'academic_period': str(foreign_period.id)}).status_code, 400)
        self.assertEqual(self.post(self.admin, 'offerings/', {
            'course_unit': str(cu.id), 'academic_period': str(self.period.id)}).status_code, 201)
        self.assertEqual(self.post(self.admin, 'offerings/', {
            'course_unit': str(cu.id), 'academic_period': str(self.period.id)}).status_code, 400)
        self.assertEqual(rows(self.get(self.other_admin, 'offerings/')), [])
        self.assertEqual(len(rows(self.get(self.admin, f'offerings/?academic_period={self.period.id}'))), 1)


class LecturerApiTests(Fixture):
    payload = {'name': 'Dr Ngwa', 'email': 'ngwa@example.org', 'job_title': 'Senior Lecturer'}

    def test_admin_creates_lecturer_through_the_staff_path(self):
        response = self.post(self.admin, 'lecturers/', self.payload)
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(id=response.data['id'])
        self.assertEqual((user.role, user.school_id), ('TEACHER', self.school.id))
        self.assertTrue(user.matricule)
        self.assertEqual(response.data['matricule'], user.matricule)

    def test_role_and_school_in_payload_are_ignored(self):
        response = self.post(self.admin, 'lecturers/', {
            **self.payload, 'role': 'SCHOOL_ADMIN', 'school': self.other.id, 'school_id': self.other.id})
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(id=response.data['id'])
        self.assertEqual((user.role, user.school_id), ('TEACHER', self.school.id))

    def test_only_admin_creates_and_bad_input_is_400(self):
        for user in (self.teacher, self.sub):
            self.assertEqual(self.post(user, 'lecturers/', self.payload).status_code, 403)
        self.assertEqual(self.post(self.admin, 'lecturers/', {'email': 'x@example.org'}).status_code, 400)

    def test_list_is_scoped_to_lecturers_of_the_institution(self):
        self.post(self.admin, 'lecturers/', self.payload)
        listed = rows(self.get(self.admin, 'lecturers/'))
        self.assertEqual({row['name'] for row in listed}, {'HE-CTCH1', 'Dr Ngwa'})
        self.assertNotIn(self.other_teacher.id, {row['id'] for row in listed})
        self.assertNotIn(self.sub.id, {row['id'] for row in listed})
        self.assertEqual(self.get(self.admin, f'lecturers/{self.other_teacher.id}/').status_code, 404)
        self.assertEqual(self.get(self.admin, f'lecturers/{self.teacher.id}/').status_code, 200)

    def test_contact_details_only_for_admin(self):
        as_admin = rows(self.get(self.admin, 'lecturers/'))[0]
        as_teacher = rows(self.get(self.teacher, 'lecturers/'))[0]
        self.assertIn('email', as_admin)
        self.assertNotIn('email', as_teacher)
        self.assertNotIn('phone', as_teacher)

    def test_no_new_role_values_and_non_higher_gets_403(self):
        for category in ('basic', 'secondary'):
            school = make_school(f'HE-L{category[:3].upper()}', category)
            admin = make_user(f'HE-L{category[:3].upper()}A', 'SCHOOL_ADMIN', school)
            for path in ('lecturers/', 'course-units/', 'curriculum/', 'offerings/', 'department-heads/',
                         'curriculum/summary/'):
                self.assertEqual(self.get(admin, path).status_code, 403, (category, path))
            self.assertEqual(self.post(admin, 'lecturers/', self.payload).status_code, 403)
            self.assertEqual(self.post(admin, 'course-units/', {}).status_code, 403)
        self.assertEqual(
            sorted(role for role, _ in User._meta.get_field('role').choices if role == 'LECTURER'), [])


class DepartmentHeadApiTests(Fixture):
    def test_designate_read_and_replace(self):
        response = self.post(self.admin, 'department-heads/', {
            'unit': str(self.dept.id), 'user': str(self.teacher.id)})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['unit_name'], 'CS')
        self.assertEqual(len(rows(self.get(self.teacher, 'department-heads/'))), 1)
        listed = rows(self.get(self.admin, 'lecturers/'))
        head = next(row for row in listed if row['id'] == str(self.teacher.id))
        self.assertEqual(head['headed_units'], [str(self.dept.id)])
        # one head per department
        second = make_user('HE-CTCH3', 'TEACHER', self.school)
        self.assertEqual(self.post(self.admin, 'department-heads/', {
            'unit': str(self.dept.id), 'user': str(second.id)}).status_code, 400)

    def test_rules_and_permissions(self):
        payload = {'unit': str(self.dept.id), 'user': str(self.teacher.id)}
        self.assertEqual(self.post(self.teacher, 'department-heads/', payload).status_code, 403)
        for bad_user in (self.other_teacher, self.sub):
            self.assertEqual(self.post(self.admin, 'department-heads/', {
                'unit': str(self.dept.id), 'user': str(bad_user.id)}).status_code, 400)
        self.assertEqual(self.post(self.admin, 'department-heads/', {
            'unit': str(self.other_dept.id), 'user': str(self.teacher.id)}).status_code, 400)
        faculty = OrganizationalUnit.objects.create(school=self.school, unit_type='faculty', name='Sci')
        self.assertEqual(self.post(self.admin, 'department-heads/', {
            'unit': str(faculty.id), 'user': str(self.teacher.id)}).status_code, 400)

    def test_head_gets_no_write_privilege(self):
        self.post(self.admin, 'department-heads/', {'unit': str(self.dept.id), 'user': str(self.teacher.id)})
        cu = self.unit()
        self.assertEqual(self.post(self.teacher, 'offerings/', {
            'course_unit': str(cu.id), 'academic_period': str(self.period.id)}).status_code, 403)
        self.assertEqual(self.post(self.teacher, 'course-units/', {
            'code': 'Z', 'title': 'Z', 'credits': 1, 'department': str(self.dept.id)}).status_code, 403)

    def test_isolation(self):
        DepartmentHead.objects.create(school=self.other, unit=self.other_dept, user=self.other_teacher)
        self.assertEqual(rows(self.get(self.admin, 'department-heads/')), [])


class SetupStatusH3Tests(Fixture):
    def steps(self, user):
        data = self.get(user, 'setup-status/').data
        self.assertEqual(set(data), {'steps', 'complete'})
        for step in data['steps']:
            self.assertEqual(set(step), {'key', 'done', 'count'})
        return {step['key']: step for step in data['steps']}

    def test_course_units_and_lecturers_steps_count(self):
        steps = self.steps(self.admin)
        self.assertEqual([s for s in steps], ['departments', 'programmes', 'course_units', 'lecturers',
                                              'students', 'grading'])
        self.assertEqual((steps['course_units']['done'], steps['course_units']['count']), (False, 0))
        self.assertEqual((steps['lecturers']['done'], steps['lecturers']['count']), (True, 1))
        self.unit('CS101')
        self.unit('CS102')
        self.post(self.admin, 'lecturers/', {'name': 'Dr Two', 'email': 'two@example.org'})
        steps = self.steps(self.admin)
        self.assertEqual((steps['course_units']['done'], steps['course_units']['count']), (True, 2))
        self.assertEqual(steps['lecturers']['count'], 2)

    def test_counts_are_per_institution_and_exclude_inactive(self):
        self.unit('CS101', school=self.school)
        self.unit('CS101', dept=self.other_dept, school=self.other)
        make_user('HE-CTCH9', 'TEACHER', self.other)
        self.assertEqual(self.steps(self.admin)['course_units']['count'], 1)
        self.assertEqual(self.steps(self.admin)['lecturers']['count'], 1)
        CourseUnit.objects.filter(school=self.school).update(is_active=False)
        self.assertEqual(self.steps(self.admin)['course_units']['count'], 0)
        User.objects.filter(school=self.school, role='TEACHER').update(is_active=False)
        self.assertFalse(self.steps(self.admin)['lecturers']['done'])

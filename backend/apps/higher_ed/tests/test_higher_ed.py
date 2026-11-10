"""Higher Education foundation: models, grading presets, permissions, isolation, gating, setup status."""

from datetime import date

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from apps.higher_ed import grading_presets as gp
from apps.higher_ed.models import (
    AcademicPeriod,
    AcademicYear,
    GradingPolicy,
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


class GradingPresetTests(SimpleTestCase):
    def test_both_presets_exist_and_validate(self):
        self.assertEqual(set(gp.preset_keys()), {'gpa_4', 'scale_20'})
        for key in gp.preset_keys():
            self.assertEqual(gp.validate_thresholds(key, gp.get_preset(key)), [])

    def test_gpa_4_letters_points_and_pass(self):
        t = gp.get_preset('gpa_4')
        self.assertEqual(gp.grade_for_score('gpa_4', t, 85), {'letter': 'A', 'points': 4.0, 'passed': True})
        self.assertEqual(gp.grade_for_score('gpa_4', t, 75)['letter'], 'B+')
        self.assertEqual(gp.grade_for_score('gpa_4', t, 50)['points'], 1.0)
        failed = gp.grade_for_score('gpa_4', t, 49)
        self.assertEqual((failed['letter'], failed['points'], failed['passed']), ('F', 0.0, False))

    def test_gpa_4_degree_classes(self):
        t = gp.get_preset('gpa_4')
        self.assertEqual(gp.degree_class(t, 3.6), 'First Class')
        self.assertEqual(gp.degree_class(t, 3.0), 'Second Class Upper')
        self.assertEqual(gp.degree_class(t, 2.0), 'Third Class')
        self.assertIsNone(gp.degree_class(t, 0.5))

    def test_scale_20_pass_mark_and_mentions(self):
        t = gp.get_preset('scale_20')
        self.assertEqual(t['pass_mark'], 10)
        self.assertEqual(gp.grade_for_score('scale_20', t, 10), {'mention': 'Passable', 'passed': True})
        self.assertEqual(gp.grade_for_score('scale_20', t, 15.5)['mention'], 'Bien')
        self.assertEqual(gp.grade_for_score('scale_20', t, 18)['mention'], 'Excellent')
        self.assertFalse(gp.grade_for_score('scale_20', t, 9.99)['passed'])

    def test_scale_20_resit_capping(self):
        t = gp.get_preset('scale_20')
        self.assertEqual(gp.resit_score(t, 16), 10)
        self.assertEqual(gp.resit_score(t, 7), 7)

    def test_out_of_scale_score_rejected(self):
        with self.assertRaises(ValueError):
            gp.grade_for_score('scale_20', gp.get_preset('scale_20'), 21)

    def test_presets_are_copied_not_shared(self):
        a = gp.get_preset('scale_20')
        a['pass_mark'] = 8
        self.assertEqual(gp.get_preset('scale_20')['pass_mark'], 10)

    def test_validation_catches_bad_thresholds(self):
        t = gp.get_preset('gpa_4')
        t['pass_mark'] = 500
        self.assertTrue(gp.validate_thresholds('gpa_4', t))
        t = gp.get_preset('scale_20')
        t['mentions'][-1]['min'] = 3  # lowest must start at 0
        self.assertTrue(gp.validate_thresholds('scale_20', t))
        self.assertTrue(gp.validate_thresholds('nope', {}))


class ModelTests(APITestCase):
    def setUp(self):
        self.school = make_school('HE-M1')
        self.other = make_school('HE-M2')

    def unit(self, kind, name, parent=None, school=None):
        return OrganizationalUnit.objects.create(
            school=school or self.school, unit_type=kind, name=name, parent=parent)

    def test_department_without_faculty_is_allowed(self):
        dept = self.unit('department', 'Computer Science')
        self.assertIsNone(dept.parent)

    def test_faculty_department_tree_and_loop_rules(self):
        faculty = self.unit('faculty', 'Science')
        dept = self.unit('department', 'Maths', parent=faculty)
        self.assertEqual(list(faculty.children.all()), [dept])
        with self.assertRaises(ValidationError):  # a department cannot contain units
            self.unit('institute', 'Bad', parent=dept)
        faculty.parent = dept
        with self.assertRaises(ValidationError):
            faculty.save()

    def test_parent_must_be_same_institution(self):
        foreign = self.unit('faculty', 'Foreign', school=self.other)
        with self.assertRaises(ValidationError):
            self.unit('department', 'X', parent=foreign)

    def test_duplicate_unit_name_rejected_per_school_and_type(self):
        self.unit('department', 'Law')
        with self.assertRaises((IntegrityError, ValidationError)), transaction.atomic():
            self.unit('department', 'Law')
        self.unit('department', 'Law', school=self.other)  # other institution is fine

    def test_programme_rules_and_no_years_auto_via_orm(self):
        dept = self.unit('department', 'Law')
        prog = Programme.objects.create(
            school=self.school, department=dept, name='Private Law', award_level='licence',
            duration_years=3, required_credits=180)
        self.assertEqual(prog.get_award_level_display(), 'Licence / Bachelor')
        with self.assertRaises(ValidationError):
            Programme.objects.create(school=self.school, department=dept, name='Zero', duration_years=0)
        faculty = self.unit('faculty', 'Fac')
        with self.assertRaises(ValidationError):  # must be a department
            Programme.objects.create(school=self.school, department=faculty, name='NoDept')
        foreign = self.unit('department', 'Foreign', school=self.other)
        with self.assertRaises(ValidationError):
            Programme.objects.create(school=self.school, department=foreign, name='Cross')

    def test_programme_year_default_label_and_unique(self):
        dept = self.unit('department', 'Law')
        prog = Programme.objects.create(school=self.school, department=dept, name='P', duration_years=2)
        year = ProgrammeYear.objects.create(programme=prog, number=1)
        self.assertEqual(year.label, 'Year One')
        with self.assertRaises(IntegrityError), transaction.atomic():
            ProgrammeYear.objects.create(programme=prog, number=1)

    def test_academic_year_validation_and_single_current(self):
        a = AcademicYear.objects.create(school=self.school, label='2024/2025', start_date=date(2024, 9, 1),
                                        end_date=date(2025, 7, 1), is_current=True)
        b = AcademicYear.objects.create(school=self.school, label='2025/2026', start_date=date(2025, 9, 1),
                                        end_date=date(2026, 7, 1), is_current=True)
        a.refresh_from_db()
        self.assertFalse(a.is_current)
        self.assertTrue(b.is_current)
        with self.assertRaises(ValidationError):
            AcademicYear.objects.create(school=self.school, label='bad', start_date=date(2026, 1, 2),
                                        end_date=date(2026, 1, 1))

    def test_period_inherits_school_and_is_checked(self):
        year = AcademicYear.objects.create(school=self.school, label='2025/2026', start_date=date(2025, 9, 1),
                                           end_date=date(2026, 7, 1))
        period = AcademicPeriod.objects.create(
            academic_year=year, name='Semester 1', period_type='semester', order=1,
            start_date=date(2025, 9, 1), end_date=date(2026, 1, 31))
        self.assertEqual(period.school_id, self.school.id)
        with self.assertRaises(ValidationError):
            AcademicPeriod.objects.create(academic_year=year, name='Back', start_date=date(2026, 2, 2),
                                          end_date=date(2026, 2, 1))

    def test_grading_policy_defaults_from_preset_and_validates(self):
        policy = GradingPolicy.objects.create(school=self.school, preset_key='scale_20')
        self.assertEqual(policy.thresholds['pass_mark'], 10)
        policy.thresholds['pass_mark'] = 99
        with self.assertRaises(ValidationError):
            policy.save()


class ApiBase(APITestCase):
    def setUp(self):
        self.school = make_school('HE-A1')
        self.other = make_school('HE-A2')
        self.admin = make_user('HE-ADM1', 'SCHOOL_ADMIN', self.school)
        self.other_admin = make_user('HE-ADM2', 'SCHOOL_ADMIN', self.other)
        self.teacher = make_user('HE-TCH1', 'TEACHER', self.school)
        self.sub = make_user('HE-SUB1', 'SUB_ADMIN', self.school)

    def post(self, user, path, data):
        self.client.force_authenticate(user)
        return self.client.post(BASE + path, data, format='json')

    def get(self, user, path):
        self.client.force_authenticate(user)
        return self.client.get(BASE + path)

    def dept(self, user=None, name='Computer Science'):
        response = self.post(user or self.admin, 'units/', {'unit_type': 'department', 'name': name})
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']


class CategoryGatingTests(ApiBase):
    def test_non_higher_schools_get_403_everywhere(self):
        for category in ('basic', 'secondary'):
            school = make_school(f'HE-{category[:3].upper()}', category)
            admin = make_user(f'HE-{category[:3].upper()}-A', 'SCHOOL_ADMIN', school)
            for path in ('units/', 'programmes/', 'programme-years/', 'academic-years/', 'academic-periods/',
                         'grading-policy/', 'grading-presets/', 'setup-status/'):
                self.assertEqual(self.get(admin, path).status_code, 403, (category, path))
            self.assertEqual(self.post(admin, 'units/', {'unit_type': 'department', 'name': 'X'}).status_code, 403)

    def test_anonymous_and_userless_school_are_refused(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(BASE + 'units/').status_code, (401, 403))
        loner = make_user('HE-LONE', 'SCHOOL_ADMIN', None)
        self.assertEqual(self.get(loner, 'units/').status_code, 403)


class PermissionTests(ApiBase):
    def test_only_institution_administrator_writes(self):
        for user in (self.teacher, self.sub):
            response = self.post(user, 'units/', {'unit_type': 'department', 'name': 'Nope'})
            self.assertEqual(response.status_code, 403, user.role)
        self.assertEqual(self.post(self.admin, 'units/', {'unit_type': 'department', 'name': 'Yes'}).status_code, 201)

    def test_members_can_read(self):
        self.dept()
        for user in (self.teacher, self.sub, self.admin):
            self.assertEqual(len(self.get(user, 'units/').data['results'] if 'results' in self.get(user, 'units/').data
                                 else self.get(user, 'units/').data), 1)

    def test_teacher_cannot_change_grading_or_delete(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.put(BASE + 'grading-policy/', {'preset_key': 'gpa_4'}, format='json').status_code, 403)
        unit = self.dept()
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.delete(f'{BASE}units/{unit}/').status_code, 403)


def rows(response):
    data = response.data
    return data['results'] if isinstance(data, dict) and 'results' in data else data


class IsolationTests(ApiBase):
    def test_lists_and_detail_are_scoped(self):
        mine = self.dept(self.admin, 'Mine')
        theirs = self.dept(self.other_admin, 'Theirs')
        names = [r['name'] for r in rows(self.get(self.admin, 'units/'))]
        self.assertEqual(names, ['Mine'])
        self.assertEqual(self.get(self.admin, f'units/{theirs}/').status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(f'{BASE}units/{theirs}/', {'name': 'Hacked'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'{BASE}units/{theirs}/').status_code, 404)
        self.assertEqual(self.get(self.admin, f'units/{mine}/').status_code, 200)

    def test_cannot_reference_other_institutions_records(self):
        theirs = self.dept(self.other_admin, 'Theirs')
        response = self.post(self.admin, 'programmes/', {
            'name': 'Cross', 'department': theirs, 'award_level': 'licence', 'duration_years': 3})
        self.assertEqual(response.status_code, 400)
        year = self.post(self.other_admin, 'academic-years/', {
            'label': '2025/2026', 'start_date': '2025-09-01', 'end_date': '2026-07-01'}).data['id']
        response = self.post(self.admin, 'academic-periods/', {
            'academic_year': year, 'name': 'S1', 'start_date': '2025-09-01', 'end_date': '2026-01-31'})
        self.assertEqual(response.status_code, 400)
        prog = self.post(self.other_admin, 'programmes/', {
            'name': 'P', 'department': theirs, 'duration_years': 2}).data
        self.assertEqual(self.get(self.admin, f'programmes/{prog["id"]}/').status_code, 404)
        year_id = prog['years'][0]['id']
        self.assertEqual(self.get(self.admin, f'programme-years/{year_id}/').status_code, 404)
        self.assertEqual(rows(self.get(self.admin, 'programme-years/')), [])

    def test_school_in_payload_is_ignored(self):
        response = self.post(self.admin, 'units/', {'unit_type': 'department', 'name': 'D', 'school': self.other.id})
        self.assertEqual(response.status_code, 201)
        self.assertTrue(OrganizationalUnit.objects.filter(school=self.school, name='D').exists())
        self.assertFalse(OrganizationalUnit.objects.filter(school=self.other).exists())

    def test_grading_policy_is_per_institution(self):
        self.client.force_authenticate(self.admin)
        self.client.put(BASE + 'grading-policy/', {'preset_key': 'gpa_4'}, format='json')
        self.assertIsNone(self.get(self.other_admin, 'grading-policy/').data)


class CrudTests(ApiBase):
    def test_programme_creates_labelled_years_and_follows_duration(self):
        dept = self.dept()
        response = self.post(self.admin, 'programmes/', {
            'name': 'BSc Computer Science', 'department': dept, 'award_level': 'licence',
            'duration_years': 3, 'required_credits': 180})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual([y['label'] for y in response.data['years']], ['Year One', 'Year Two', 'Year Three'])
        self.client.force_authenticate(self.admin)
        patched = self.client.patch(f'{BASE}programmes/{response.data["id"]}/', {'duration_years': 4}, format='json')
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(len(patched.data['years']), 4)

    def test_programme_year_can_be_relabelled(self):
        dept = self.dept()
        prog = self.post(self.admin, 'programmes/', {'name': 'P', 'department': dept, 'duration_years': 2}).data
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f'{BASE}programme-years/{prog["years"][0]["id"]}/', {'label': 'Level 100'},
                                     format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['label'], 'Level 100')

    def test_validation_errors_are_400(self):
        dept = self.dept()
        self.assertEqual(self.post(self.admin, 'programmes/', {
            'name': 'P', 'department': dept, 'duration_years': 0}).status_code, 400)
        self.assertEqual(self.post(self.admin, 'units/', {'unit_type': 'department', 'name': 'Computer Science'})
                         .status_code, 400)  # duplicate
        self.assertEqual(self.post(self.admin, 'academic-years/', {
            'label': 'x', 'start_date': '2026-01-02', 'end_date': '2026-01-01'}).status_code, 400)

    def test_department_with_programme_cannot_be_deleted(self):
        dept = self.dept()
        self.post(self.admin, 'programmes/', {'name': 'P', 'department': dept, 'duration_years': 2})
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f'{BASE}units/{dept}/').status_code, 400)

    def test_calendar_and_unit_type_filter(self):
        faculty = self.post(self.admin, 'units/', {'unit_type': 'faculty', 'name': 'Science'}).data['id']
        self.post(self.admin, 'units/', {'unit_type': 'department', 'name': 'Maths', 'parent': faculty})
        only = rows(self.get(self.admin, 'units/?unit_type=faculty'))
        self.assertEqual([u['name'] for u in only], ['Science'])
        year = self.post(self.admin, 'academic-years/', {
            'label': '2025/2026', 'start_date': '2025-09-01', 'end_date': '2026-07-01', 'is_current': True})
        self.assertEqual(year.status_code, 201)
        period = self.post(self.admin, 'academic-periods/', {
            'academic_year': year.data['id'], 'name': 'Semester 1', 'period_type': 'semester', 'order': 1,
            'start_date': '2025-09-01', 'end_date': '2026-01-31'})
        self.assertEqual(period.status_code, 201, period.data)
        listed = rows(self.get(self.admin, f'academic-periods/?academic_year={year.data["id"]}'))
        self.assertEqual(len(listed), 1)


class GradingEndpointTests(ApiBase):
    def test_presets_listed(self):
        keys = [p['key'] for p in self.get(self.admin, 'grading-presets/').data]
        self.assertEqual(keys, ['gpa_4', 'scale_20'])

    def test_pick_preset_then_edit_thresholds(self):
        self.client.force_authenticate(self.admin)
        self.assertIsNone(self.client.get(BASE + 'grading-policy/').data)
        picked = self.client.put(BASE + 'grading-policy/', {'preset_key': 'scale_20'}, format='json')
        self.assertEqual(picked.status_code, 200, picked.data)
        self.assertEqual(picked.data['thresholds']['pass_mark'], 10)
        edited = gp.get_preset('scale_20')
        edited['pass_mark'] = 9
        response = self.client.put(BASE + 'grading-policy/', {'preset_key': 'scale_20', 'thresholds': edited},
                                   format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(GradingPolicy.objects.get(school=self.school).thresholds['pass_mark'], 9)
        self.assertEqual(GradingPolicy.objects.filter(school=self.school).count(), 1)
        switched = self.client.put(BASE + 'grading-policy/', {'preset_key': 'gpa_4'}, format='json')
        self.assertEqual(switched.data['preset_key'], 'gpa_4')
        self.assertEqual(switched.data['thresholds']['kind'], 'gpa')

    def test_bad_thresholds_and_unknown_preset_rejected(self):
        self.client.force_authenticate(self.admin)
        bad = gp.get_preset('scale_20')
        bad['pass_mark'] = 50
        self.assertEqual(self.client.put(BASE + 'grading-policy/', {'preset_key': 'scale_20', 'thresholds': bad},
                                         format='json').status_code, 400)
        self.assertEqual(self.client.put(BASE + 'grading-policy/', {'preset_key': 'mystery'}, format='json')
                         .status_code, 400)


class SetupStatusTests(ApiBase):
    def keys(self, data):
        return {step['key']: step for step in data['steps']}

    def test_shape_and_order(self):
        data = self.get(self.admin, 'setup-status/').data
        self.assertEqual(set(data), {'steps', 'complete'})
        self.assertEqual([s['key'] for s in data['steps']],
                         ['departments', 'programmes', 'course_units', 'lecturers', 'students', 'grading'])
        for step in data['steps']:
            self.assertEqual(set(step), {'key', 'done', 'count'})
            if step['key'] == 'lecturers':  # the fixture's teacher is a lecturer of this institution
                self.assertEqual((step['done'], step['count']), (True, 1))
                continue
            self.assertFalse(step['done'])
            self.assertEqual(step['count'], 0)
        self.assertFalse(data['complete'])

    def test_progress(self):
        dept = self.dept()
        self.post(self.admin, 'programmes/', {'name': 'P', 'department': dept, 'duration_years': 3})
        self.client.force_authenticate(self.admin)
        self.client.put(BASE + 'grading-policy/', {'preset_key': 'gpa_4'}, format='json')
        data = self.get(self.admin, 'setup-status/').data
        steps = self.keys(data)
        self.assertTrue(steps['departments']['done'])
        self.assertEqual(steps['departments']['count'], 1)
        self.assertTrue(steps['programmes']['done'])
        self.assertTrue(steps['grading']['done'])
        self.assertFalse(steps['course_units']['done'])
        self.assertFalse(data['complete'])

    def test_status_does_not_leak_other_institution(self):
        self.dept(self.other_admin, 'Elsewhere')
        self.assertFalse(self.keys(self.get(self.admin, 'setup-status/').data)['departments']['done'])

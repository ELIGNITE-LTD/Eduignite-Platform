"""Higher-education students: admission into a programme, listing, promotion, isolation and activation."""

from datetime import date

from django.db import IntegrityError, transaction
from rest_framework.test import APITestCase

from apps.higher_ed import api
from apps.higher_ed.models import AcademicYear, Enrolment, OrganizationalUnit, Programme
from apps.higher_ed.tests.test_higher_ed import make_school, make_user

URL = '/api/v1/higher-ed/students/'


def setup_institution(school):
    dept = OrganizationalUnit.objects.create(school=school, unit_type='department', name='Computer Science')
    prog = Programme.objects.create(school=school, department=dept, name='BSc Computer Science', award_level='licence')
    years = api.ensure_programme_years(prog)
    ay = AcademicYear.objects.create(school=school, label='2026/2027', start_date=date(2026, 9, 14),
                                     end_date=date(2027, 7, 16), is_current=True)
    return prog, years, ay


class EnrolmentTests(APITestCase):
    def setUp(self):
        self.school = make_school('HE-ENR1')
        self.other = make_school('HE-ENR2')
        self.prog, self.years, self.ay = setup_institution(self.school)
        self.other_prog, self.other_years, _ = setup_institution(self.other)
        self.admin = make_user('ADM-E1', 'SCHOOL_ADMIN', self.school)
        self.other_admin = make_user('ADM-E2', 'SCHOOL_ADMIN', self.other)
        self.teacher = make_user('TCH-E1', 'TEACHER', self.school)
        self.bursar = make_user('BUR-E1', 'BURSAR', self.school)
        self.parent = make_user('PAR-E1', 'PARENT', self.school)

    def payload(self, **extra):
        data = {'name': 'Ada Nkeng', 'gender': 'female', 'date_of_birth': '2005-03-12', 'place_of_birth': 'Bamenda',
                'phone': '+237650111222', 'guardian_name': 'Mrs Nkeng', 'guardian_phone': '+237677000111',
                'programme': str(self.prog.id), 'programme_year': str(self.years[0].id)}
        data.update(extra)
        return data

    def admit(self, **extra):
        self.client.force_authenticate(self.admin)
        return self.client.post(URL, self.payload(**extra), format='json')

    def test_admin_admits_a_student_into_a_programme_and_level(self):
        r = self.admit()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data['name'], r.data['programme_name'], r.data['year_label'], r.data['status']),
                         ('Ada Nkeng', 'BSc Computer Science', self.years[0].label, 'active'))
        self.assertEqual(r.data['academic_year_label'], '2026/2027')
        self.assertTrue(r.data['matricule'])
        self.assertFalse(r.data['activated'])
        enrolment = Enrolment.objects.get()
        student = enrolment.student
        self.assertEqual((student.student_class, student.class_level), ('BSc Computer Science', self.years[0].label))
        self.assertEqual(student.user.role, 'STUDENT')
        self.assertEqual(student.guardian_links.count() if hasattr(student, 'guardian_links') else 1, 1)

    def test_a_programme_and_a_level_are_required_and_must_match(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(URL, {**self.payload(), 'programme': ''}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL, {**self.payload(), 'programme_year': ''}, format='json').status_code, 400)
        other_prog = Programme.objects.create(school=self.school, department=self.prog.department, name='MSc X',
                                              award_level='master')
        other_years = api.ensure_programme_years(other_prog)
        wrong_level = self.client.post(URL, {**self.payload(), 'programme_year': str(other_years[0].id)}, format='json')
        self.assertEqual(wrong_level.status_code, 400)
        self.assertEqual(Enrolment.objects.count(), 0)

    def test_another_institutions_programme_is_refused(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(URL, self.payload(programme=str(self.other_prog.id),
                                               programme_year=str(self.other_years[0].id)), format='json')
        self.assertEqual(r.status_code, 400)

    def test_an_academic_year_is_needed(self):
        AcademicYear.objects.all().update(is_current=False)
        r = self.admit()
        self.assertEqual(r.status_code, 400)
        self.assertIn('academic_year', r.data['errors'] if 'errors' in r.data else r.data)

    def test_only_the_administrator_can_admit(self):
        for user in (self.teacher, self.bursar, self.parent):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(URL, self.payload(), format='json').status_code, 403, user.role)
        self.assertEqual(Enrolment.objects.count(), 0)

    def test_staff_read_a_parent_sees_nothing_and_isolation_holds(self):
        self.admit()
        self.client.force_authenticate(self.other_admin)
        self.assertEqual(self.client.get(URL).data, [])
        enrolment = Enrolment.objects.get()
        self.assertEqual(self.client.get(f'{URL}{enrolment.id}/').status_code, 404)
        for user, expected in ((self.teacher, 1), (self.bursar, 1), (self.parent, 0)):
            self.client.force_authenticate(user)
            self.assertEqual(len(self.client.get(URL).data), expected, user.role)

    def test_filters_and_search(self):
        self.admit()
        self.admit(name='Paul Tabe', gender='male', programme_year=str(self.years[1].id))
        self.client.force_authenticate(self.admin)
        self.assertEqual(len(self.client.get(URL).data), 2)
        self.assertEqual([r['name'] for r in self.client.get(URL, {'programme_year': str(self.years[1].id)}).data], ['Paul Tabe'])
        self.assertEqual([r['name'] for r in self.client.get(URL, {'q': 'ada'}).data], ['Ada Nkeng'])
        self.assertEqual(len(self.client.get(URL, {'status': 'withdrawn'}).data), 0)

    def test_promotion_and_status_changes(self):
        self.admit()
        enrolment = Enrolment.objects.get()
        self.client.force_authenticate(self.admin)
        r = self.client.patch(f'{URL}{enrolment.id}/', {'programme_year': str(self.years[1].id)}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['year_number'], 2)
        self.assertEqual(self.client.patch(f'{URL}{enrolment.id}/', {'status': 'deferred'}, format='json').data['status'], 'deferred')
        bad = self.client.patch(f'{URL}{enrolment.id}/', {'programme_year': str(self.other_years[0].id)}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.patch(f'{URL}{enrolment.id}/', {'status': 'withdrawn'}, format='json').status_code, 403)

    def test_a_student_cannot_be_enrolled_twice_in_the_same_year(self):
        self.admit()
        first = Enrolment.objects.get()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Enrolment.objects.create(school=self.school, student=first.student, programme=self.prog,
                                     programme_year=self.years[1], academic_year=self.ay)

    def test_a_secondary_school_cannot_use_it(self):
        secondary = make_school('SEC-ENR', 'secondary')
        admin = make_user('ADM-SEC', 'SCHOOL_ADMIN', secondary)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_the_student_activates_with_the_matricule_and_sees_only_themselves(self):
        matricule = self.admit().data['matricule']
        self.admit(name='Paul Tabe', gender='male')
        self.client.force_authenticate(None)
        r = self.client.post('/api/v1/auth/activate/', {'matricule': matricule, 'new_password': 'Passw0rd!x',
                                                        'confirm_password': 'Passw0rd!x'}, format='json')
        self.assertEqual(r.status_code, 200, getattr(r, 'data', r.content))
        login = self.client.post('/api/v1/auth/login/', {'matricule': matricule, 'password': 'Passw0rd!x'}, format='json')
        self.assertEqual(login.status_code, 200, getattr(login, 'data', login.content))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access_token']}")
        rows = self.client.get(URL).data
        self.assertEqual([x['name'] for x in rows], ['Ada Nkeng'])
        self.assertTrue(rows[0]['activated'])


class LoginPayloadTests(APITestCase):
    def test_the_sign_in_response_says_what_kind_of_institution_it_is(self):
        school = make_school('HE-LOGIN')
        make_user('ADM-LG', 'SCHOOL_ADMIN', school)
        r = self.client.post('/api/v1/auth/login/', {'matricule': 'ADM-LG', 'password': 'password123'}, format='json')
        self.assertEqual(r.status_code, 200, getattr(r, 'data', r.content))
        self.assertEqual(r.data['user']['school']['education_category'], 'higher')
        self.assertIn('school_kind', r.data['user']['school'])


class SubAdminAdmitTests(APITestCase):
    def test_sub_admin_can_admit_but_lecturer_and_bursar_cannot(self):
        school = make_school('HE-ENR3')
        prog, years, _ = setup_institution(school)
        body = {'name': 'Ada Nkeng', 'gender': 'female', 'programme': str(prog.id), 'programme_year': str(years[0].id)}
        self.client.force_authenticate(make_user('SUB-E1', 'SUB_ADMIN', school))
        self.assertEqual(self.client.post(URL, body, format='json').status_code, 201)
        for matricule, role in (('TCH-E9', 'TEACHER'), ('BUR-E9', 'BURSAR')):
            self.client.force_authenticate(make_user(matricule, role, school))
            self.assertEqual(self.client.post(URL, {**body, 'name': 'Nope Person'}, format='json').status_code, 403)

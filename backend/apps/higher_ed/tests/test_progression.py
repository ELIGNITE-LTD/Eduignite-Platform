"""End-of-year progression in higher education: promote, repeat, and graduate the final level only when chosen."""

from datetime import date

from django.test import TransactionTestCase
from rest_framework.test import APIClient, APITestCase

from apps.higher_ed.models import AcademicYear, Enrolment
from apps.higher_ed.tests.test_enrolments import setup_institution
from apps.higher_ed.tests.test_higher_ed import make_school, make_user

URL = '/api/v1/higher-ed/progression/'
ADMIT = '/api/v1/higher-ed/students/'


class ProgressionTests(APITestCase):
    def setUp(self):
        self.school = make_school('HE-PRG1')
        self.prog, self.years, self.ay = setup_institution(self.school)
        self.next_ay = AcademicYear.objects.create(school=self.school, label='2027/2028', start_date=date(2027, 9, 13), end_date=date(2028, 7, 14))
        self.admin = make_user('ADM-P1', 'SCHOOL_ADMIN', self.school)
        self.teacher = make_user('TCH-P1', 'TEACHER', self.school)
        self.client.force_authenticate(self.admin)

    def admit(self, name, level):
        r = self.client.post(ADMIT, {'name': name, 'gender': 'female', 'programme': str(self.prog.id), 'programme_year': str(level.id)}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data['id']

    def body(self, ids, **extra):
        return {'academic_year': str(self.ay.id), 'target_academic_year': str(self.next_ay.id), 'enrolment_ids': ids, **extra}

    def test_listing_filters_and_marks_the_final_level(self):
        first, last = self.years[0], self.years[-1]
        self.admit('Ada First', first)
        self.admit('Bea Last', last)
        rows = self.client.get(URL, {'academic_year': str(self.ay.id)}).data['rows']
        by = {r['name']: r for r in rows}
        self.assertEqual((by['Ada First']['state'], by['Bea Last']['state']), ('to_decide', 'final_not_met'))

        only = self.client.get(URL, {'academic_year': str(self.ay.id), 'level': str(last.id)}).data['rows']
        self.assertEqual([r['name'] for r in only], ['Bea Last'])

    def test_promote_moves_up_and_never_graduates_the_final_level(self):
        a, b = self.admit('Ada First', self.years[0]), self.admit('Bea Last', self.years[-1])
        r = self.client.post(URL + 'promote/', self.body([a, b]), format='json').data
        self.assertEqual(r['moved'], 1)
        self.assertEqual(r['failed'][0]['reason'], 'Final level: use Graduate.')
        moved = Enrolment.objects.get(academic_year=self.next_ay)
        self.assertEqual(moved.programme_year.number, 2)
        self.assertEqual(Enrolment.objects.get(id=b).status, 'active')
        # Doing it twice does not duplicate.
        again = self.client.post(URL + 'promote/', self.body([a]), format='json').data
        self.assertEqual(again['moved'], 0)

    def test_repeat_keeps_the_level(self):
        a = self.admit('Ada First', self.years[0])
        self.assertEqual(self.client.post(URL + 'repeat/', self.body([a]), format='json').data['moved'], 1)
        self.assertEqual(Enrolment.objects.get(academic_year=self.next_ay).programme_year.number, 1)

    def test_graduation_follows_the_criteria_not_a_hand_picked_list(self):
        from datetime import date as d
        from apps.higher_ed.models import AcademicPeriod, CourseOffering, CourseResult, CourseUnit
        a, b, c = self.admit('Ada First', self.years[0]), self.admit('Bea Last', self.years[-1]), self.admit('Cy Last', self.years[-1])
        self.prog.required_credits = 3
        self.prog.save()
        period = AcademicPeriod.objects.create(school=self.school, academic_year=self.ay, period_type='semester', name='S1', order=1,
                                               start_date=d(2026, 9, 14), end_date=d(2027, 1, 29))
        unit = CourseUnit.objects.create(school=self.school, department=self.prog.department, code='CSC1', title='Intro', credits=3)
        off = CourseOffering.objects.create(school=self.school, course_unit=unit, academic_period=period)
        CourseResult.objects.create(school=self.school, offering=off, student=Enrolment.objects.get(id=b).student, total_score=15, passed=True)
        rows = {r['name']: r for r in self.client.get(URL, {'academic_year': str(self.ay.id)}).data['rows']}
        self.assertEqual((rows['Bea Last']['state'], rows['Cy Last']['state']), ('ready_to_graduate', 'final_not_met'))
        r = self.client.post(URL + 'graduate/', {'academic_year': str(self.ay.id), 'enrolment_ids': [a, b, c]}, format='json').data
        self.assertEqual(r['graduated'], 1)
        self.assertEqual({f['reason'] for f in r['failed']}, {'Only students of the final level can graduate.', 'Has not earned the credits required to graduate yet.'})
        self.assertEqual(Enrolment.objects.get(id=b).status, 'graduated')
        self.assertEqual(Enrolment.objects.get(id=c).status, 'active')

    def test_promote_all_moves_everyone_below_the_final_level(self):
        self.admit('Ada First', self.years[0])
        self.admit('Bea Last', self.years[-1])
        r = self.client.post(URL + 'promote/', self.body([], all=True), format='json').data
        self.assertEqual(r['moved'], 1)

    def test_new_year_must_come_after_and_only_admins_may_act(self):
        a = self.admit('Ada First', self.years[0])
        bad = self.client.post(URL + 'promote/', {**self.body([a]), 'target_academic_year': str(self.ay.id)}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.post(URL + 'promote/', self.body([a]), format='json').status_code, 403)
        self.assertEqual(self.client.get(URL, {'academic_year': str(self.ay.id)}).status_code, 403)


class GraduateWithoutOuterTransactionTests(TransactionTestCase):
    """The test runner wraps each TestCase in a transaction, which hid a row lock taken outside one on a real server."""

    def test_graduating_works_in_autocommit(self):
        from apps.higher_ed import progression
        school = make_school('HE-PRG2')
        prog, years, ay = setup_institution(school)
        admin = make_user('ADM-P2', 'SCHOOL_ADMIN', school)
        client = APIClient()
        client.force_authenticate(admin)
        r = client.post(ADMIT, {'name': 'Dee Last', 'gender': 'female', 'programme': str(prog.id), 'programme_year': str(years[-1].id)}, format='json')
        result = progression.graduate(school, ay, [r.data['id']])
        self.assertEqual(result['graduated'], 0)
        self.assertEqual(result['failed'][0]['reason'], 'Has not earned the credits required to graduate yet.')


class StatusEditCannotGraduateTests(APITestCase):
    def setUp(self):
        self.school = make_school('HE-PRG3')
        self.prog, self.years, self.ay = setup_institution(self.school)
        self.admin = make_user('ADM-P3', 'SCHOOL_ADMIN', self.school)
        self.client.force_authenticate(self.admin)

    def admit(self, level):
        r = self.client.post(ADMIT, {'name': 'Eve Student', 'gender': 'female', 'programme': str(self.prog.id), 'programme_year': str(level.id)}, format='json')
        return r.data['id']

    def test_setting_graduated_by_hand_follows_the_criteria(self):
        first, final = self.admit(self.years[0]), self.admit(self.years[-1])
        for enrolment in (first, final):
            r = self.client.patch(f'{ADMIT}{enrolment}/', {'status': 'graduated'}, format='json')
            self.assertEqual(r.status_code, 400)
            self.assertIn('Promotion and graduation', str(r.data))
        self.assertEqual(Enrolment.objects.get(id=first).status, 'active')

    def test_other_status_changes_still_work(self):
        a = self.admit(self.years[0])
        r = self.client.patch(f'{ADMIT}{a}/', {'status': 'deferred'}, format='json')
        self.assertEqual((r.status_code, r.data['status']), (200, 'deferred'))

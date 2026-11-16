"""Course results: marking, grading, roles, publishing, GPA and transcripts."""

from datetime import date
from decimal import Decimal

from rest_framework.test import APITestCase

from apps.higher_ed import api
from apps.higher_ed.models import (
    AcademicPeriod, AcademicYear, CourseOffering, CourseResult, CourseUnit, CurriculumEntry, Enrolment,
    OrganizationalUnit, Programme,
)
from apps.higher_ed.tests.test_higher_ed import make_school, make_user

BASE = '/api/v1/higher-ed/results/'


class ResultsBase(APITestCase):
    scale = 'gpa_4'

    def setUp(self):
        self.school = make_school('HE-RES1')
        self.other = make_school('HE-RES2')
        self.dept = OrganizationalUnit.objects.create(school=self.school, unit_type='department', name='Computer Science')
        self.prog = Programme.objects.create(school=self.school, department=self.dept, name='BSc CS', award_level='licence')
        self.years = api.ensure_programme_years(self.prog)
        self.ay = AcademicYear.objects.create(school=self.school, label='2026/2027', start_date=date(2026, 9, 14),
                                              end_date=date(2027, 7, 16), is_current=True)
        self.s1 = AcademicPeriod.objects.create(school=self.school, academic_year=self.ay, period_type='semester',
                                                name='Semester 1', order=1, start_date=date(2026, 9, 14), end_date=date(2027, 1, 29))
        self.s2 = AcademicPeriod.objects.create(school=self.school, academic_year=self.ay, period_type='semester',
                                                name='Semester 2', order=2, start_date=date(2027, 2, 8), end_date=date(2027, 6, 25))
        api.set_grading_policy(self.school, self.scale)
        self.admin = make_user('ADM-R1', 'SCHOOL_ADMIN', self.school)
        self.lect = make_user('TCH-R1', 'TEACHER', self.school)
        self.lect2 = make_user('TCH-R2', 'TEACHER', self.school)
        self.csc101 = self.unit('CSC101', 3)
        self.csc102 = self.unit('CSC102', 4)
        self.off1 = self.offer(self.csc101, self.s1, [self.lect])
        self.off2 = self.offer(self.csc102, self.s1, [self.lect])
        for cu in (self.csc101, self.csc102):
            CurriculumEntry.objects.create(school=self.school, programme=self.prog, programme_year=self.years[0],
                                           period_type='semester', period_number=1, course_unit=cu)
        self.ada = self.admit('Ada Nkeng')
        self.paul = self.admit('Paul Tabe')

    def unit(self, code, credits):
        return CourseUnit.objects.create(school=self.school, department=self.dept, code=code, title=code + ' title', credits=credits)

    def offer(self, cu, period, lecturers):
        o = CourseOffering.objects.create(school=self.school, course_unit=cu, academic_period=period)
        o.lecturers.set(lecturers)
        return o

    def admit(self, name):
        self.client.force_authenticate(self.admin)
        r = self.client.post('/api/v1/higher-ed/students/', {
            'name': name, 'gender': 'female', 'programme': str(self.prog.id), 'programme_year': str(self.years[0].id)}, format='json')
        assert r.status_code == 201, r.data
        return Enrolment.objects.get(pk=r.data['id']).student

    def save(self, user, offering, rows):
        self.client.force_authenticate(user)
        return self.client.post(BASE + 'save/', {'offering': str(offering.id), 'rows': rows}, format='json')

    def rowfor(self, student, ca, exam):
        return {'student': str(student.id), 'ca_score': ca, 'exam_score': exam}


class MarkingTests(ResultsBase):
    def test_the_roster_lists_the_students_whose_programme_and_level_include_the_course(self):
        self.client.force_authenticate(self.lect)
        r = self.client.get(BASE + 'roster/', {'offering': str(self.off1.id)})
        self.assertEqual(r.status_code, 200)
        self.assertEqual([x['name'] for x in r.data['rows']], ['Ada Nkeng', 'Paul Tabe'])
        self.assertEqual((r.data['scale'], r.data['ca_max'], r.data['exam_max'], r.data['total_max']),
                         ('gpa_4', Decimal('30.00'), Decimal('70.00'), Decimal('100')))

    def test_withdrawn_students_and_other_levels_are_not_on_the_roster(self):
        Enrolment.objects.filter(student=self.paul).update(status='withdrawn')
        self.client.force_authenticate(self.lect)
        names = [x['name'] for x in self.client.get(BASE + 'roster/', {'offering': str(self.off1.id)}).data['rows']]
        self.assertEqual(names, ['Ada Nkeng'])
        Enrolment.objects.filter(student=self.ada).update(programme_year=self.years[1])
        self.assertEqual(self.client.get(BASE + 'roster/', {'offering': str(self.off1.id)}).data['rows'], [])

    def test_scores_become_a_total_and_a_grade_with_points(self):
        r = self.save(self.lect, self.off1, [self.rowfor(self.ada, 24, 56)])
        self.assertEqual(r.status_code, 200, r.data)
        row = next(x for x in r.data['rows'] if x['name'] == 'Ada Nkeng')
        self.assertEqual((row['total_score'], row['grade'], row['grade_points'], row['passed'], row['status']),
                         (Decimal('80.00'), 'A', Decimal('4.00'), True, 'draft'))

    def test_only_one_score_so_far_gives_no_grade_yet(self):
        row = next(x for x in self.save(self.lect, self.off1, [self.rowfor(self.ada, 20, None)]).data['rows'] if x['name'] == 'Ada Nkeng')
        self.assertEqual((row['ca_score'], row['total_score'], row['grade']), (Decimal('20.00'), None, ''))

    def test_scores_outside_the_scale_or_for_strangers_are_refused(self):
        self.assertEqual(self.save(self.lect, self.off1, [self.rowfor(self.ada, 31, 10)]).status_code, 400)
        self.assertEqual(self.save(self.lect, self.off1, [self.rowfor(self.ada, 10, 71)]).status_code, 400)
        self.assertEqual(self.save(self.lect, self.off1, [self.rowfor(self.ada, 'abc', 10)]).status_code, 400)
        stranger = make_user('STU-X', 'STUDENT', self.other)
        self.assertEqual(self.save(self.lect, self.off1, [{'student': '00000000-0000-0000-0000-000000000000', 'ca_score': 1}]).status_code, 400)
        self.assertEqual(CourseResult.objects.count(), 0)

    def test_a_lecturer_only_works_on_their_own_courses_the_admin_on_all(self):
        self.assertEqual(self.save(self.lect2, self.off1, [self.rowfor(self.ada, 10, 10)]).status_code, 403)
        self.assertEqual(self.save(self.admin, self.off1, [self.rowfor(self.ada, 10, 10)]).status_code, 200)
        self.client.force_authenticate(self.lect2)
        self.assertEqual(self.client.get(BASE + 'offerings/').data, [])
        self.client.force_authenticate(self.lect)
        self.assertEqual({o['course_code'] for o in self.client.get(BASE + 'offerings/').data}, {'CSC101', 'CSC102'})

    def test_no_grading_policy_means_no_marking(self):
        from apps.higher_ed.models import GradingPolicy
        GradingPolicy.objects.all().delete()
        self.assertEqual(self.save(self.lect, self.off1, [self.rowfor(self.ada, 10, 10)]).status_code, 400)

    def test_another_institutions_offering_is_not_found(self):
        other_admin = make_user('ADM-R2', 'SCHOOL_ADMIN', self.other)
        self.client.force_authenticate(other_admin)
        self.assertEqual(self.client.get(BASE + 'roster/', {'offering': str(self.off1.id)}).status_code, 404)


class PublishingAndTranscriptTests(ResultsBase):
    def test_submit_then_only_the_admin_publishes_and_students_see_only_published(self):
        self.save(self.lect, self.off1, [self.rowfor(self.ada, 24, 56), self.rowfor(self.paul, 15, 25)])
        self.client.force_authenticate(self.lect)
        sub = self.client.post(BASE + 'submit/', {'offering': str(self.off1.id)}, format='json')
        self.assertEqual(sub.data['submitted'], 2)
        self.assertEqual(self.client.post(BASE + 'publish/', {'offering': str(self.off1.id)}, format='json').status_code, 403)
        ada_user = self.ada.user
        ada_user.set_password('x1y2z3!!'); ada_user.save()
        self.client.force_authenticate(ada_user)
        self.assertEqual(self.client.get(BASE + 'mine/').data['periods'], [])  # not published yet
        self.client.force_authenticate(self.admin)
        pub = self.client.post(BASE + 'publish/', {'offering': str(self.off1.id)}, format='json')
        self.assertEqual(pub.data['published'], 2)
        self.client.force_authenticate(ada_user)
        mine = self.client.get(BASE + 'mine/').data
        self.assertEqual(len(mine['periods']), 1)
        self.assertEqual(mine['periods'][0]['courses'][0]['grade'], 'A')

    def test_a_published_result_is_locked_until_unpublished(self):
        self.save(self.lect, self.off1, [self.rowfor(self.ada, 24, 56)])
        self.client.force_authenticate(self.admin)
        self.client.post(BASE + 'publish/', {'offering': str(self.off1.id)}, format='json')
        self.assertEqual(self.save(self.lect, self.off1, [self.rowfor(self.ada, 25, 56)]).status_code, 400)
        self.client.force_authenticate(self.admin)
        self.client.post(BASE + 'unpublish/', {'offering': str(self.off1.id)}, format='json')
        self.assertEqual(self.save(self.lect, self.off1, [self.rowfor(self.ada, 25, 56)]).status_code, 200)

    def test_gpa_is_weighted_by_credits_with_a_degree_class(self):
        self.save(self.lect, self.off1, [self.rowfor(self.ada, 24, 56)])      # 80 -> A 4.0, 3 credits
        self.save(self.lect, self.off2, [self.rowfor(self.ada, 18, 42)])      # 60 -> C 2.0, 4 credits
        self.client.force_authenticate(self.admin)
        for o in (self.off1, self.off2):
            self.client.post(BASE + 'publish/', {'offering': str(o.id)}, format='json')
        t = self.client.get(BASE + 'transcript/', {'student': str(self.ada.id)}).data
        period = t['periods'][0]
        self.assertEqual((period['credits_attempted'], period['credits_earned'], period['gpa']), (7, 7, Decimal('2.86')))
        self.assertEqual(t['cumulative']['gpa'], Decimal('2.86'))
        self.assertEqual(t['cumulative']['degree_class'], 'Second Class Lower')

    def test_a_failed_course_counts_in_the_gpa_but_earns_no_credits(self):
        self.save(self.lect, self.off1, [self.rowfor(self.ada, 10, 20)])      # 30 -> F 0.0
        self.client.force_authenticate(self.admin)
        self.client.post(BASE + 'publish/', {'offering': str(self.off1.id)}, format='json')
        c = self.client.get(BASE + 'transcript/', {'student': str(self.ada.id)}).data['cumulative']
        self.assertEqual((c['credits_attempted'], c['credits_earned'], c['gpa']), (3, 0, Decimal('0.00')))

    def test_roles_and_isolation_for_reading(self):
        self.client.force_authenticate(self.lect)
        self.assertEqual(self.client.get(BASE + 'transcript/', {'student': str(self.ada.id)}).status_code, 403)
        self.assertEqual(self.client.get(BASE + 'mine/').status_code, 403)
        other_admin = make_user('ADM-R2', 'SCHOOL_ADMIN', self.other)
        self.client.force_authenticate(other_admin)
        self.assertEqual(self.client.get(BASE + 'transcript/', {'student': str(self.ada.id)}).status_code, 404)

    def test_secondary_schools_cannot_use_results(self):
        secondary = make_school('SEC-RES', 'secondary')
        self.client.force_authenticate(make_user('ADM-S', 'SCHOOL_ADMIN', secondary))
        self.assertEqual(self.client.get(BASE + 'offerings/').status_code, 403)


class Scale20Tests(ResultsBase):
    scale = 'scale_20'

    def test_francophone_scale_marks_out_of_20_with_a_mention(self):
        self.client.force_authenticate(self.lect)
        roster = self.client.get(BASE + 'roster/', {'offering': str(self.off1.id)}).data
        self.assertEqual((roster['ca_max'], roster['exam_max'], roster['total_max']), (Decimal('8.00'), Decimal('12.00'), Decimal('20')))
        row = next(x for x in self.save(self.lect, self.off1, [self.rowfor(self.ada, 6, 9.5)]).data['rows'] if x['name'] == 'Ada Nkeng')
        self.assertEqual((row['total_score'], row['grade'], row['grade_points'], row['passed']), (Decimal('15.50'), 'Bien', None, True))
        self.client.force_authenticate(self.admin)
        self.client.post(BASE + 'publish/', {'offering': str(self.off1.id)}, format='json')
        c = self.client.get(BASE + 'transcript/', {'student': str(self.ada.id)}).data['cumulative']
        self.assertEqual((c['average'], c['mention'], c['gpa']), (Decimal('15.50'), 'Bien', None))

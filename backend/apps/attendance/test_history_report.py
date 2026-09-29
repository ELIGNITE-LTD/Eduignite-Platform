"""Attendance history reports: the right records, for the right people only.

Principals see their school; a vice principal sees their own sections; a
teacher sees the sessions they recorded, in the subjects and classes they are
assigned to. Terms come from the school's sequence calendar, and a date range
only ever narrows a term.
"""

from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.attendance.models import AttendanceRecord, AttendanceSession
from apps.grades.models import ClassSubject, Sequence, Subject
from apps.schools.models import School, SchoolClass, SubSchool
from apps.students.models import Student

User = get_user_model()

REPORT = '/api/v1/attendance/records/history-report/'
OPTIONS = '/api/v1/attendance/records/history-report/options/'


def _user(school, matricule, role, **extra):
    return User.objects.create_user(
        matricule=matricule, name=f'{role.title()} {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='password123', is_license_paid=True, **extra,
    )


@mock.patch('apps.registry.api.is_installed_for_user', return_value=True)
class AttendanceHistoryReportTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='ATT-HIS', name='Attendance College', short_name='AC', principal='Dr Principal',
            motto='Discipline and Work', location='Buea', address='Molyko Road',
            email='att@example.org', phone='237650000000', school_type='general', subsystem='anglophone',
        )
        self.section_a = SubSchool.objects.create(school=self.school, name='Section A')
        self.section_b = SubSchool.objects.create(school=self.school, name='Section B')
        self.class_a = SchoolClass.objects.create(school=self.school, name='Form 1A', sub_school=self.section_a)
        self.class_b = SchoolClass.objects.create(school=self.school, name='Form 1B', sub_school=self.section_b)

        for term, start, end in ((1, date(2025, 9, 1), date(2025, 12, 15)), (2, date(2026, 1, 5), date(2026, 3, 31))):
            Sequence.objects.create(school=self.school, name=f'Sequence {term * 2 - 1}', academic_year='2025-2026',
                                    term=term, start_date=start, end_date=end)

        self.admin = _user(self.school, 'ADM-HIS', 'SCHOOL_ADMIN')
        self.vice = _user(self.school, 'VP-HIS', 'SUB_ADMIN', sub_school=self.section_a)
        self.maths_teacher = _user(self.school, 'TCH-MATH', 'TEACHER')
        self.english_teacher = _user(self.school, 'TCH-ENG', 'TEACHER')
        self.maths = Subject.objects.create(school=self.school, name='Mathematics', code='MATH', level='Form 1')
        self.english = Subject.objects.create(school=self.school, name='English', code='ENG', level='Form 1')
        ClassSubject.objects.create(school_class=self.class_a, subject=self.maths, teacher=self.maths_teacher)
        ClassSubject.objects.create(school_class=self.class_a, subject=self.english, teacher=self.english_teacher)
        ClassSubject.objects.create(school_class=self.class_b, subject=self.english, teacher=self.english_teacher)

        self.s1 = self._student('STU-1', 'Ada Fon', self.class_a)
        self.s2 = self._student('STU-2', 'Ben Tabi', self.class_a)
        self.s3 = self._student('STU-3', 'Cia Ngwa', self.class_b)

        self._session(self.maths_teacher, self.maths, self.class_a, date(2025, 10, 1), [(self.s1, 'present'), (self.s2, 'absent')])
        self._session(self.english_teacher, self.english, self.class_a, date(2025, 10, 2), [(self.s1, 'late')])
        self._session(self.english_teacher, self.english, self.class_b, date(2025, 10, 3), [(self.s3, 'excused')])
        # Second term: outside a first-term report.
        self._session(self.maths_teacher, self.maths, self.class_a, date(2026, 1, 15), [(self.s1, 'present')])

    def _student(self, matricule, name, school_class):
        user = _user(self.school, matricule, 'STUDENT')
        user.name = name
        user.save(update_fields=['name'])
        return Student.objects.create(user=user, school=self.school, school_class=school_class,
                                      student_class=school_class.name, admission_number=matricule)

    def _session(self, teacher, subject, school_class, day, marks):
        session = AttendanceSession.objects.create(school=self.school, teacher=teacher, subject=subject,
                                                   school_class=school_class, date=day, period='full_day')
        for student, mark in marks:
            AttendanceRecord.objects.create(session=session, student=student, status=mark,
                                            excuse_note='Medical note' if mark == 'excused' else '')

    def _report(self, user, **params):
        self.client.force_authenticate(user)
        return self.client.get(REPORT, {'academic_year': '2025-2026', 'term': '1', **params})

    # --- school-wide ---------------------------------------------------------

    def test_school_wide_term_report_counts_only_that_term(self, _app):
        response = self._report(self.admin)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        summary = response.data['summary']
        self.assertEqual(summary['records'], 4)
        self.assertEqual((summary['present'], summary['absent'], summary['late'], summary['excused']), (1, 1, 1, 1))
        self.assertEqual(summary['students_recorded'], 3)
        self.assertEqual(summary['students_on_roll'], 3)
        self.assertEqual(summary['sessions'], 3)
        self.assertEqual(summary['attendance_rate'], 50.0)
        self.assertEqual(response.data['filters']['term'], 'First Term')
        self.assertEqual(response.data['filters']['start_date'], '2025-09-01')
        self.assertEqual(response.data['school']['address'], 'Molyko Road')
        self.assertEqual([row['date'] for row in response.data['rows']], sorted(row['date'] for row in response.data['rows']))

    def test_class_filter(self, _app):
        response = self._report(self.admin, class_id=str(self.class_a.id))
        self.assertEqual(response.data['summary']['records'], 3)
        self.assertEqual(response.data['summary']['students_on_roll'], 2)
        self.assertEqual(response.data['filters']['class'], 'Form 1A')

    def test_sub_school_filter(self, _app):
        response = self._report(self.admin, sub_school=str(self.section_b.id))
        self.assertEqual(response.data['summary']['records'], 1)
        self.assertEqual(response.data['rows'][0]['status'], 'Excused')
        self.assertEqual(response.data['rows'][0]['remarks'], 'Medical note')

    def test_a_date_range_narrows_the_term(self, _app):
        response = self._report(self.admin, start_date='2025-10-02', end_date='2025-10-02')
        self.assertEqual(response.data['summary']['records'], 1)

    def test_a_date_range_outside_the_term_is_refused(self, _app):
        response = self._report(self.admin, start_date='2026-02-01', end_date='2026-02-10')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_another_term(self, _app):
        response = self._report(self.admin, term='2')
        self.assertEqual(response.data['summary']['records'], 1)

    def test_an_empty_period_returns_no_rows_rather_than_an_error(self, _app):
        response = self._report(self.admin, start_date='2025-11-01', end_date='2025-11-30')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['rows'], [])
        self.assertIsNone(response.data['summary']['attendance_rate'])

    def test_a_vice_principal_sees_only_their_section(self, _app):
        response = self._report(self.vice)
        self.assertEqual(response.data['summary']['records'], 3)
        forbidden = self._report(self.vice, sub_school=str(self.section_b.id))
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)
        forbidden = self._report(self.vice, class_id=str(self.class_b.id))
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_principal_of_another_school_sees_nothing_here(self, _app):
        other = School.objects.create(
            id='ATT-OTH', name='Other College', short_name='OC', principal='P', location='Limbe',
            email='oth@example.org', phone='237650000001', school_type='general', subsystem='anglophone',
        )
        Sequence.objects.create(school=other, name='Sequence 1', academic_year='2025-2026', term=1,
                                start_date=date(2025, 9, 1), end_date=date(2025, 12, 15))
        outsider = _user(other, 'ADM-OTH', 'SCHOOL_ADMIN')
        self.assertEqual(self._report(outsider).data['summary']['records'], 0)
        self.assertEqual(self._report(outsider, class_id=str(self.class_a.id)).status_code, status.HTTP_403_FORBIDDEN)

    # --- teachers ------------------------------------------------------------

    def test_a_teacher_gets_their_own_subject_sessions_only(self, _app):
        response = self._report(self.maths_teacher, subject=str(self.maths.id), class_id=str(self.class_a.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['kind'], 'subject')
        self.assertEqual(response.data['summary']['records'], 2)
        self.assertEqual(response.data['filters']['subject'], 'Mathematics')
        self.assertEqual(response.data['teacher_name'], self.maths_teacher.get_full_name())

    def test_a_teacher_cannot_report_on_a_subject_or_class_they_do_not_teach(self, _app):
        self.assertEqual(self._report(self.maths_teacher, subject=str(self.english.id)).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._report(self.maths_teacher, class_id=str(self.class_b.id)).status_code, status.HTTP_403_FORBIDDEN)

    def test_a_teacher_never_sees_another_teachers_sessions(self, _app):
        response = self._report(self.english_teacher)
        self.assertEqual(response.data['summary']['records'], 2)
        self.assertTrue(all(row['subject'] == 'English' for row in response.data['rows']))

    def test_students_and_parents_cannot_download(self, _app):
        self.assertEqual(self._report(self.s1.user).status_code, status.HTTP_403_FORBIDDEN)

    def test_a_long_report_returns_every_record(self, _app):
        big = SchoolClass.objects.create(school=self.school, name='Form 5', sub_school=self.section_a)
        learners = [self._student(f'BIG-{n:03d}', f'Learner {n:03d}', big) for n in range(60)]
        for day in range(1, 6):
            self._session(self.maths_teacher, self.maths, big, date(2025, 11, day), [(s, 'present') for s in learners])
        response = self._report(self.admin, class_id=str(big.id))
        self.assertEqual(response.data['summary']['records'], 300)
        self.assertEqual(len(response.data['rows']), 300)
        self.assertEqual(response.data['summary']['students_recorded'], 60)

    # --- the filter panel ----------------------------------------------------

    def test_options_offer_only_what_each_user_may_see(self, _app):
        self.client.force_authenticate(self.admin)
        admin = self.client.get(OPTIONS).data
        self.assertEqual(len(admin['sub_schools']), 2)
        self.assertEqual(admin['calendar'][0]['academic_year'], '2025-2026')
        self.assertEqual([t['label'] for t in admin['calendar'][0]['terms']], ['First Term', 'Second Term'])

        self.client.force_authenticate(self.vice)
        vice = self.client.get(OPTIONS).data
        self.assertEqual([s['name'] for s in vice['sub_schools']], ['Section A'])
        self.assertEqual({c['name'] for c in vice['classes']}, {'Form 1A'})

        self.client.force_authenticate(self.maths_teacher)
        teacher = self.client.get(OPTIONS).data
        self.assertEqual([(a['class_name'], a['subject_name']) for a in teacher['assignments']], [('Form 1A', 'Mathematics')])

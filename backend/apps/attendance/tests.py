from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.attendance.models import AttendanceRecord, AttendanceSession
from apps.schools.models import School, SchoolClass
from apps.students.models import Student


User = get_user_model()


class AttendanceSummaryTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='ATT-TEST',
            name='Attendance Test Secondary School',
            short_name='ATSS',
            principal='Principal Attendance',
            location='Limbe',
            email='attendance@example.com',
            phone='237654000000',
            school_type='general',
            subsystem='anglophone',
        )
        self.school_class = SchoolClass.objects.create(school=self.school, name='Form 1 A')
        self.admin = User.objects.create_user(
            matricule='ADM-ATT-001',
            name='Attendance Admin',
            email='admin.attendance@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )
        self.teacher = User.objects.create_user(
            matricule='TEA-ATT-001',
            name='Attendance Teacher',
            email='teacher.attendance@example.com',
            role='TEACHER',
            school=self.school,
            password='password123',
        )
        self.student_user = User.objects.create_user(
            matricule='ATSS26ST0001',
            name='Attendance Student',
            email='student.attendance@example.com',
            role='STUDENT',
            school=self.school,
            password='password123',
            is_license_paid=True,
        )
        self.student = Student.objects.create(
            user=self.student_user,
            school=self.school,
            school_class=self.school_class,
            student_class='Form 1 A',
            class_level='Form 1',
            section='General',
            admission_number='0001',
        )
        self.session = AttendanceSession.objects.create(
            school=self.school,
            teacher=self.teacher,
            school_class=self.school_class,
            student_class='Form 1 A',
            date=date.today(),
            period='morning',
        )
        AttendanceRecord.objects.create(session=self.session, student=self.student, status='present')

    def test_school_admin_attendance_summary_uses_real_records(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/v1/attendance/records/summary/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_records'], 1)
        self.assertEqual(response.data['present'], 1)
        self.assertEqual(response.data['attendance_percentage'], 100)
        self.assertEqual(response.data['students_tracked'], 1)
        self.assertEqual(response.data['class_summary'][0]['class_name'], 'Form 1 A')

    def test_student_attendance_summary_is_scoped_to_own_records(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.get('/api/v1/attendance/records/summary/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_records'], 1)
        self.assertEqual(response.data['attendance_percentage'], 100)

    def test_promoted_student_attendance_defaults_to_current_class(self):
        form_two = SchoolClass.objects.create(school=self.school, name='Form 2 A')
        self.student.school_class = form_two
        self.student.student_class = 'Form 2 A'
        self.student.class_level = 'Form 2'
        self.student.save()
        current_session = AttendanceSession.objects.create(
            school=self.school,
            teacher=self.teacher,
            school_class=form_two,
            student_class='Form 2 A',
            date=date.today(),
            period='afternoon',
        )
        AttendanceRecord.objects.create(session=current_session, student=self.student, status='absent')

        self.client.force_authenticate(self.student_user)
        current_response = self.client.get('/api/v1/attendance/records/summary/')
        history_response = self.client.get('/api/v1/attendance/records/summary/?include_history=true')

        self.assertEqual(current_response.status_code, status.HTTP_200_OK)
        self.assertEqual(current_response.data['total_records'], 1)
        self.assertEqual(current_response.data['absent'], 1)
        self.assertEqual(history_response.status_code, status.HTTP_200_OK)
        self.assertEqual(history_response.data['total_records'], 2)

    def test_session_detail_present_and_absent_counts_match_records(self):
        """Regression test: get_total_present/get_total_absent used to
        re-query obj.records.filter(...).count() per session, bypassing the
        viewset's records prefetch. They now read obj.records.all() (the
        prefetch cache) in Python -- this pins down that the counts are
        still correct after that change."""
        second_student_user = User.objects.create_user(
            matricule='ATSS26ST0002', name='Second Attendance Student',
            email='student2.attendance@example.com', role='STUDENT',
            school=self.school, password='password123', is_license_paid=True,
        )
        second_student = Student.objects.create(
            user=second_student_user, school=self.school, school_class=self.school_class,
            student_class='Form 1 A', class_level='Form 1', section='General', admission_number='0002',
        )
        AttendanceRecord.objects.create(session=self.session, student=second_student, status='absent')

        self.client.force_authenticate(self.teacher)
        response = self.client.get(f'/api/v1/attendance/sessions/{self.session.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_present'], 1)
        self.assertEqual(response.data['total_absent'], 1)
        self.assertEqual(len(response.data['records']), 2)


# ── Daily class register (basic education) ──────────────────────────────────

from unittest import mock  # noqa: E402

from apps.students.models import ParentStudentLink  # noqa: E402

DAILY = '/api/v1/attendance/sessions/daily/'
SUMMARY = '/api/v1/attendance/records/summary/'


def _staff(school, matricule, role):
    return User.objects.create_user(
        matricule=matricule, name=f'{role.title()} {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='password123', is_license_paid=True,
    )


def _school(sid):
    return School.objects.create(
        id=sid, name=f'School {sid}', short_name=sid, principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000', school_type='general', subsystem='anglophone',
    )


def _pupil(school, school_class, name, number):
    """A pupil with no login account."""
    return Student.objects.create(
        user=None, name=name, school=school, school_class=school_class, student_class=school_class.name,
        class_level='Class 1', section='General', admission_number=number,
    )


@mock.patch('apps.registry.api.is_installed_for_user', return_value=True)
class DailyRegisterTests(APITestCase):
    def setUp(self):
        self.school = _school('DAY-SCH')
        self.klass = SchoolClass.objects.create(school=self.school, name='Class 1')
        self.other_class = SchoolClass.objects.create(school=self.school, name='Class 2')
        self.admin = _staff(self.school, 'DAY-ADM', 'SCHOOL_ADMIN')
        self.master = _staff(self.school, 'DAY-MST', 'TEACHER')
        self.klass.class_master = self.master
        self.klass.save()
        self.outsider = _staff(self.school, 'DAY-OUT', 'TEACHER')
        self.ada = _pupil(self.school, self.klass, 'Ada Nkeng', 'P001')
        self.bola = _pupil(self.school, self.klass, 'Bola Tabi', 'P002')
        self.stranger = _pupil(self.school, self.other_class, 'Cy Fon', 'P003')
        self.day = date.today().isoformat()

    def _body(self, **extra):
        body = {
            'school_class': str(self.klass.id), 'date': self.day,
            'records': [
                {'student': str(self.ada.id), 'status': 'present'},
                {'student': str(self.bola.id), 'status': 'absent', 'excuse_note': 'ill'},
            ],
        }
        body.update(extra)
        return body

    def test_class_master_takes_daily_register_for_loginless_pupils(self, _m):
        self.client.force_authenticate(self.master)
        response = self.client.post(DAILY, self._body(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        session = AttendanceSession.objects.get()
        self.assertEqual(session.session_type, 'daily')
        self.assertEqual(session.period, 'daily')
        self.assertIsNone(session.subject)
        self.assertEqual(session.school_class, self.klass)
        names = {r['student_name'] for r in response.data['records']}
        self.assertEqual(names, {'Ada Nkeng', 'Bola Tabi'})
        self.assertEqual(AttendanceRecord.objects.count(), 2)

    def test_resubmit_is_idempotent_and_updates_marks(self, _m):
        self.client.force_authenticate(self.master)
        first = self.client.post(DAILY, self._body(client_ref='dev1-abc'), format='json')
        body = self._body(client_ref='dev1-abc')
        body['records'][1]['status'] = 'late'
        second = self.client.post(DAILY, body, format='json')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(AttendanceSession.objects.count(), 1)
        self.assertEqual(AttendanceRecord.objects.count(), 2)
        self.assertEqual(AttendanceRecord.objects.get(student=self.bola).status, 'late')

    def test_one_daily_session_per_class_and_day_even_for_another_user(self, _m):
        self.client.force_authenticate(self.master)
        self.client.post(DAILY, self._body(), format='json')
        self.client.force_authenticate(self.admin)
        response = self.client.post(DAILY, self._body(), format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AttendanceSession.objects.filter(session_type='daily').count(), 1)

    def test_db_rejects_duplicate_daily_session(self, _m):
        from django.db import IntegrityError, transaction

        AttendanceSession.objects.create(
            school=self.school, school_class=self.klass, date=date.today(), period='daily', session_type='daily',
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            AttendanceSession.objects.create(
                school=self.school, school_class=self.klass, date=date.today(), period='daily', session_type='daily',
            )

    def test_client_ref_cannot_be_reused_for_another_register(self, _m):
        self.client.force_authenticate(self.admin)
        self.client.post(DAILY, self._body(client_ref='ref-1'), format='json')
        body = self._body(client_ref='ref-1', school_class=str(self.other_class.id))
        body['records'] = [{'student': str(self.stranger.id), 'status': 'present'}]
        response = self.client.post(DAILY, body, format='json')
        self.assertEqual(response.status_code, 400)

    def test_pupil_of_another_class_is_rejected(self, _m):
        self.client.force_authenticate(self.master)
        body = self._body()
        body['records'].append({'student': str(self.stranger.id), 'status': 'present'})
        response = self.client.post(DAILY, body, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AttendanceSession.objects.exists())

    def test_invalid_status_and_duplicate_pupil_rejected(self, _m):
        self.client.force_authenticate(self.master)
        bad = self._body()
        bad['records'][0]['status'] = 'sleeping'
        self.assertEqual(self.client.post(DAILY, bad, format='json').status_code, 400)
        dup = self._body()
        dup['records'].append({'student': str(self.ada.id), 'status': 'late'})
        self.assertEqual(self.client.post(DAILY, dup, format='json').status_code, 400)

    def test_teacher_not_responsible_for_class_is_denied(self, _m):
        self.client.force_authenticate(self.outsider)
        response = self.client.post(DAILY, self._body(), format='json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(AttendanceSession.objects.exists())

    def test_assigned_class_teacher_takes_register_only_in_basic_school(self, _m):
        from apps.schools.models import ClassTeacherAssignment

        assigned = _staff(self.school, 'DAY-ASG', 'TEACHER')
        ClassTeacherAssignment.objects.create(
            school_class=self.klass, teacher=assigned, academic_year='2026/2027'
        )
        # Secondary (default): the assignment grants nothing.
        self.client.force_authenticate(assigned)
        self.assertEqual(self.client.post(DAILY, self._body(), format='json').status_code, 403)
        # Basic school: the assigned teacher may take the register of their class...
        self.school.education_category = 'basic'
        self.school.save(update_fields=['education_category'])
        assigned.refresh_from_db()
        self.client.force_authenticate(assigned)
        self.assertEqual(self.client.post(DAILY, self._body(), format='json').status_code, 201)
        # ...but not of another class.
        other = self._body(school_class=str(self.other_class.id))
        other['records'] = [{'student': str(self.stranger.id), 'status': 'present'}]
        self.assertEqual(self.client.post(DAILY, other, format='json').status_code, 403)

    def test_cross_school_class_is_denied(self, _m):
        other_school = _school('DAY-OTH')
        other_admin = _staff(other_school, 'OTH-ADM', 'SCHOOL_ADMIN')
        self.client.force_authenticate(other_admin)
        response = self.client.post(DAILY, self._body(), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AttendanceSession.objects.exists())
        # And the register of another school cannot be read.
        self.assertEqual(
            self.client.get(DAILY, {'school_class': str(self.klass.id), 'date': self.day}).status_code, 400,
        )

    def test_get_returns_roster_with_marks(self, _m):
        self.client.force_authenticate(self.master)
        self.client.post(DAILY, self._body(), format='json')
        response = self.client.get(DAILY, {'school_class': str(self.klass.id), 'date': self.day})
        self.assertEqual(response.status_code, 200)
        by_name = {row['name']: row['status'] for row in response.data['learners']}
        self.assertEqual(by_name, {'Ada Nkeng': 'present', 'Bola Tabi': 'absent'})

    def test_guardian_notified_only_when_one_exists_and_not_twice(self, _m):
        parent = User.objects.create_user(
            matricule='DAY-PAR', name='Mama Tabi', email='mama@example.org', role='PARENT',
            school=self.school, password='password123',
        )
        ParentStudentLink.objects.create(parent=parent, student=self.bola, relationship='mother')
        self.client.force_authenticate(self.master)
        with mock.patch('apps.notifications.utils.notify_users') as notify:
            self.client.post(DAILY, self._body(), format='json')
            self.client.post(DAILY, self._body(), format='json')
        self.assertEqual(notify.call_count, 1)  # Bola only; Ada present; no second ping
        self.assertTrue(AttendanceRecord.objects.get(student=self.bola).notified_parent)
        self.assertFalse(AttendanceRecord.objects.get(student=self.ada).notified_parent)

    def test_absent_pupil_without_guardian_does_not_fail(self, _m):
        self.client.force_authenticate(self.master)
        body = self._body()
        body['records'][0]['status'] = 'absent'
        response = self.client.post(DAILY, body, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertFalse(AttendanceRecord.objects.get(student=self.ada).notified_parent)

    def test_parent_sees_only_linked_child(self, _m):
        parent = User.objects.create_user(
            matricule='DAY-PAR2', name='Papa Nkeng', email='papa@example.org', role='PARENT',
            school=self.school, password='password123',
        )
        ParentStudentLink.objects.create(parent=parent, student=self.ada, relationship='father')
        self.client.force_authenticate(self.master)
        self.client.post(DAILY, self._body(), format='json')
        self.client.force_authenticate(parent)
        response = self.client.get('/api/v1/attendance/records/')
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual([r['student_name'] for r in rows], ['Ada Nkeng'])
        self.assertEqual(self.client.post(DAILY, self._body(), format='json').status_code, 403)

    def test_summary_includes_daily_sessions(self, _m):
        self.client.force_authenticate(self.master)
        self.client.post(DAILY, self._body(), format='json')
        self.client.force_authenticate(self.admin)
        response = self.client.get(SUMMARY)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_records'], 2)
        self.assertEqual(response.data['present'], 1)
        self.assertEqual(response.data['absent'], 1)
        self.assertEqual(response.data['sessions_count'], 1)
        self.assertEqual(response.data['class_summary'][0]['class_name'], 'Class 1')
        # The class master sees it too, without having recorded a period session.
        self.client.force_authenticate(self.master)
        self.assertEqual(self.client.get(SUMMARY).data['total_records'], 2)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(SUMMARY).data['total_records'], 0)

    def test_history_report_includes_daily_for_admin_and_class_master(self, _m):
        self.client.force_authenticate(self.master)
        self.client.post(DAILY, self._body(), format='json')
        params = {'start_date': self.day, 'end_date': self.day}
        report = '/api/v1/attendance/records/history-report/'
        self.client.force_authenticate(self.admin)
        admin_rows = self.client.get(report, params).data
        self.assertEqual(admin_rows['summary']['records'], 2)
        self.assertEqual({r['student_name'] for r in admin_rows['rows']}, {'Ada Nkeng', 'Bola Tabi'})
        self.assertEqual(admin_rows['rows'][0]['period'], 'Daily')
        self.client.force_authenticate(self.master)
        self.assertEqual(self.client.get(report, params).data['summary']['records'], 2)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(report, params).status_code, 403)

    def test_period_sessions_unchanged(self, _m):
        teacher = _staff(self.school, 'DAY-PER', 'TEACHER')
        self.client.force_authenticate(teacher)
        bulk = '/api/v1/attendance/records/bulk_record/'
        response = self.client.post(bulk, {
            'school_class': str(self.klass.id), 'date': self.day, 'period': 'morning',
            'records': [{'student': str(self.ada.id), 'status': 'present'}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        session = AttendanceSession.objects.get()
        self.assertEqual(session.session_type, 'period')
        self.assertEqual(session.period, 'morning')
        # Several period sessions per class and day remain possible.
        self.client.post(bulk, {
            'school_class': str(self.klass.id), 'date': self.day, 'period': 'afternoon',
            'records': [{'student': str(self.ada.id), 'status': 'late'}],
        }, format='json')
        self.assertEqual(AttendanceSession.objects.filter(session_type='period').count(), 2)
        # A period teacher does not see a class's daily register they are not responsible for.
        self.client.force_authenticate(self.master)
        self.client.post(DAILY, self._body(), format='json')
        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.get(SUMMARY).data['total_records'], 2)

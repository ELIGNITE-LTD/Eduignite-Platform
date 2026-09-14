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

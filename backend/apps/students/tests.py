from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.attendance.models import AttendanceRecord, AttendanceSession
from apps.grades.models import ClassSubject, Grade, Sequence, Subject
from apps.grades.models import AnnualResult
from apps.schools.models import School, SchoolClass, SchoolSettings
from .models import Guardian, ParentStudentLink, Student, StudentGuardian, StudentPromotionRecord, ClassPromotionPolicy


User = get_user_model()


class ParentStudentGuardianLinkTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='LINK-TEST',
            name='Parent Link Test Secondary School',
            short_name='PLTSS',
            principal='Principal Test',
            location='Bamenda',
            email='parent-link@example.com',
            phone='237651000000',
            school_type='general',
            subsystem='anglophone',
        )
        self.admin = User.objects.create_user(
            matricule='ADM-LINK-001',
            name='School Admin',
            email='admin.link@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )
        self.parent = User.objects.create_user(
            matricule='PAR-LINK-001',
            name='Parent One',
            email='parent.one@example.com',
            phone='237652000000',
            role='PARENT',
            school=self.school,
            password='password123',
        )
        self.student_user = User.objects.create_user(
            matricule='STU-LINK-001',
            name='Student One',
            email='student.one@example.com',
            role='STUDENT',
            school=self.school,
            password='password123',
            is_license_paid=True,
        )
        self.student = Student.objects.create(
            user=self.student_user,
            school=self.school,
            student_class='Form 1A',
            class_level='Form 1',
            section='General',
            guardian_name='Parent One',
            guardian_phone='237652000000',
            admission_number='ADM-0001',
        )

    def test_link_parent_creates_guardian_relationship_and_parent_dashboard_child(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            f'/api/v1/students/students/{self.student.id}/link_parent/',
            {
                'parent_id': str(self.parent.id),
                'relationship': 'legal_guardian',
                'is_primary': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(ParentStudentLink.objects.filter(parent=self.parent, student=self.student).exists())
        self.assertTrue(StudentGuardian.objects.filter(guardian__user=self.parent, student=self.student).exists())

        self.client.force_authenticate(self.parent)
        children_response = self.client.get('/api/v1/guardians/me/students/')

        self.assertEqual(children_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(children_response.data), 1)
        self.assertEqual(str(children_response.data[0]['id']), str(self.student.id))

    def test_guardian_children_endpoint_keeps_legacy_parent_links_visible(self):
        ParentStudentLink.objects.create(
            parent=self.parent,
            student=self.student,
            relationship='father',
            is_primary=True,
        )
        self.assertFalse(Guardian.objects.filter(user=self.parent).exists())

        self.client.force_authenticate(self.parent)
        response = self.client.get('/api/v1/guardians/me/students/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(str(response.data[0]['id']), str(self.student.id))


class StudentPromotionFlowTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='PROMO-TEST',
            name='Promotion Test Secondary School',
            short_name='PTSS',
            principal='Principal Promo',
            location='Buea',
            email='promotion@example.com',
            phone='237653000000',
            school_type='general',
            subsystem='anglophone',
        )
        SchoolSettings.objects.update_or_create(
            school=self.school,
            defaults={'academic_year': '2026-2027', 'promotion_average': '10.00'},
        )
        self.form_one = SchoolClass.objects.create(school=self.school, name='Form 1 A')
        self.form_two = SchoolClass.objects.create(school=self.school, name='Form 2 A')
        self.admin = User.objects.create_user(
            matricule='ADM-PROMO-001',
            name='Promotion Admin',
            email='admin.promotion@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )
        self.student_user = User.objects.create_user(
            matricule='PTSS26ST0001',
            name='Repeat Candidate',
            email='repeat.candidate@example.com',
            role='STUDENT',
            school=self.school,
            password='password123',
            is_license_paid=True,
        )
        self.student = Student.objects.create(
            user=self.student_user,
            school=self.school,
            school_class=self.form_one,
            student_class='Form 1 A',
            class_level='Form 1',
            section='General',
            admission_number='0001',
        )
        AnnualResult.objects.create(
            student=self.student,
            school=self.school,
            academic_year='2026-2027',
            annual_average='8.50',
            is_promoted=False,
        )

    def test_admin_can_promote_selected_repeated_student_without_changing_matricule(self):
        self.client.force_authenticate(self.admin)
        recalc_response = self.client.post('/api/v1/students/students/recalculate-promotions/', {
            'academic_year': '2026-2027',
        }, format='json')

        self.assertEqual(recalc_response.status_code, status.HTTP_200_OK)
        record = StudentPromotionRecord.objects.get(student=self.student, academic_year='2026-2027')
        self.assertEqual(record.status, StudentPromotionRecord.Status.REPEATED)
        original_matricule = self.student.user.matricule

        promote_response = self.client.post('/api/v1/students/students/bulk-promote-selected/', {
            'academic_year': '2026-2027',
            'promotion_ids': [str(record.id)],
        }, format='json')

        self.assertEqual(promote_response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.student.user.refresh_from_db()
        record.refresh_from_db()
        self.assertEqual(self.student.school_class_id, self.form_two.id)
        self.assertEqual(self.student.student_class, 'Form 2 A')
        self.assertEqual(self.student.user.matricule, original_matricule)
        self.assertEqual(record.status, StudentPromotionRecord.Status.PROMOTED)

    def test_admin_can_set_class_specific_promotion_average(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post('/api/v1/students/students/recalculate-promotions/', {
            'academic_year': '2026-2027',
            'class_id': str(self.form_one.id),
            'promotion_average': 8,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        policy = ClassPromotionPolicy.objects.get(school_class=self.form_one, academic_year='2026-2027')
        self.assertEqual(policy.promotion_average, 8)
        record = StudentPromotionRecord.objects.get(student=self.student, academic_year='2026-2027')
        self.assertEqual(record.promotion_average, 8)
        self.assertEqual(record.status, StudentPromotionRecord.Status.PROMOTED)

    def test_promoted_student_can_view_previous_class_archive(self):
        teacher = User.objects.create_user(
            matricule='TEA-PROMO-001',
            name='History Teacher',
            email='teacher.history@example.com',
            role='TEACHER',
            school=self.school,
            password='password123',
        )
        subject = Subject.objects.create(
            school=self.school,
            name='Mathematics',
            code='MATH-HIST',
            level='Form 1',
            coefficient=5,
            teacher=teacher,
        )
        ClassSubject.objects.create(
            school_class=self.form_one,
            subject=subject,
            teacher=teacher,
            type=ClassSubject.SubjectType.MANDATORY,
        )
        sequence = Sequence.objects.create(
            school=self.school,
            academic_year='2026-2027',
            name='Sequence 1',
            term=1,
            start_date='2026-09-01',
            end_date='2026-10-31',
            is_active=True,
        )
        Grade.objects.create(
            student=self.student,
            subject=subject,
            sequence=sequence,
            school=self.school,
            teacher=teacher,
            score=14,
        )
        session = AttendanceSession.objects.create(
            school=self.school,
            teacher=teacher,
            school_class=self.form_one,
            student_class='Form 1 A',
            date=date(2026, 9, 15),
            period='morning',
            subject=subject,
        )
        AttendanceRecord.objects.create(session=session, student=self.student, status='present')

        self.client.force_authenticate(self.admin)
        recalc_response = self.client.post('/api/v1/students/students/recalculate-promotions/', {
            'academic_year': '2026-2027',
            'promotion_average': 10,
        }, format='json')
        self.assertEqual(recalc_response.status_code, status.HTTP_200_OK)
        record = StudentPromotionRecord.objects.get(student=self.student, academic_year='2026-2027')
        promote_response = self.client.post('/api/v1/students/students/bulk-promote-selected/', {
            'academic_year': '2026-2027',
            'promotion_ids': [str(record.id)],
        }, format='json')
        self.assertEqual(promote_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.student_user)
        response = self.client.get('/api/v1/students/students/my_class_history/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['current_class']['name'], 'Form 2 A')
        self.assertEqual(response.data['history'][0]['class_name'], 'Form 1 A')
        self.assertEqual(response.data['history'][0]['subjects'][0]['subject_name'], 'Mathematics')
        self.assertEqual(response.data['history'][0]['attendance']['present'], 1)

import base64

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.schools.models import School, SchoolClass, SchoolSettings
from apps.students.models import ParentStudentLink, Student
from .models import ClassSubject, Grade, ReportCardPublication, Sequence, Subject, SubjectMaterial, TermResult
from .sequence_defaults import ensure_cameroon_sequences_for_school


User = get_user_model()


class CameroonCalendarConfigurationTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='CAL-TEST',
            name='Calendar Test Secondary School',
            short_name='CTSS',
            principal='Calendar Principal',
            location='Bamenda',
            email='calendar@example.com',
            phone='237651000112',
            school_type='general',
            subsystem='anglophone',
        )
        self.admin = User.objects.create_user(
            matricule='CAL-ADMIN-001',
            name='Calendar Admin',
            email='calendar.admin@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )

    def _valid_payload(self):
        return {
            'academic_year': '2026-2027',
            'current_term': 1,
            'sequences': [
                {'name': 'Sequence 1', 'term': 1, 'start_date': '2026-09-01', 'end_date': '2026-10-31', 'is_active': True},
                {'name': 'Sequence 2', 'term': 1, 'start_date': '2026-11-01', 'end_date': '2026-12-20', 'is_active': False},
                {'name': 'Sequence 3', 'term': 2, 'start_date': '2027-01-05', 'end_date': '2027-02-15', 'is_active': False},
                {'name': 'Sequence 4', 'term': 2, 'start_date': '2027-02-16', 'end_date': '2027-03-31', 'is_active': False},
                {'name': 'Sequence 5', 'term': 3, 'start_date': '2027-04-01', 'end_date': '2027-05-15', 'is_active': False},
                {'name': 'Sequence 6', 'term': 3, 'start_date': '2027-05-16', 'end_date': '2027-06-30', 'is_active': False},
            ],
        }

    def test_school_admin_configures_cameroon_calendar(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            '/api/v1/grades/sequences/configure-cameroon-calendar/',
            self._valid_payload(),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Sequence.objects.filter(school=self.school, academic_year='2026-2027').count(), 6)
        settings = SchoolSettings.objects.get(school=self.school)
        self.assertEqual(settings.academic_year, '2026-2027')
        self.assertEqual(settings.term, 'First')
        self.assertEqual(
            Sequence.objects.get(school=self.school, academic_year='2026-2027', is_active=True).name,
            'Sequence 1',
        )

    def test_school_settings_calendar_endpoint_configures_cameroon_calendar(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f'/api/v1/schools/settings/{self.school.id}/calendar/',
            self._valid_payload(),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['academic_year'], '2026-2027')
        self.assertEqual(Sequence.objects.filter(school=self.school, academic_year='2026-2027').count(), 6)

    def test_calendar_configuration_rejects_incomplete_sequence_set(self):
        self.client.force_authenticate(self.admin)
        payload = self._valid_payload()
        payload['sequences'] = payload['sequences'][:5]

        response = self.client.post(
            '/api/v1/grades/sequences/configure-cameroon-calendar/',
            payload,
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('sequences', response.data)

    def test_teacher_sheet_calendar_helper_completes_partial_calendar(self):
        SchoolSettings.objects.create(
            school=self.school,
            academic_year='2026-2027',
            term='First',
        )
        Sequence.objects.create(
            school=self.school,
            academic_year='2026-2027',
            name='Sequence 1',
            term=1,
            start_date='2026-09-01',
            end_date='2026-10-31',
            is_active=True,
        )

        created = ensure_cameroon_sequences_for_school(self.school)

        self.assertEqual(created, 5)
        self.assertEqual(Sequence.objects.filter(school=self.school, academic_year='2026-2027').count(), 6)
        self.assertEqual(Sequence.objects.filter(school=self.school, academic_year='2026-2027', is_active=True).count(), 1)


class TeacherMarkSubmissionTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='MARK-TEST',
            name='Mark Test Secondary School',
            short_name='MTSS',
            principal='Marks Principal',
            location='Yaounde',
            email='marks@example.com',
            phone='237651000113',
            school_type='general',
            subsystem='anglophone',
        )
        SchoolSettings.objects.create(
            school=self.school,
            academic_year='2026-2027',
            term='First',
        )
        self.school_class = SchoolClass.objects.create(
            school=self.school,
            name='Form 1 A',
        )
        self.teacher = User.objects.create_user(
            matricule='MARK-TE-001',
            name='Teacher Marks',
            email='teacher.marks@example.com',
            role='TEACHER',
            school=self.school,
            password='password123',
        )
        self.admin = User.objects.create_user(
            matricule='MARK-ADMIN-001',
            name='Academic Admin',
            email='academic.admin@example.com',
            role='SCHOOL_ADMIN',
            school=self.school,
            password='password123',
        )
        self.student_user = User.objects.create_user(
            matricule='MARK-ST-0001',
            name='Student Marks',
            email='student.marks@example.com',
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
            admission_number='MARK-ADM-001',
        )
        self.subject = Subject.objects.create(
            school=self.school,
            name='Mathematics',
            code='MATH',
            level='Form 1',
            coefficient=5,
            teacher=self.teacher,
        )
        self.class_subject = ClassSubject.objects.create(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            type=ClassSubject.SubjectType.MANDATORY,
        )
        self.sequence = Sequence.objects.create(
            school=self.school,
            academic_year='2026-2027',
            name='Sequence 1',
            term=1,
            start_date='2026-09-01',
            end_date='2026-10-31',
            is_active=True,
        )

    def test_teacher_bulk_submit_upserts_marks_and_updates_report_card(self):
        self.client.force_authenticate(self.teacher)
        payload = {
            'sequence_id': str(self.sequence.id),
            'class_subject_id': str(self.class_subject.id),
            'grades': [
                {
                    'student': str(self.student.id),
                    'subject': str(self.subject.id),
                    'sequence': str(self.sequence.id),
                    'score': 12,
                    'comment': 'Good start',
                },
            ],
        }

        create_response = self.client.post('/api/v1/grades/grades/bulk_create/', payload, format='json')
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Grade.objects.get(student=self.student, subject=self.subject, sequence=self.sequence).score, 12)

        payload['grades'][0]['score'] = 16
        payload['grades'][0]['comment'] = 'Very good'
        update_response = self.client.post('/api/v1/grades/grades/bulk_create/', payload, format='json')
        self.assertEqual(update_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Grade.objects.filter(student=self.student, subject=self.subject, sequence=self.sequence).count(), 1)

        report_response = self.client.get(
            f'/api/v1/grades/grades/report_card/?student_id={self.student.id}&sequence_id={self.sequence.id}'
        )
        self.assertEqual(report_response.status_code, status.HTTP_200_OK)
        self.assertEqual(report_response.data['average'], 16.0)
        self.assertEqual(report_response.data['rank'], 1)

    def test_teacher_grade_sheet_exact_frontend_url_loads(self):
        self.client.force_authenticate(self.teacher)

        response = self.client.get('/api/v1/grades/grades/teacher_grade_sheet/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['selected_class_subject_id'], str(self.class_subject.id))
        self.assertEqual(response.data['summary']['total_students'], 1)

    def test_teacher_cannot_submit_marks_for_inactive_term(self):
        inactive_sequence = Sequence.objects.create(
            school=self.school,
            academic_year='2026-2027',
            name='Sequence 3',
            term=2,
            start_date='2027-01-05',
            end_date='2027-02-15',
            is_active=False,
        )
        self.client.force_authenticate(self.teacher)

        response = self.client.post(
            '/api/v1/grades/grades/bulk_create/',
            {
                'sequence_id': str(inactive_sequence.id),
                'class_subject_id': str(self.class_subject.id),
                'grades': [
                    {
                        'student': str(self.student.id),
                        'subject': str(self.subject.id),
                        'sequence': str(inactive_sequence.id),
                        'score': 14,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Grade.objects.filter(student=self.student, sequence=inactive_sequence).exists())

    def test_teacher_can_submit_when_active_sequence_term_differs_from_stale_school_setting(self):
        second_term_sequence = Sequence.objects.create(
            school=self.school,
            academic_year='2026-2027',
            name='Sequence 3',
            term=2,
            start_date='2027-01-05',
            end_date='2027-02-15',
            is_active=True,
        )
        Sequence.objects.filter(id=self.sequence.id).update(is_active=False)
        self.client.force_authenticate(self.teacher)

        response = self.client.post(
            '/api/v1/grades/grades/bulk_create/',
            {
                'sequence_id': str(second_term_sequence.id),
                'class_subject_id': str(self.class_subject.id),
                'grades': [
                    {
                        'student': str(self.student.id),
                        'subject': str(self.subject.id),
                        'sequence': str(second_term_sequence.id),
                        'score': 15,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Grade.objects.filter(student=self.student, sequence=second_term_sequence, score=15).exists())

    def test_school_admin_class_statistics_use_live_grade_records(self):
        ClassSubject.objects.filter(school_class=self.school_class, subject=self.subject).update(teacher=None)
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=14,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get('/api/v1/grades/grades/class_statistics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['sequence']['id'], str(self.sequence.id))
        class_row = response.data['classes'][0]
        self.assertEqual(class_row['name'], 'Form 1 A')
        self.assertEqual(class_row['students'], 1)
        self.assertEqual(class_row['teachers'], 1)
        self.assertEqual(class_row['average_mark'], 14.0)
        self.assertEqual(class_row['performance'], 70)
        self.assertEqual(class_row['pass_rate'], 100)

    def test_school_admin_period_statistics_rank_real_term_marks(self):
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=14,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            '/api/v1/grades/grades/period_statistics/?term=1&academic_year=2026-2027'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['ranked_students'], 1)
        self.assertEqual(response.data['summary']['school_average'], 14.0)
        self.assertEqual(response.data['summary']['pass_rate'], 100)
        self.assertEqual(response.data['top_students'][0]['student_name'], 'Student Marks')
        self.assertEqual(response.data['classes'][0]['name'], 'Form 1 A')
        self.assertEqual(response.data['classes'][0]['average'], 14.0)

    def test_student_grade_list_defaults_to_current_academic_year(self):
        old_sequence = Sequence.objects.create(
            school=self.school,
            academic_year='2025-2026',
            name='Sequence 6',
            term=3,
            start_date='2026-05-01',
            end_date='2026-06-15',
            is_active=False,
        )
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=old_sequence,
            school=self.school,
            teacher=self.teacher,
            score=9,
        )
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=14,
        )
        self.client.force_authenticate(self.student_user)

        current_response = self.client.get('/api/v1/grades/grades/')
        history_response = self.client.get('/api/v1/grades/grades/?include_history=true')

        current_results = current_response.data['results'] if isinstance(current_response.data, dict) else current_response.data
        history_results = history_response.data['results'] if isinstance(history_response.data, dict) else history_response.data
        self.assertEqual(current_response.status_code, status.HTTP_200_OK)
        self.assertEqual(history_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(current_results), 1)
        self.assertEqual(float(current_results[0]['score']), 14.0)
        self.assertEqual(len(history_results), 2)

    def test_student_grade_list_defaults_to_current_class_after_promotion(self):
        promoted_class = SchoolClass.objects.create(
            school=self.school,
            name='Form 2 A',
        )
        old_subject = Subject.objects.create(
            school=self.school,
            name='History',
            code='HIST',
            level='Form 1',
            coefficient=2,
            teacher=self.teacher,
        )
        ClassSubject.objects.create(
            school_class=promoted_class,
            subject=self.subject,
            teacher=self.teacher,
            type=ClassSubject.SubjectType.MANDATORY,
        )
        Grade.objects.create(
            student=self.student,
            subject=old_subject,
            sequence=self.sequence,
            school=self.school,
            school_class=self.school_class,
            class_name_snapshot='Form 1 A',
            teacher=self.teacher,
            score=9,
        )
        self.student.school_class = promoted_class
        self.student.student_class = 'Form 2 A'
        self.student.class_level = 'Form 2'
        self.student.save(update_fields=['school_class', 'student_class', 'class_level'])
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            school_class=promoted_class,
            class_name_snapshot='Form 2 A',
            teacher=self.teacher,
            score=15,
        )
        self.client.force_authenticate(self.student_user)

        current_response = self.client.get('/api/v1/grades/grades/')
        history_response = self.client.get('/api/v1/grades/grades/?include_history=true')

        current_results = current_response.data['results'] if isinstance(current_response.data, dict) else current_response.data
        history_results = history_response.data['results'] if isinstance(history_response.data, dict) else history_response.data
        self.assertEqual(current_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(current_results), 1)
        self.assertEqual(current_results[0]['class_name_snapshot'], 'Form 2 A')
        self.assertEqual(float(current_results[0]['score']), 15.0)
        self.assertEqual(history_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(history_results), 2)

    def test_class_results_return_student_ids_for_admin_report_generation(self):
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=13,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            f'/api/v1/grades/grades/class_results/?class_name=Form%201%20A&sequence_id={self.sequence.id}'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['student_id'], str(self.student.id))
        self.assertEqual(response.data[0]['average'], 13.0)

    def test_school_admin_generates_term_report_from_two_sequences(self):
        second_sequence = Sequence.objects.create(
            school=self.school,
            academic_year='2026-2027',
            name='Sequence 2',
            term=1,
            start_date='2026-11-01',
            end_date='2026-12-20',
            is_active=False,
        )
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=12,
        )
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=second_sequence,
            school=self.school,
            teacher=self.teacher,
            score=16,
        )
        self.client.force_authenticate(self.admin)

        report_response = self.client.get(
            f'/api/v1/grades/grades/report_card/?student_id={self.student.id}&term=1&academic_year=2026-2027'
        )
        class_response = self.client.get(
            '/api/v1/grades/grades/class_results/?class_name=Form%201%20A&term=1&academic_year=2026-2027'
        )

        self.assertEqual(report_response.status_code, status.HTTP_200_OK)
        self.assertEqual(report_response.data['sequence']['type'], 'TERM')
        self.assertEqual(report_response.data['average'], 14.0)
        self.assertEqual(report_response.data['rank'], 1)
        self.assertEqual(len(report_response.data['grades'][0]['sequence_scores']), 2)
        self.assertEqual(class_response.status_code, status.HTTP_200_OK)
        self.assertEqual(class_response.data[0]['student_id'], str(self.student.id))
        self.assertEqual(class_response.data[0]['average'], 14.0)
        self.assertEqual(class_response.data[0]['rank'], 1)

    def test_publish_report_cards_alias_releases_only_own_student_and_child_reports(self):
        second_user = User.objects.create_user(
            matricule='MARK-ST-0002',
            name='Other Student Marks',
            email='other.student.marks@example.com',
            role='STUDENT',
            school=self.school,
            password='password123',
            is_license_paid=True,
        )
        second_student = Student.objects.create(
            user=second_user,
            school=self.school,
            school_class=self.school_class,
            student_class='Form 1 A',
            class_level='Form 1',
            section='General',
            admission_number='MARK-ADM-002',
        )
        parent = User.objects.create_user(
            matricule='MARK-PA-0001',
            name='Parent Marks',
            email='parent.marks@example.com',
            role='PARENT',
            school=self.school,
            password='password123',
        )
        ParentStudentLink.objects.create(
            parent=parent,
            student=self.student,
            relationship='father',
            is_primary=True,
        )
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=15,
        )
        Grade.objects.create(
            student=second_student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=11,
        )

        self.client.force_authenticate(self.student_user)
        hidden_response = self.client.get(
            f'/api/v1/grades/grades/report_card/?student_id={self.student.id}&sequence_id={self.sequence.id}'
        )
        self.assertEqual(hidden_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        publish_response = self.client.post(
            '/api/v1/grades/grades/report-cards/publish/',
            {
                'class_id': str(self.school_class.id),
                'class_name': 'Form 1 A',
                'scope': 'SEQUENCE',
                'sequence_id': str(self.sequence.id),
            },
            format='json',
        )
        self.assertEqual(publish_response.status_code, status.HTTP_200_OK)
        self.assertEqual(publish_response.data['students_with_marks'], 2)
        alias_payload = {
            'class_id': str(self.school_class.id),
            'class_name': 'Form 1 A',
            'scope': 'SEQUENCE',
            'sequence_id': str(self.sequence.id),
        }
        publish_aliases = [
            '/api/v1/grades/publish-report-cards',
            '/api/v1/grades/publish-report-cards/',
            '/api/v1/grades/publish_report_cards/',
            '/api/v1/grades/report-cards/publish/',
            '/api/v1/grades/report_cards/publish/',
            '/api/v1/grades/grades/publish-report-cards',
            '/api/v1/grades/grades/publish-report-cards/',
            '/api/v1/grades/grades/publish_report_cards/',
            '/api/v1/grades/grades/report-cards/publish/',
            '/api/v1/grades/grades/report_cards/publish/',
        ]
        for alias in publish_aliases:
            with self.subTest(alias=alias):
                short_alias_response = self.client.post(alias, alias_payload, format='json')
                self.assertEqual(short_alias_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            ReportCardPublication.objects.filter(
                school=self.school,
                school_class=self.school_class,
                sequence=self.sequence,
                is_published=True,
            ).exists()
        )

        self.client.force_authenticate(self.student_user)
        own_response = self.client.get(
            f'/api/v1/grades/grades/report_card/?student_id={self.student.id}&sequence_id={self.sequence.id}'
        )
        other_response = self.client.get(
            f'/api/v1/grades/grades/report_card/?student_id={second_student.id}&sequence_id={self.sequence.id}'
        )
        self.assertEqual(own_response.status_code, status.HTTP_200_OK)
        self.assertEqual(other_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(parent)
        child_response = self.client.get(
            f'/api/v1/grades/grades/report_card/?student_id={self.student.id}&sequence_id={self.sequence.id}'
        )
        unrelated_child_response = self.client.get(
            f'/api/v1/grades/grades/report_card/?student_id={second_student.id}&sequence_id={self.sequence.id}'
        )
        self.assertEqual(child_response.status_code, status.HTTP_200_OK)
        self.assertEqual(unrelated_child_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_publish_report_cards_skips_unpaid_students_without_blocking_paid_classmates(self):
        unpaid_user = User.objects.create_user(
            matricule='MARK-ST-LOCKED',
            name='Locked Student Marks',
            email='locked.student.marks@example.com',
            role='STUDENT',
            school=self.school,
            password='password123',
            is_license_paid=False,
        )
        unpaid_student = Student.objects.create(
            user=unpaid_user,
            school=self.school,
            school_class=self.school_class,
            student_class='Form 1 A',
            class_level='Form 1',
            section='General',
            admission_number='MARK-ADM-LOCKED',
        )
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=15,
        )
        Grade.objects.create(
            student=unpaid_student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=18,
        )

        self.client.force_authenticate(self.admin)
        publish_response = self.client.post(
            '/api/v1/grades/grades/report-cards/publish/',
            {
                'class_id': str(self.school_class.id),
                'class_name': 'Form 1 A',
                'scope': 'SEQUENCE',
                'sequence_id': str(self.sequence.id),
            },
            format='json',
        )

        self.assertEqual(publish_response.status_code, status.HTTP_200_OK)
        self.assertEqual(publish_response.data['students_with_marks'], 1)
        self.assertEqual(publish_response.data['locked_students_count'], 1)

        self.client.force_authenticate(self.student_user)
        paid_response = self.client.get(
            f'/api/v1/grades/grades/report_card/?student_id={self.student.id}&sequence_id={self.sequence.id}'
        )
        self.assertEqual(paid_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(unpaid_user)
        locked_response = self.client.get(
            f'/api/v1/grades/grades/report_card/?student_id={unpaid_student.id}&sequence_id={self.sequence.id}'
        )
        self.assertEqual(locked_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_honour_roll_alias_uses_school_reward_threshold_and_live_marks(self):
        SchoolSettings.objects.filter(school=self.school).update(honour_roll_threshold=16)
        second_user = User.objects.create_user(
            matricule='MARK-ST-0003',
            name='Reward Student',
            email='reward.student@example.com',
            role='STUDENT',
            school=self.school,
            password='password123',
            is_license_paid=True,
        )
        second_student = Student.objects.create(
            user=second_user,
            school=self.school,
            school_class=self.school_class,
            student_class='Form 1 A',
            class_level='Form 1',
            section='General',
            admission_number='MARK-ADM-003',
        )
        Grade.objects.create(
            student=self.student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=15,
        )
        Grade.objects.create(
            student=second_student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=17,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            f'/api/v1/grades/grades/rewards/honour-roll/?sequence_id={self.sequence.id}'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['threshold'], 16.0)
        self.assertEqual(response.data['summary']['eligible'], 1)
        self.assertEqual(response.data['summary']['total_ranked'], 2)
        self.assertEqual(response.data['summary']['class_average'], 16.0)
        self.assertEqual(response.data['summary']['pass_rate'], 100)
        self.assertEqual(response.data['results'][0]['name'], 'Reward Student')

    def test_class_statistics_include_legacy_student_class_names(self):
        legacy_user = User.objects.create_user(
            matricule='MARK-ST-0002',
            name='Legacy Student',
            email='legacy.student@example.com',
            role='STUDENT',
            school=self.school,
            password='password123',
            is_license_paid=True,
        )
        legacy_student = Student.objects.create(
            user=legacy_user,
            school=self.school,
            school_class=None,
            student_class='Form 2 Legacy',
            class_level='Form 2',
            section='General',
            admission_number='MARK-ADM-002',
        )
        Grade.objects.create(
            student=legacy_student,
            subject=self.subject,
            sequence=self.sequence,
            school=self.school,
            teacher=self.teacher,
            score=11,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get('/api/v1/grades/grades/class_statistics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        legacy_row = next(row for row in response.data['classes'] if row['name'] == 'Form 2 Legacy')
        self.assertEqual(legacy_row['students'], 1)
        self.assertEqual(legacy_row['average_mark'], 11.0)
        self.assertEqual(legacy_row['performance'], 55)


class TermResultCrossSchoolTests(APITestCase):
    """Regression test: TermResultSerializer/AnnualResultSerializer used to
    accept a client-supplied 'school' and an unscoped 'student' PK, letting a
    School A admin forge a term result for a School B student. 'school' is
    now always derived server-side from the student, and student/school
    mismatch is rejected."""

    def setUp(self):
        self.school_a = School.objects.create(
            id='XT-A', name='Cross Test School A', short_name='XTA', principal='P',
            location='Douala', email='xt-a@example.com', phone='237651000201',
            school_type='general', subsystem='anglophone',
        )
        self.school_b = School.objects.create(
            id='XT-B', name='Cross Test School B', short_name='XTB', principal='P',
            location='Douala', email='xt-b@example.com', phone='237651000202',
            school_type='general', subsystem='anglophone',
        )
        self.admin_a = User.objects.create_user(
            matricule='XT-A-ADMIN', name='Admin A', email='admin.a@example.com',
            role='SCHOOL_ADMIN', school=self.school_a, password='password123',
        )
        student_b_user = User.objects.create_user(
            matricule='XT-B-STU-001', name='Student B', email='student.b@example.com',
            role='STUDENT', school=self.school_b, password='password123', is_license_paid=True,
        )
        self.student_b = Student.objects.create(
            user=student_b_user, school=self.school_b, student_class='Form 1 A',
            class_level='Form 1', section='General', admission_number='XT-B-ADM-001',
        )

    def test_school_admin_cannot_forge_term_result_for_another_schools_student(self):
        self.client.force_authenticate(self.admin_a)

        response = self.client.post(
            '/api/v1/grades/term-results/',
            {
                'student': str(self.student_b.id),
                'school': str(self.school_a.id),
                'academic_year': '2026-2027',
                'term': 1,
                'average': 18,
                'is_promoted': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(TermResult.objects.filter(student=self.student_b).exists())

    def test_term_result_school_is_always_derived_from_creating_admin(self):
        student_a_user = User.objects.create_user(
            matricule='XT-A-STU-001', name='Student A', email='student.a@example.com',
            role='STUDENT', school=self.school_a, password='password123', is_license_paid=True,
        )
        student_a = Student.objects.create(
            user=student_a_user, school=self.school_a, student_class='Form 1 A',
            class_level='Form 1', section='General', admission_number='XT-A-ADM-001',
        )
        self.client.force_authenticate(self.admin_a)

        response = self.client.post(
            '/api/v1/grades/term-results/',
            {
                'student': str(student_a.id),
                'school': str(self.school_b.id),
                'academic_year': '2026-2027',
                'term': 1,
                'average': 15,
                'is_promoted': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TermResult.objects.get(student=student_a).school_id, self.school_a.id)

    def test_student_cannot_patch_own_term_result(self):
        result = TermResult.objects.create(
            student=self.student_b, school=self.school_b, academic_year='2026-2027',
            term=1, average=10, is_promoted=False,
        )
        self.client.force_authenticate(self.student_b.user)

        response = self.client.patch(
            f'/api/v1/grades/term-results/{result.id}/',
            {'is_promoted': True, 'average': 19},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        result.refresh_from_db()
        self.assertFalse(result.is_promoted)
        self.assertEqual(float(result.average), 10.0)


class SubjectMaterialStudentAccessTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='MAT-TEST',
            name='Material Test Secondary School',
            short_name='MTSS',
            principal='Principal Test',
            location='Buea',
            email='materials@example.com',
            phone='237651000111',
            school_type='general',
            subsystem='anglophone',
        )
        self.school_class = SchoolClass.objects.create(
            school=self.school,
            name='Form 3A',
        )
        self.teacher = User.objects.create_user(
            matricule='TCH-MAT-001',
            name='Teacher Materials',
            email='teacher.materials@example.com',
            role='TEACHER',
            school=self.school,
            password='password123',
        )
        self.student_user = User.objects.create_user(
            matricule='STU-MAT-001',
            name='Student Materials',
            email='student.materials@example.com',
            role='STUDENT',
            school=self.school,
            password='password123',
            is_license_paid=True,
        )
        self.student = Student.objects.create(
            user=self.student_user,
            school=self.school,
            school_class=self.school_class,
            student_class='Form 3A',
            class_level='Form 3',
            section='General',
            admission_number='ADM-MAT-001',
        )
        self.subject = Subject.objects.create(
            school=self.school,
            name='Mathematics',
            code='MATH-F3',
            level='Form 3',
            teacher=self.teacher,
        )
        ClassSubject.objects.create(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            type=ClassSubject.SubjectType.MANDATORY,
        )
        self.material = SubjectMaterial.objects.create(
            school=self.school,
            subject=self.subject,
            title='Algebra Notes',
            material_type=SubjectMaterial.MaterialType.PDF,
            file_name='algebra-notes.pdf',
            mime_type='application/pdf',
            file_size_bytes=7,
            file_data=f"data:application/pdf;base64,{base64.b64encode(b'PDFDATA').decode('utf-8')}",
            uploaded_by=self.teacher,
        )

    def test_student_can_list_teacher_uploaded_material_for_enrolled_subject(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.get('/api/v1/grades/materials/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['title'], 'Algebra Notes')
        self.assertEqual(response.data['results'][0]['subject_name'], 'Mathematics')

    def test_student_can_download_teacher_uploaded_material(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.get(f'/api/v1/grades/materials/{self.material.id}/download/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.content, b'PDFDATA')
        self.assertIn('attachment', response['Content-Disposition'])

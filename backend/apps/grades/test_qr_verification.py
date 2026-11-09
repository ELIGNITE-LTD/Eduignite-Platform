"""Public QR verification for ID cards and report cards."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.schools.models import School, SchoolClass, SchoolSettings
from apps.students.models import Student
from .models import Grade, Sequence, Subject, ClassSubject

User = get_user_model()


def _school(sid, name, matricule):
    school = School.objects.create(
        id=sid, name=name, short_name=sid, principal='P', location='Yaounde',
        email=f'{sid}@example.com', phone='237651000113',
        school_type='general', subsystem='anglophone', matricule=matricule,
    )
    SchoolSettings.objects.create(school=school, academic_year='2026/2027', term='First')
    return school


def _student(school, n, adm):
    klass = SchoolClass.objects.create(school=school, name='Form 1 A')
    user = User.objects.create_user(
        matricule=f'{school.matricule}ST{n:04d}', name=f'Pupil {school.id}',
        email=f'p{school.id}@example.com', role='STUDENT', school=school,
        password='password123', is_license_paid=True,
    )
    return Student.objects.create(
        user=user, school=school, school_class=klass, student_class='Form 1 A',
        class_level='Form 1', section='General', admission_number=adm,
    )


class PublicVerificationTests(APITestCase):
    def setUp(self):
        self.school_a = _school('QRA', 'Alpha College', 'ALPHA01')
        self.school_b = _school('QRB', 'Beta College', 'BETA01')
        # Admission numbers are only unique per school: both schools issue "0001".
        self.stu_a = _student(self.school_a, 1, '0001')
        self.stu_b = _student(self.school_b, 1, '0001')
        subj = Subject.objects.create(school=self.school_a, name='Maths', code='M', level='Form 1', coefficient=2)
        ClassSubject.objects.create(school_class=self.stu_a.school_class, subject=subj,
                                    type=ClassSubject.SubjectType.MANDATORY)
        self.seq = Sequence.objects.create(
            school=self.school_a, academic_year='2026/2027', name='Sequence 1', term=1,
            start_date='2026-09-01', end_date='2026-10-31', is_active=True,
        )
        Grade.objects.create(student=self.stu_a, subject=subj, sequence=self.seq, score=15)

    def test_id_card_verify_with_shared_admission_number(self):
        r = self.client.get(f'/api/v1/students/students/verify/0001/?school={self.school_b.matricule}')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['school_name'], 'Beta College')

    def test_id_card_verify_ambiguous_without_school_is_not_a_500(self):
        r = self.client.get('/api/v1/students/students/verify/0001/')
        self.assertEqual(r.status_code, 409, r.content)

    def test_report_card_verify_route_is_reachable(self):
        url = (f'/api/v1/grades/grades/verify-report-card/0001/2026-2027/seq-{self.seq.id}/'
               f'?school={self.school_a.matricule}')
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.data['valid'])
        # The public answer is minimal: header facts only, never the marks.
        self.assertEqual(r.data['result'], 'valid')
        self.assertNotIn('grades', r.data)
        self.assertNotIn('details', r.data)
        self.assertEqual(r.data['detail_level'], 'header')

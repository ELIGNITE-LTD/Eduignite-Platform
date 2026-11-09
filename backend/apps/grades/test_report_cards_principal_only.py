"""Only the principal side generates report cards (all school levels).

Teachers (class or subject teachers) keep entering marks and can still read
their class performance summaries, but every endpoint that renders a printable
card, PDF or transcript refuses them with 403. Students and parents keep their
PUBLISHED card (the parent path is also covered in grades/tests.py).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.schools.models import ClassTeacherAssignment, SchoolClass

from .models import ClassSubject, Grade, Sequence, Subject
from .test_class_marks import make_pupil, make_school, make_teacher

User = get_user_model()
CARD = '/api/v1/grades/grades/report_card/'
PDF = '/api/v1/grades/grades/report-card-pdf/'
TRANSCRIPT = '/api/v1/grades/grades/transcript/'
CLASS_RESULTS = '/api/v1/grades/grades/class_results/'
PUBLISH = '/api/v1/grades/grades/report-cards/publish/'
MARKS = '/api/v1/grades/class-marks/'


def make_staff(school, role, tag):
    return User.objects.create_user(
        matricule=f'{school.id}-{tag}', name=f'{role} {tag}', email=f'{school.id}{tag}@example.com'.lower(),
        role=role, school=school, password='password123',
    )


class PrincipalOnlyBase(APITestCase):
    category = 'basic'
    sid = 'RC-BAS'

    def setUp(self):
        self.school = make_school(self.sid, self.category)
        self.klass = SchoolClass.objects.create(school=self.school, name='Class 2 A')
        self.other_class = SchoolClass.objects.create(school=self.school, name='Class 3 A')
        self.class_teacher = make_teacher(self.school, 'CT')
        self.subject_teacher = make_teacher(self.school, 'ST')
        ClassTeacherAssignment.objects.create(school_class=self.klass, teacher=self.class_teacher)
        self.math = Subject.objects.create(school=self.school, name='Mathematics', code='MATH', level='2', coefficient=2)
        link = ClassSubject.objects.create(school_class=self.klass, subject=self.math, teacher=self.subject_teacher)
        self.link = link
        self.student_user = User.objects.create_user(
            matricule=f'{self.sid}-STU', name='Pupil With Login', email=f'{self.sid}stu@example.com'.lower(),
            role='STUDENT', school=self.school, password='password123', is_license_paid=True,
        )
        self.pupil = make_pupil(self.school, self.klass, 'Pupil With Login', 1, user=self.student_user)
        self.other_pupil = make_pupil(self.school, self.klass, 'Another Pupil', 2)
        self.seq = Sequence.objects.filter(school=self.school, term=1).order_by('start_date').first()
        for p, score in ((self.pupil, 14), (self.other_pupil, 11)):
            Grade.objects.create(
                school=self.school, student=p, subject=self.math, sequence=self.seq,
                school_class=self.klass, class_name_snapshot=self.klass.name,
                score=Decimal(score), teacher=self.subject_teacher,
            )
        self.principal = make_staff(self.school, 'SCHOOL_ADMIN', 'PR')

    def get(self, user, url, pupil=None):
        self.client.force_authenticate(user)
        return self.client.get(url, {'student_id': str((pupil or self.pupil).id), 'sequence_id': str(self.seq.id)})


class TeacherDeniedEverywhereTests(PrincipalOnlyBase):
    def test_class_teacher_denied_card_pdf_transcript(self):
        for url in (CARD, PDF, TRANSCRIPT):
            with self.subTest(url=url):
                response = self.get(self.class_teacher, url)
                self.assertEqual(response.status_code, 403)
                self.assertNotIn('grades', getattr(response, 'data', {}) or {})

    def test_subject_teacher_denied_card_pdf_transcript(self):
        for url in (CARD, PDF, TRANSCRIPT):
            with self.subTest(url=url):
                self.assertEqual(self.get(self.subject_teacher, url).status_code, 403)

    def test_teacher_denied_term_card_too(self):
        self.client.force_authenticate(self.class_teacher)
        response = self.client.get(CARD, {'student_id': str(self.pupil.id), 'term': 1, 'academic_year': '2026-2027'})
        self.assertEqual(response.status_code, 403)

    def test_denied_even_without_valid_params(self):
        self.client.force_authenticate(self.class_teacher)
        self.assertEqual(self.client.get(CARD).status_code, 403)
        self.assertEqual(self.client.get(PDF).status_code, 403)

    def test_message_is_friendly(self):
        response = self.get(self.class_teacher, CARD)
        self.assertIn('principal', str(response.data.get('message')).lower())

    def test_teacher_cannot_publish(self):
        self.client.force_authenticate(self.class_teacher)
        response = self.client.post(PUBLISH, {
            'class_id': str(self.klass.id), 'class_name': self.klass.name,
            'scope': 'SEQUENCE', 'sequence_id': str(self.seq.id),
        }, format='json')
        self.assertEqual(response.status_code, 403)


class PrincipalAndFamilyStillWorkTests(PrincipalOnlyBase):
    def test_principal_gets_card_and_pdf_route_is_not_denied(self):
        response = self.get(self.principal, CARD)
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        self.assertEqual(len(response.data['grades']), 1)
        self.assertNotEqual(self.get(self.principal, PDF).status_code, 403)

    def test_principal_of_another_school_is_isolated(self):
        other = make_school('RC-OTH', self.category)
        stranger = make_staff(other, 'SCHOOL_ADMIN', 'PR2')
        self.assertEqual(self.get(stranger, CARD).status_code, 403)

    def test_student_sees_own_card_only_after_publication(self):
        self.assertEqual(self.get(self.student_user, CARD).status_code, 403)
        self.client.force_authenticate(self.principal)
        published = self.client.post(PUBLISH, {
            'class_id': str(self.klass.id), 'class_name': self.klass.name,
            'scope': 'SEQUENCE', 'sequence_id': str(self.seq.id),
        }, format='json')
        self.assertEqual(published.status_code, 200, published.data)
        self.assertEqual(self.get(self.student_user, CARD).status_code, 200)
        self.assertEqual(self.get(self.student_user, CARD, pupil=self.other_pupil).status_code, 403)


class TeacherKeepsMarksAndSummariesTests(PrincipalOnlyBase):
    def test_class_teacher_can_still_open_class_marks_grid(self):
        self.client.force_authenticate(self.class_teacher)
        response = self.client.get(MARKS, {'class_id': str(self.klass.id)})
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))

    def test_subject_teacher_can_still_read_class_results_summary(self):
        self.client.force_authenticate(self.subject_teacher)
        response = self.client.get(CLASS_RESULTS, {
            'class_name': self.klass.name, 'sequence_id': str(self.seq.id),
        })
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        self.assertTrue(all(row['teacher_limited'] for row in response.data))


class SecondarySchoolTeacherAlsoDeniedTests(PrincipalOnlyBase):
    category = 'secondary'
    sid = 'RC-SEC'

    def test_teacher_denied_and_principal_allowed_in_secondary(self):
        self.assertEqual(self.get(self.subject_teacher, CARD).status_code, 403)
        self.assertEqual(self.get(self.principal, CARD).status_code, 200)

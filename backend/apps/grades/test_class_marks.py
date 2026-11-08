"""Basic Education one-screen class marks grid (grades/class_marks.py)."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.registry import api as registry_api
from apps.schools.models import ClassTeacherAssignment, School, SchoolClass, SchoolSettings
from apps.students import api as students_api

from .models import ClassSubject, Grade, Sequence, Subject
from .utils import calculate_period_average

User = get_user_model()
GRID = '/api/v1/grades/class-marks/'
SAVE = '/api/v1/grades/class-marks/save/'


def make_school(sid, category='basic'):
    school = School.objects.create(
        id=sid, name=f'{sid} School', short_name=sid[:4], principal='Mme P', location='Douala',
        email=f'{sid.lower()}@example.com', phone='237651000400', school_type='general',
        subsystem='anglophone', education_category=category,
    )
    SchoolSettings.objects.create(school=school, academic_year='2026-2027', term='First')
    registry_api.install(school, 'grades', notify=False)
    for n, term in enumerate((1, 1, 2, 2, 3, 3), start=1):
        Sequence.objects.create(
            school=school, academic_year='2026-2027', name=f'Sequence {n}', term=term,
            start_date=date(2026, 9, n), end_date=date(2027, 6, 30), is_active=(term == 1),
        )
    return school


def make_teacher(school, tag):
    return User.objects.create_user(
        matricule=f'{school.id}-{tag}', name=f'Teacher {tag}', email=f'{school.id}{tag}@example.com'.lower(),
        role='TEACHER', school=school, password='password123',
    )


def make_pupil(school, klass, name, n, user=None):
    return students_api.enrol_student(
        user=user, name=name, matricule=f'{school.id}P{n:03d}', school=school, school_class=klass,
        student_class=klass.name, class_level=klass.name, section='English',
        admission_number=f'{school.id}-A{n}',
    )


class ClassMarksBase(APITestCase):
    def setUp(self):
        self.school = make_school('CM-ONE')
        self.klass = SchoolClass.objects.create(school=self.school, name='Class 3 A')
        self.other_class = SchoolClass.objects.create(school=self.school, name='Class 4 A')
        self.teacher = make_teacher(self.school, 'T1')
        ClassTeacherAssignment.objects.create(school_class=self.klass, teacher=self.teacher)
        self.math = Subject.objects.create(school=self.school, name='Mathematics', code='MATH', level='3', coefficient=3)
        self.eng = Subject.objects.create(school=self.school, name='English', code='ENG', level='3', coefficient=1)
        for subject in (self.math, self.eng):
            ClassSubject.objects.create(school_class=self.klass, subject=subject)
        self.ana = make_pupil(self.school, self.klass, 'Ana Loginless', 1)
        self.bob = make_pupil(self.school, self.klass, 'Bob Loginless', 2)
        self.cat = make_pupil(self.school, self.klass, 'Cat Loginless', 3)
        self.client.force_authenticate(self.teacher)

    def save(self, *cells, term=1, user=None, class_id=None):
        if user:
            self.client.force_authenticate(user)
        entries = [
            {'student': str(p.id), 'subject': str(s.id), 'field': f, 'score': v}
            for p, s, f, v in cells
        ]
        return self.client.post(
            SAVE, {'class_id': str(class_id or self.klass.id), 'term': term, 'entries': entries}, format='json'
        )

    def grid(self, **params):
        params.setdefault('class_id', str(self.klass.id))
        return self.client.get(GRID, params)

    @staticmethod
    def row(response, pupil):
        return next(r for r in response.data['grid']['students'] if r['id'] == str(pupil.id))


class ScopeTests(ClassMarksBase):
    def test_own_class_ok_and_lists_pupils_and_subjects(self):
        response = self.grid()
        self.assertEqual(response.status_code, 200, response.data)
        grid = response.data['grid']
        self.assertEqual([s['code'] for s in grid['subjects']], ['ENG', 'MATH'])
        self.assertEqual(len(grid['students']), 3)
        self.assertEqual(grid['ca_sequence']['name'], 'Sequence 1')
        self.assertEqual(grid['exam_sequence']['name'], 'Sequence 2')
        self.assertEqual(response.data['classes'], [{'id': str(self.klass.id), 'name': 'Class 3 A'}])

    def test_class_defaults_when_teacher_has_a_single_class(self):
        response = self.client.get(GRID)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['grid']['class']['id'], str(self.klass.id))

    def test_other_class_of_same_school_denied(self):
        self.assertEqual(self.grid(class_id=str(self.other_class.id)).status_code, 403)
        denied = self.save((self.ana, self.math, 'ca', 10), class_id=self.other_class.id)
        self.assertEqual(denied.status_code, 403)
        self.assertFalse(Grade.objects.exists())

    def test_class_of_other_school_denied(self):
        other = make_school('CM-TWO')
        foreign = SchoolClass.objects.create(school=other, name='Class 3 A')
        self.assertEqual(self.grid(class_id=str(foreign.id)).status_code, 403)
        self.assertEqual(self.save((self.ana, self.math, 'ca', 10), class_id=foreign.id).status_code, 403)

    def test_teacher_of_other_school_denied_on_our_class(self):
        other = make_school('CM-THREE')
        stranger = make_teacher(other, 'T9')
        self.client.force_authenticate(stranger)
        self.assertEqual(self.grid().status_code, 403)

    def test_unassigned_teacher_and_non_teachers_denied(self):
        plain = make_teacher(self.school, 'T2')
        self.client.force_authenticate(plain)
        self.assertEqual(self.grid().status_code, 403)
        admin = User.objects.create_user(
            matricule='CM-ONE-AD', name='Admin', email='cmad@example.com', role='SCHOOL_ADMIN',
            school=self.school, password='password123',
        )
        self.client.force_authenticate(admin)
        self.assertEqual(self.grid().status_code, 403)

    def test_secondary_school_unchanged(self):
        school = make_school('CM-SEC', 'secondary')
        klass = SchoolClass.objects.create(school=school, name='Form 1', class_master=None)
        teacher = make_teacher(school, 'T1')
        klass.class_master = teacher
        klass.save()
        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.get(GRID, {'class_id': str(klass.id)}).status_code, 403)

    def test_cannot_save_pupil_from_another_class(self):
        stranger = make_pupil(self.school, self.other_class, 'Stranger', 9)
        response = self.save((stranger, self.math, 'ca', 10))
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Grade.objects.exists())


class SaveReadTests(ClassMarksBase):
    def test_round_trip_maps_ca_and_exam_onto_existing_grade_rows(self):
        response = self.save((self.ana, self.math, 'ca', 14), (self.ana, self.math, 'exam', 16))
        self.assertEqual(response.status_code, 200, response.data)
        cell = self.row(self.grid(), self.ana)['marks'][str(self.math.id)]
        self.assertEqual((cell['ca'], cell['exam'], cell['average']), (14.0, 16.0, 15.0))
        ca = Grade.objects.get(student=self.ana, subject=self.math, sequence__name='Sequence 1')
        exam = Grade.objects.get(student=self.ana, subject=self.math, sequence__name='Sequence 2')
        self.assertEqual((ca.score, exam.score), (Decimal('14'), Decimal('16')))
        self.assertEqual(ca.teacher, self.teacher)
        self.assertEqual(ca.school_class, self.klass)

    def test_update_overwrites_and_blank_clears(self):
        self.save((self.ana, self.math, 'ca', 10))
        self.save((self.ana, self.math, 'ca', 12.5))
        self.assertEqual(Grade.objects.filter(student=self.ana).count(), 1)
        self.assertEqual(Grade.objects.get(student=self.ana).score, Decimal('12.50'))
        cleared = self.save((self.ana, self.math, 'ca', None))
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(Grade.objects.count(), 0)
        self.assertIsNone(self.row(cleared, self.ana)['average'])

    def test_above_max_and_negative_rejected_with_clear_message(self):
        for bad in (21, -1, 'abc'):
            response = self.save((self.ana, self.math, 'ca', bad))
            self.assertEqual(response.status_code, 400, bad)
        response = self.save((self.ana, self.math, 'ca', 20.5))
        self.assertIn('between 0 and 20', str(response.data))
        self.assertFalse(Grade.objects.exists())
        self.assertEqual(self.save((self.ana, self.math, 'ca', 20)).status_code, 200)

    def test_one_bad_row_saves_nothing(self):
        response = self.save((self.ana, self.math, 'ca', 10), (self.bob, self.math, 'ca', 99))
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Grade.objects.exists())

    def test_other_term_view_only_when_not_active(self):
        response = self.save((self.ana, self.math, 'ca', 10), term=2)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Grade.objects.exists())
        self.assertFalse(self.grid(term=2).data['grid']['can_edit'])
        self.assertTrue(self.grid(term=1).data['grid']['can_edit'])


class ComputationTests(ClassMarksBase):
    def test_coefficient_weighted_average_matches_existing_report_rule(self):
        # Maths coef 3: (12+16)/2 = 14 ; English coef 1: only CA 8.
        self.save(
            (self.ana, self.math, 'ca', 12), (self.ana, self.math, 'exam', 16),
            (self.ana, self.eng, 'ca', 8),
        )
        row = self.row(self.grid(), self.ana)
        self.assertEqual(row['average'], 12.5)  # (14*3 + 8*1) / 4
        self.assertEqual(row['grade'], 'C')
        sequences = Sequence.objects.filter(school=self.school, term=1)
        self.assertEqual(calculate_period_average(self.ana, sequences), Decimal('12.50'))

    def test_blank_subject_is_ignored_not_zero(self):
        self.save((self.ana, self.math, 'ca', 10))
        self.assertEqual(self.row(self.grid(), self.ana)['average'], 10.0)

    def test_ties_share_rank_and_next_rank_is_skipped(self):
        self.save(
            (self.ana, self.math, 'ca', 15), (self.bob, self.math, 'ca', 15), (self.cat, self.math, 'ca', 9),
        )
        response = self.grid()
        self.assertEqual(self.row(response, self.ana)['rank'], 1)
        self.assertEqual(self.row(response, self.bob)['rank'], 1)
        self.assertEqual(self.row(response, self.cat)['rank'], 3)
        self.assertEqual(response.data['grid']['class_average'], 13.0)

    def test_unmarked_pupil_has_no_rank(self):
        self.save((self.ana, self.math, 'ca', 15))
        response = self.grid()
        self.assertIsNone(self.row(response, self.bob)['rank'])
        self.assertIsNone(self.row(response, self.bob)['grade'])

    def test_save_response_carries_refreshed_ranks(self):
        self.save((self.ana, self.math, 'ca', 10))
        response = self.save((self.bob, self.math, 'ca', 18))
        self.assertEqual(self.row(response, self.bob)['rank'], 1)
        self.assertEqual(self.row(response, self.ana)['rank'], 2)


class LoginlessPupilTests(ClassMarksBase):
    def test_loginless_and_login_pupils_both_listed_and_saved(self):
        user = User.objects.create_user(
            matricule='CM-ONE-ST', name='Dee Withlogin', email='dee@example.com', role='STUDENT',
            school=self.school, password='password123',
        )
        dee = make_pupil(self.school, self.klass, '', 4, user=user)
        self.assertIsNone(self.ana.user_id)
        response = self.save((self.ana, self.math, 'ca', 11), (dee, self.math, 'ca', 13))
        self.assertEqual(response.status_code, 200, response.data)
        grid = self.grid()
        ana, dee_row = self.row(grid, self.ana), self.row(grid, dee)
        self.assertEqual(ana['name'], 'Ana Loginless')
        self.assertFalse(ana['has_login'])
        self.assertTrue(dee_row['has_login'])
        self.assertEqual((ana['average'], dee_row['average']), (11.0, 13.0))

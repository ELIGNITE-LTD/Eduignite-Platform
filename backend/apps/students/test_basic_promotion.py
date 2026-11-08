"""Year-end promotion ladder for Basic Education (nursery / primary)."""
from decimal import Decimal

from django.test import TestCase

from apps.schools.models import School, SchoolClass, SchoolSettings
from apps.students import api as students_api
from apps.students.models import StudentPromotionRecord
from apps.students.views import (
    _basic_class_stage,
    _build_promotion_record,
    _class_stage,
    _is_final_class,
    _next_class_for_student,
)


def _school(sid, category='basic'):
    school = School.objects.create(
        id=sid, name=f'{sid} School', short_name=sid[:4], principal='P', location='Douala',
        email=f'{sid.lower()}@example.com', phone='237651000400', school_type='general',
        subsystem='anglophone', education_category=category,
    )
    SchoolSettings.objects.create(school=school, academic_year='2026-2027')
    return school


def _pupil(school, klass, n):
    return students_api.enrol_student(
        user=None, name=f'Pupil {n}', matricule=f'{school.id}P{n:03d}', school=school,
        school_class=klass, student_class=klass.name, class_level=klass.name,
        section='General', admission_number=f'{school.id}-A{n}',
    )


class BasicStageParsingTests(TestCase):
    def test_names_map_to_stages(self):
        self.assertEqual(_basic_class_stage('Nursery 1')[0], 0)
        self.assertEqual(_basic_class_stage('Nursery 3')[0], 2)
        self.assertEqual(_basic_class_stage('Class 1')[0], 3)
        self.assertEqual(_basic_class_stage('Class 6')[0], 8)
        self.assertEqual(_basic_class_stage('Primary 4')[0], 6)
        self.assertEqual([_basic_class_stage(n)[0] for n in ('SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2')],
                         [3, 4, 5, 6, 7, 8])
        self.assertEqual(_basic_class_stage('Class 3 A'), (5, 'a'))

    def test_secondary_names_are_not_basic_stages(self):
        for name in ('Form 1', 'Lower Sixth', '6eme', 'Terminale'):
            self.assertIsNone(_basic_class_stage(name)[0], name)

    def test_secondary_ladder_unchanged(self):
        self.assertEqual(_class_stage('Form 1 A'), 0)
        self.assertEqual(_class_stage('Upper Sixth'), 6)


class BasicNextClassTests(TestCase):
    def setUp(self):
        self.school = _school('PR-ONE')
        self.c = {n: SchoolClass.objects.create(school=self.school, name=n) for n in (
            'Nursery 3', 'Class 1', 'Class 3 A', 'Class 3 B', 'Class 4', 'Class 4 A', 'Class 4 B', 'Class 6')}

    def test_parallel_group_is_kept(self):
        pupil = _pupil(self.school, self.c['Class 3 B'], 1)
        self.assertEqual(_next_class_for_student(pupil), self.c['Class 4 B'])

    def test_plain_next_class_when_no_group(self):
        pupil = _pupil(self.school, self.c['Nursery 3'], 2)
        self.assertEqual(_next_class_for_student(pupil), self.c['Class 1'])

    def test_falls_back_to_plain_when_group_missing(self):
        klass = SchoolClass.objects.create(school=self.school, name='Class 3 C')
        pupil = _pupil(self.school, klass, 3)
        self.assertIn(_next_class_for_student(pupil), (self.c['Class 4'], self.c['Class 4 A'], self.c['Class 4 B']))

    def test_last_primary_class_graduates(self):
        pupil = _pupil(self.school, self.c['Class 6'], 4)
        self.assertIsNone(_next_class_for_student(pupil))
        self.assertTrue(_is_final_class(pupil, 'Class 6'))

    def test_other_school_classes_never_used(self):
        other = _school('PR-TWO')
        SchoolClass.objects.create(school=other, name='Class 5')
        klass = SchoolClass.objects.create(school=self.school, name='Class 4 C')
        pupil = _pupil(self.school, klass, 5)
        self.assertIsNone(_next_class_for_student(pupil))

    def test_sub_school_preferred(self):
        from apps.schools.models import SubSchool
        east = SubSchool.objects.create(school=self.school, name='East')
        west = SubSchool.objects.create(school=self.school, name='West')
        cur = SchoolClass.objects.create(school=self.school, name='Class 2', sub_school=east)
        SchoolClass.objects.create(school=self.school, name='Class 3 W', sub_school=west)
        mine = SchoolClass.objects.create(school=self.school, name='Class 3 E', sub_school=east)
        pupil = _pupil(self.school, cur, 6)
        self.assertEqual(_next_class_for_student(pupil), mine)


class NurseryPromotionTests(TestCase):
    def setUp(self):
        self.school = _school('PR-NUR')
        self.n2 = SchoolClass.objects.create(school=self.school, name='Nursery 2')
        self.n3 = SchoolClass.objects.create(school=self.school, name='Nursery 3')
        self.c1 = SchoolClass.objects.create(school=self.school, name='Class 1')
        self.c2 = SchoolClass.objects.create(school=self.school, name='Class 2')

    def test_nursery_without_marks_is_promoted(self):
        record = _build_promotion_record(_pupil(self.school, self.n2, 1), '2026-2027', Decimal('10'))
        self.assertEqual(record.status, StudentPromotionRecord.Status.PROMOTED)
        self.assertEqual(record.promoted_to_class, self.n3)

    def test_nursery_3_moves_into_class_1(self):
        record = _build_promotion_record(_pupil(self.school, self.n3, 2), '2026-2027', Decimal('10'))
        self.assertEqual(record.status, StudentPromotionRecord.Status.PROMOTED)
        self.assertEqual(record.promoted_to_class, self.c1)

    def test_nursery_policy_can_be_switched_off(self):
        settings = self.school.settings
        settings.assessment_config = {'nursery_promote_without_marks': False}
        settings.save()
        record = _build_promotion_record(_pupil(self.school, self.n2, 3), '2026-2027', Decimal('10'))
        self.assertEqual(record.status, StudentPromotionRecord.Status.PENDING)

    def test_primary_without_marks_stays_pending(self):
        record = _build_promotion_record(_pupil(self.school, self.c1, 4), '2026-2027', Decimal('10'))
        self.assertEqual(record.status, StudentPromotionRecord.Status.PENDING)

    def test_secondary_school_is_unchanged(self):
        school = _school('PR-SEC', category='secondary')
        f1 = SchoolClass.objects.create(school=school, name='Form 1')
        SchoolClass.objects.create(school=school, name='Form 2')
        SchoolClass.objects.create(school=school, name='Nursery 2')
        record = _build_promotion_record(_pupil(school, f1, 5), '2026-2027', Decimal('10'))
        self.assertEqual(record.status, StudentPromotionRecord.Status.PENDING)
        nursery = _pupil(school, SchoolClass.objects.get(school=school, name='Nursery 2'), 6)
        self.assertIsNone(_next_class_for_student(nursery))

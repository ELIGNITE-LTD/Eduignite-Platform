"""Secondary / higher "Hierarchy & Sections" overview: summary math, isolation, sub-admin scope, idempotency."""

from django.core.management import call_command
from io import StringIO

from apps.grades.models import ClassSubject, Subject
from apps.schools.models import SchoolClass, SubSchool
from apps.schools.test_hierarchy_setup import HubBase, make_school, make_user

BASE = '/api/v1/schools/hierarchy/'
SUMMARY = f'{BASE}secondary-setup-summary/'
QUICK = f'{BASE}secondary/quick-setup/'
BULK = f'{BASE}secondary/class-subjects/bulk/'
TEACHER = f'{BASE}secondary/subject-teacher/'


class SecondaryBase(HubBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.sec = cls.secondary
        cls.en = SubSchool.objects.create(school=cls.sec, name='Anglophone General Section')
        cls.fr = SubSchool.objects.create(school=cls.sec, name='Francophone General Section')
        cls.t1 = make_user(cls.sec, 'TEACHER', 'T1')
        cls.t2 = make_user(cls.sec, 'TEACHER', 'T2')
        cls.vp = make_user(cls.sec, 'SUB_ADMIN', 'VP')
        cls.vp.sub_school = cls.en
        cls.vp.save(update_fields=['sub_school'])
        cls.f1 = SchoolClass.objects.create(school=cls.sec, sub_school=cls.en, name='Form 1', cycle='first')
        cls.f2 = SchoolClass.objects.create(school=cls.sec, sub_school=cls.en, name='Lower Sixth', cycle='second')
        cls.c6 = SchoolClass.objects.create(school=cls.sec, sub_school=cls.fr, name='6ème', cycle='first')

    def setUp(self):
        self.client.force_authenticate(self.sec_admin)


class SummaryTests(SecondaryBase):
    def test_empty_school_points_to_first_missing_step(self):
        self.client.force_authenticate(make_user(make_school('HUB-E', 'secondary'), 'SCHOOL_ADMIN', 'ADM'))
        data = self.client.get(SUMMARY).data
        self.assertEqual(data['next_step'], 'classes')
        self.assertEqual(data['counts']['classes'], 0)

    def test_math(self):
        math = Subject.objects.create(school=self.sec, name='Maths', code='MTH', level='x', coefficient=4)
        eng = Subject.objects.create(school=self.sec, name='English', code='ENG', level='x', coefficient=3)
        ClassSubject.objects.create(school_class=self.f1, subject=math, teacher=self.t1)
        ClassSubject.objects.create(school_class=self.f1, subject=eng)
        ClassSubject.objects.create(school_class=self.f2, subject=math, teacher=self.t1)
        self.f1.class_master = self.t2
        self.f1.save()
        data = self.client.get(SUMMARY).data
        counts = data['counts']
        self.assertEqual((counts['sections'], counts['classes'], counts['first_cycle'], counts['second_cycle']), (2, 3, 2, 1))
        self.assertEqual((counts['subjects'], counts['subject_links']), (2, 3))
        self.assertEqual((counts['teachers'], counts['teachers_assigned'], counts['teachers_unassigned']), (2, 2, 0))
        steps = {s['key']: s for s in data['steps']}
        self.assertEqual((steps['subjects']['count'], steps['subjects']['total'], steps['subjects']['done']), (2, 3, False))
        self.assertEqual((steps['teachers']['count'], steps['teachers']['total']), (2, 3))
        self.assertEqual((steps['class_masters']['count'], steps['class_masters']['done']), (1, False))
        self.assertEqual(data['next_step'], 'subjects')
        rows = {r['name']: r for r in data['classes']}
        self.assertEqual(rows['Form 1']['without_teacher'], 1)

    def test_unassigned_teacher_counted(self):
        data = self.client.get(SUMMARY).data
        self.assertEqual(data['counts']['teachers_unassigned'], 2)

    def test_isolated_from_other_schools(self):
        other = make_school('HUB-X', 'secondary')
        SchoolClass.objects.create(school=other, name='Form 9', cycle='first')
        names = [c['name'] for c in self.client.get(SUMMARY).data['classes']]
        self.assertNotIn('Form 9', names)

    def test_basic_school_excluded(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(SUMMARY).status_code, 400)
        self.assertEqual(self.client.post(QUICK, {}, format='json').status_code, 400)

    def test_teacher_forbidden(self):
        self.client.force_authenticate(self.t1)
        self.assertEqual(self.client.get(SUMMARY).status_code, 403)

    def test_sub_admin_sees_only_own_section(self):
        self.client.force_authenticate(self.vp)
        data = self.client.get(SUMMARY).data
        self.assertEqual(sorted(c['name'] for c in data['classes']), ['Form 1', 'Lower Sixth'])
        self.assertEqual(data['counts']['sections'], 1)


class QuickSetupTests(SecondaryBase):
    def test_idempotent_and_no_subjects(self):
        body = {'sub_school': str(self.en.id), 'language': 'en'}
        first = self.client.post(QUICK, body, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(len(first.data['created']), 5)  # Form 1 and Lower Sixth already exist
        second = self.client.post(QUICK, body, format='json')
        self.assertEqual((second.status_code, len(second.data['created'])), (200, 0))
        self.assertEqual(SchoolClass.objects.filter(school=self.sec, name='Form 1').count(), 1)
        self.assertEqual(Subject.objects.filter(school=self.sec).count(), 0)
        self.assertEqual(SchoolClass.objects.get(school=self.sec, name='Upper Sixth').cycle, 'second')

    def test_cycle_filter_and_section_required(self):
        self.assertEqual(self.client.post(QUICK, {'language': 'fr'}, format='json').status_code, 400)
        response = self.client.post(
            QUICK, {'sub_school': str(self.fr.id), 'language': 'fr', 'cycles': ['second']}, format='json')
        self.assertEqual(sorted(c['name'] for c in response.data['created']), ['Première', 'Seconde', 'Terminale'])

    def test_foreign_section_and_sub_admin_scope(self):
        foreign = SubSchool.objects.get(school=self.other)
        self.assertEqual(self.client.post(QUICK, {'sub_school': str(foreign.id)}, format='json').status_code, 400)
        self.client.force_authenticate(self.vp)
        self.assertEqual(self.client.post(QUICK, {'sub_school': str(self.fr.id)}, format='json').status_code, 400)
        self.assertEqual(self.client.post(QUICK, {'sub_school': str(self.en.id)}, format='json').status_code, 201)


class BulkSubjectTests(SecondaryBase):
    def test_custom_is_idempotent_and_keeps_coefficient(self):
        body = {'mode': 'custom', 'classes': [str(self.f1.id), str(self.f2.id)],
                'subjects': [{'name': 'Physics', 'coefficient': 3, 'type': 'optional'}]}
        first = self.client.post(BULK, body, format='json')
        self.assertEqual((first.data['created'], first.data['existing']), (2, 0))
        again = self.client.post(BULK, body, format='json')
        self.assertEqual((again.data['created'], again.data['existing']), (0, 2))
        subject = Subject.objects.get(school=self.sec, name='Physics')
        self.assertEqual(int(subject.coefficient), 3)
        self.assertEqual(ClassSubject.objects.get(school_class=self.f1, subject=subject).type, 'optional')
        self.assertEqual(Subject.objects.filter(school=self.sec).count(), 1)

    def test_copy_with_teachers(self):
        self.client.post(BULK, {'mode': 'custom', 'classes': [str(self.f1.id)], 'subjects': [{'name': 'Maths'}]}, format='json')
        ClassSubject.objects.filter(school_class=self.f1).update(teacher=self.t1)
        response = self.client.post(
            BULK, {'mode': 'copy', 'from_class': str(self.f1.id), 'classes': [str(self.c6.id)], 'with_teachers': True},
            format='json')
        self.assertEqual(response.data['created'], 1)
        self.assertEqual(ClassSubject.objects.get(school_class=self.c6).teacher_id, self.t1.id)
        self.assertEqual(self.client.post(BULK, {'mode': 'copy', 'from_class': str(self.f1.id), 'classes': [str(self.c6.id)]},
                                          format='json').data['created'], 0)

    def test_validation_and_isolation(self):
        other = make_school('HUB-Y', 'secondary')
        foreign = SchoolClass.objects.create(school=other, name='Form 1', cycle='first')
        self.assertEqual(self.client.post(BULK, {'mode': 'custom', 'classes': [str(foreign.id)],
                                                 'subjects': [{'name': 'X'}]}, format='json').status_code, 404)
        self.assertEqual(self.client.post(BULK, {'mode': 'custom', 'all': True, 'subjects': [{'name': 'X', 'coefficient': 0}]},
                                          format='json').status_code, 400)
        self.assertEqual(self.client.post(BULK, {'mode': 'template', 'all': True}, format='json').status_code, 400)
        self.assertEqual(ClassSubject.objects.filter(school_class=foreign).count(), 0)

    def test_sub_admin_cannot_touch_other_section(self):
        self.client.force_authenticate(self.vp)
        response = self.client.post(BULK, {'mode': 'custom', 'classes': [str(self.c6.id)], 'subjects': [{'name': 'X'}]},
                                    format='json')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(ClassSubject.objects.filter(school_class=self.c6).exists())


class SubjectTeacherTests(SecondaryBase):
    def setUp(self):
        super().setUp()
        self.math = Subject.objects.create(school=self.sec, name='Maths', code='MTH', level='x')
        for c in (self.f1, self.f2):
            ClassSubject.objects.create(school_class=c, subject=self.math)

    def test_set_across_classes_idempotent_and_skips(self):
        body = {'subject': str(self.math.id), 'teacher': str(self.t1.id),
                'classes': [str(self.f1.id), str(self.f2.id), str(self.c6.id)]}
        first = self.client.post(TEACHER, body, format='json').data
        self.assertEqual((first['updated'], first['unchanged'], len(first['skipped'])), (2, 0, 1))
        second = self.client.post(TEACHER, body, format='json').data
        self.assertEqual((second['updated'], second['unchanged']), (0, 2))
        cleared = self.client.post(TEACHER, {**body, 'teacher': None}, format='json').data
        self.assertEqual(cleared['updated'], 2)

    def test_foreign_teacher_and_subject_rejected(self):
        outsider = make_user(self.other, 'TEACHER', 'OUT')
        body = {'subject': str(self.math.id), 'teacher': str(outsider.id), 'all': True}
        self.assertEqual(self.client.post(TEACHER, body, format='json').status_code, 400)
        foreign = Subject.objects.create(school=self.other, name='Maths', code='MTH', level='x')
        self.assertEqual(self.client.post(TEACHER, {'subject': str(foreign.id), 'all': True}, format='json').status_code, 400)

    def test_sub_admin_limited_to_own_section(self):
        ClassSubject.objects.create(school_class=self.c6, subject=self.math)
        self.client.force_authenticate(self.vp)
        self.client.post(TEACHER, {'subject': str(self.math.id), 'teacher': str(self.t1.id), 'all': True}, format='json')
        self.assertIsNone(ClassSubject.objects.get(school_class=self.c6).teacher_id)
        self.assertEqual(ClassSubject.objects.get(school_class=self.f1).teacher_id, self.t1.id)


class MigrationGraphTests(SecondaryBase):
    def test_no_pending_or_conflicting_migrations(self):
        call_command('makemigrations', '--check', '--dry-run', stdout=StringIO(), stderr=StringIO())

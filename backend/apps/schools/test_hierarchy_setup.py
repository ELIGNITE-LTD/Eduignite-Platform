"""Basic Education "Hierarchy & Sections" hub: bulk setup, templates, guards, isolation."""

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from apps.grades.models import ClassSubject, Subject
from apps.registry.manifest import all_manifests
from apps.schools import hierarchy_setup as setup
from apps.schools.models import ClassTeacherAssignment, School, SchoolClass, SubSchool, TimetableEntry
from apps.students.models import Student

User = get_user_model()
BASE = '/api/v1/schools/hierarchy/'


def make_school(sid, category='basic', subsystem='anglophone'):
    return School.objects.create(
        id=sid, name=f'School {sid}', short_name=sid, principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem=subsystem, education_category=category,
    )


def make_user(school, role, tag):
    return User.objects.create_user(
        matricule=f'{tag}-{school.id}', name=f'{tag} {school.id}', email=f'{tag.lower()}-{school.id}@example.org'.lower(),
        role=role, school=school, password='password123', is_license_paid=True,
    )


class HubBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.school = make_school('HUB-B')
        cls.other = make_school('HUB-O')
        cls.secondary = make_school('HUB-S', 'secondary')
        cls.admin = make_user(cls.school, 'SCHOOL_ADMIN', 'ADM')
        cls.other_admin = make_user(cls.other, 'SCHOOL_ADMIN', 'ADM')
        cls.sec_admin = make_user(cls.secondary, 'SCHOOL_ADMIN', 'ADM')
        cls.teacher = make_user(cls.school, 'TEACHER', 'TCH')
        cls.other_teacher = make_user(cls.other, 'TEACHER', 'TCH')
        cls.section = SubSchool.objects.get(school=cls.school)

    def setUp(self):
        self.client.force_authenticate(self.admin)


class DefaultSectionTests(HubBase):
    def test_basic_school_gets_default_section_on_creation(self):
        self.assertEqual(list(SubSchool.objects.filter(school=self.school).values_list('name', flat=True)),
                         ['English Section'])
        fr = make_school('HUB-F', subsystem='francophone')
        self.assertEqual(list(SubSchool.objects.filter(school=fr).values_list('name', flat=True)), ['French Section'])
        self.assertFalse(SubSchool.objects.get(school=fr).is_system_managed)

    def test_secondary_school_gets_no_default_section(self):
        self.assertFalse(SubSchool.objects.filter(school=self.secondary).exists())

    def test_ensure_default_sections_is_idempotent(self):
        setup.ensure_default_sections(self.school)
        setup.ensure_default_sections(self.school)
        self.assertEqual(SubSchool.objects.filter(school=self.school).count(), 1)

    def test_class_without_section_falls_back_to_the_only_section(self):
        response = self.client.post('/api/v1/schools/hierarchy/classes/', {'name': 'Class 1', 'cycle': 'primary'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(str(response.data['sub_school']), str(self.section.id))

    def test_class_cannot_be_detached_from_its_section(self):
        klass = SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section)
        response = self.client.patch(f'{BASE}classes/{klass.id}/', {'sub_school': None}, format='json')
        self.assertEqual(response.status_code, 400)


class BulkClassesTests(HubBase):
    def test_bulk_create_is_idempotent_and_reuses_names(self):
        body = {'sub_school': str(self.section.id), 'names': ['Class 1', 'class 1', 'Class 2', 'Nursery 1']}
        first = self.client.post(f'{BASE}classes/bulk/', body, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(len(first.data['created']), 3)
        again = self.client.post(f'{BASE}classes/bulk/', body, format='json')
        self.assertEqual(again.status_code, 200)
        self.assertEqual((len(again.data['created']), len(again.data['existing'])), (0, 3))
        self.assertEqual(SchoolClass.objects.filter(school=self.school).count(), 3)
        self.assertEqual(SchoolClass.objects.get(school=self.school, name='Nursery 1').cycle, 'nursery')
        self.assertEqual(SchoolClass.objects.get(school=self.school, name='Class 1').cycle, 'primary')

    def test_section_required_when_school_has_several(self):
        SubSchool.objects.create(school=self.school, name='French Section')
        response = self.client.post(f'{BASE}classes/bulk/', {'names': ['Class 1']}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(SchoolClass.objects.filter(school=self.school).exists())

    def test_single_section_is_used_without_being_named(self):
        response = self.client.post(f'{BASE}classes/bulk/', {'names': ['Class 1']}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(SchoolClass.objects.get(school=self.school).sub_school_id, self.section.id)

    def test_foreign_section_is_rejected(self):
        foreign = SubSchool.objects.get(school=self.other)
        response = self.client.post(f'{BASE}classes/bulk/', {'sub_school': str(foreign.id), 'names': ['X']}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(SchoolClass.objects.filter(school=self.other).exists())

    def test_secondary_school_is_refused(self):
        self.client.force_authenticate(self.sec_admin)
        response = self.client.post(f'{BASE}classes/bulk/', {'names': ['Form 1']}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_teacher_cannot_use_the_hub(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(f'{BASE}setup-summary/').status_code, 403)


class SubjectTemplateTests(HubBase):
    def setUp(self):
        super().setUp()
        self.c1 = SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section, cycle='primary')
        self.c2 = SchoolClass.objects.create(school=self.school, name='Class 2', sub_school=self.section, cycle='primary')
        self.nursery = SchoolClass.objects.create(school=self.school, name='Nursery 1', sub_school=self.section, cycle='nursery')

    def test_template_mode_is_gone_and_nothing_is_created(self):
        response = self.client.post(f'{BASE}class-subjects/bulk/', {'mode': 'template', 'all': True}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Subject.objects.filter(school=self.school).count(), 0)
        self.assertEqual(ClassSubject.objects.filter(school_class__school=self.school).count(), 0)

    def test_custom_subjects_are_added_manually_and_idempotently(self):
        body = {'mode': 'custom', 'all': True, 'subjects': [{'name': 'Mathematics'}, {'name': 'Drawing'}]}
        first = self.client.post(f'{BASE}class-subjects/bulk/', body, format='json')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data['created'], 6)  # 3 classes x 2 subjects typed by the school
        again = self.client.post(f'{BASE}class-subjects/bulk/', body, format='json')
        self.assertEqual((again.data['created'], again.data['existing']), (0, 6))
        self.assertEqual(Subject.objects.filter(school=self.school).count(), 2)

    def test_copy_from_another_class_never_removes(self):
        self.client.post(f'{BASE}class-subjects/bulk/', {'mode': 'custom', 'classes': [str(self.c1.id)],
                                                          'subjects': [{'name': 'Mathematics'}, {'name': 'Drawing'}]}, format='json')
        extra = Subject.objects.create(school=self.school, name='Music', code='MUS', level='x')
        ClassSubject.objects.create(school_class=self.c2, subject=extra)
        response = self.client.post(f'{BASE}class-subjects/bulk/', {'mode': 'copy', 'from_class': str(self.c1.id),
                                                                     'classes': [str(self.c2.id)]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 2)
        self.assertEqual(ClassSubject.objects.filter(school_class=self.c2).count(), 3)

    def test_coefficients_follow_assessment_config(self):
        from apps.schools.models import SchoolSettings

        SchoolSettings.objects.update_or_create(school=self.school, defaults={'assessment_config': {'use_coefficients': False}})
        self.client.post(f'{BASE}class-subjects/bulk/', {'mode': 'custom', 'classes': [str(self.c1.id)],
                                                          'subjects': [{'name': 'Mathematics', 'coefficient': 4}]}, format='json')
        self.assertEqual(float(Subject.objects.get(school=self.school, name='Mathematics').coefficient), 1.0)

    def test_other_school_class_ids_are_ignored(self):
        foreign = SchoolClass.objects.create(school=self.other, name='Class 1', sub_school=SubSchool.objects.get(school=self.other))
        response = self.client.post(f'{BASE}class-subjects/bulk/', {'mode': 'custom', 'subjects': [{'name': 'X'}], 'classes': [str(foreign.id)]}, format='json')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(ClassSubject.objects.filter(school_class=foreign).exists())


class GuardedDeleteTests(HubBase):
    def test_class_with_pupils_cannot_be_deleted(self):
        klass = SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section, cycle='primary')
        Student.objects.create(school=self.school, school_class=klass, name='Pupil', admission_number='A1')
        blocked = self.client.delete(f'{BASE}classes/{klass.id}/')
        self.assertEqual(blocked.status_code, 400)
        Student.objects.filter(school_class=klass).delete()
        self.assertEqual(self.client.delete(f'{BASE}classes/{klass.id}/').status_code, 204)

    def test_section_with_classes_cannot_be_deleted(self):
        extra = SubSchool.objects.create(school=self.school, name='French Section')
        SchoolClass.objects.create(school=self.school, name='CP', sub_school=extra)
        self.assertEqual(self.client.delete(f'{BASE}sub-schools/{extra.id}/').status_code, 400)

    def test_subject_with_marks_cannot_be_removed(self):
        from apps.grades.models import Grade, Sequence

        klass = SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section, cycle='primary')
        subject = Subject.objects.create(school=self.school, name='Maths', code='M', level='x')
        link = ClassSubject.objects.create(school_class=klass, subject=subject)
        pupil = Student.objects.create(school=self.school, school_class=klass, name='P', admission_number='A2')
        seq = Sequence.objects.create(school=self.school, name='Seq 1', academic_year='2025-2026', term=1,
                                      start_date='2025-09-01', end_date='2025-10-30')
        Grade.objects.create(student=pupil, subject=subject, sequence=seq, school=self.school, school_class=klass, score=12)
        self.assertEqual(self.client.delete(f'{BASE}subjects/{link.id}/').status_code, 400)
        self.assertTrue(ClassSubject.objects.filter(id=link.id).exists())


class MoveAndTeacherTests(HubBase):
    def test_moving_a_class_keeps_pupils_and_syncs_timetable(self):
        french = SubSchool.objects.create(school=self.school, name='French Section')
        klass = SchoolClass.objects.create(school=self.school, name='Class 3', sub_school=self.section, cycle='primary')
        pupil = Student.objects.create(school=self.school, school_class=klass, name='P', admission_number='A3')
        subject = Subject.objects.create(school=self.school, name='Maths', code='M', level='x')
        entry = TimetableEntry.objects.create(
            school=self.school, school_class=klass, subject=subject, academic_year='2025/2026', term='First',
            day_of_week=1, start_time='08:00', end_time='09:00',
        )
        response = self.client.patch(f'{BASE}classes/{klass.id}/', {'sub_school': str(french.id)}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        pupil.refresh_from_db()
        self.assertEqual(pupil.school_class_id, klass.id)
        self.assertEqual(pupil.school_class.sub_school_id, french.id)
        self.assertEqual(pupil.student_class, 'Class 3')
        entry.refresh_from_db()
        self.assertEqual(entry.sub_school_id, french.id)

    def test_set_class_teacher_writes_master_and_lead_and_replaces(self):
        klass = SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section, cycle='primary')
        second = make_user(self.school, 'TEACHER', 'TCH2')
        url = f'{BASE}classes/{klass.id}/class-teacher/'
        self.assertEqual(self.client.post(url, {'teacher': str(self.teacher.id)}, format='json').status_code, 200)
        klass.refresh_from_db()
        self.assertEqual(klass.class_master_id, self.teacher.id)
        self.assertTrue(ClassTeacherAssignment.objects.get(school_class=klass, teacher=self.teacher).is_lead)
        self.client.post(url, {'teacher': str(second.id)}, format='json')
        leads = ClassTeacherAssignment.objects.filter(school_class=klass, is_lead=True)
        self.assertEqual([a.teacher_id for a in leads], [second.id])
        self.client.post(url, {'teacher': None}, format='json')
        klass.refresh_from_db()
        self.assertIsNone(klass.class_master_id)
        self.assertFalse(ClassTeacherAssignment.objects.filter(school_class=klass, is_lead=True).exists())

    def test_class_teacher_must_be_a_teacher_of_the_school(self):
        klass = SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section)
        url = f'{BASE}classes/{klass.id}/class-teacher/'
        self.assertEqual(self.client.post(url, {'teacher': str(self.other_teacher.id)}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'teacher': str(self.admin.id)}, format='json').status_code, 400)

    def test_other_school_class_is_not_reachable(self):
        foreign = SchoolClass.objects.create(school=self.other, name='Class 1', sub_school=SubSchool.objects.get(school=self.other))
        url = f'{BASE}classes/{foreign.id}/class-teacher/'
        self.assertEqual(self.client.post(url, {'teacher': str(self.teacher.id)}, format='json').status_code, 404)

    def test_sub_admin_only_acts_inside_their_section(self):
        french = SubSchool.objects.create(school=self.school, name='French Section')
        mine = SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section)
        theirs = SchoolClass.objects.create(school=self.school, name='CP', sub_school=french)
        sub_admin = make_user(self.school, 'SUB_ADMIN', 'SUB')
        sub_admin.sub_school = self.section
        sub_admin.save()
        self.client.force_authenticate(sub_admin)
        self.assertEqual(self.client.post(f'{BASE}classes/{mine.id}/class-teacher/', {'teacher': str(self.teacher.id)}, format='json').status_code, 200)
        self.assertEqual(self.client.post(f'{BASE}classes/{theirs.id}/class-teacher/', {'teacher': str(self.teacher.id)}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f'{BASE}setup/quick/', {'languages': ['en']}, format='json').status_code, 403)


class QuickSetupAndSummaryTests(HubBase):
    def test_summary_math_and_next_step(self):
        summary = self.client.get(f'{BASE}setup-summary/').data
        steps = {s['key']: s for s in summary['steps']}
        self.assertTrue(steps['sections']['done'])
        self.assertFalse(steps['classes']['done'])
        self.assertEqual(summary['next_step'], 'levels')
        from apps.schools import class_levels
        class_levels.ensure_default_levels(self.school)
        self.assertEqual(self.client.get(f'{BASE}setup-summary/').data['next_step'], 'classes')
        c1 = SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section, cycle='primary')
        SchoolClass.objects.create(school=self.school, name='Class 2', sub_school=self.section, cycle='primary')
        SchoolClass.objects.create(school=self.school, name='Nursery 1', sub_school=self.section, cycle='nursery')
        subject = Subject.objects.create(school=self.school, name='Maths', code='M', level='x')
        ClassSubject.objects.create(school_class=c1, subject=subject)
        setup.set_class_teacher(c1, self.teacher)
        summary = self.client.get(f'{BASE}setup-summary/').data
        steps = {s['key']: s for s in summary['steps']}
        self.assertTrue(steps['classes']['done'])
        self.assertEqual((steps['subjects']['count'], steps['subjects']['total']), (1, 2))
        self.assertIn('levels', steps)
        self.assertEqual((steps['teachers']['count'], steps['teachers']['total']), (1, 3))
        self.assertEqual(summary['next_step'], 'subjects')
        load = {t['id']: t['load'] for t in summary['teachers']}
        self.assertEqual(load[str(self.teacher.id)], 1)

    def test_quick_setup_is_idempotent_and_language_aware(self):
        body = {'languages': ['en', 'fr'], 'nursery': True, 'primary': True}
        first = self.client.post(f'{BASE}setup/quick/', body, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(SchoolClass.objects.filter(school=self.school).count(), 18)
        self.assertEqual(SubSchool.objects.filter(school=self.school).count(), 2)
        self.assertTrue(SchoolClass.objects.filter(school=self.school, name='CM2', sub_school__name='French Section').exists())
        before = (SchoolClass.objects.count(), Subject.objects.count(), ClassSubject.objects.count())
        second = self.client.post(f'{BASE}setup/quick/', body, format='json')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(before, (SchoolClass.objects.count(), Subject.objects.count(), ClassSubject.objects.count()))
        self.assertEqual(second.data['classes_created'], [])
        # No default subjects, ever: the school adds its own.
        self.assertEqual((Subject.objects.count(), ClassSubject.objects.count()), (0, 0))
        # Levels exist and every created class sits in its level.
        self.assertEqual(SchoolClass.objects.filter(school=self.school, level__isnull=True).count(), 0)

    def test_quick_setup_reuses_existing_class_names(self):
        SchoolClass.objects.create(school=self.school, name='Class 1', sub_school=self.section, cycle='primary')
        response = self.client.post(f'{BASE}setup/quick/', {'languages': ['en'], 'nursery': False}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertIn('Class 1', response.data['classes_existing'])
        self.assertEqual(SchoolClass.objects.filter(school=self.school, name='Class 1').count(), 1)

    def test_summary_is_isolated(self):
        SchoolClass.objects.create(school=self.other, name='Class 1', sub_school=SubSchool.objects.get(school=self.other))
        summary = self.client.get(f'{BASE}setup-summary/').data
        self.assertEqual(summary['counts']['classes'], 0)


class RouteOwnershipTests(SimpleTestCase):
    def test_hierarchy_route_is_owned_once_by_a_core_app(self):
        owners = [m for m in all_manifests().values() if '/dashboard/hierarchy' in m.routes]
        self.assertEqual([m.key for m in owners], ['schools'])
        self.assertTrue(owners[0].is_core)


class BackfillMigrationTests(HubBase):
    def test_backfill_attaches_orphans_and_is_idempotent(self):
        import importlib

        from django.apps import apps as django_apps

        mod = importlib.import_module('apps.schools.migrations.0031_backfill_basic_default_sections')
        fresh = make_school('HUB-N')
        SubSchool.objects.filter(school=fresh).delete()
        orphan = SchoolClass.objects.create(school=fresh, name='Class 1')
        sec_orphan = SchoolClass.objects.create(school=self.school, name='Class 9')
        multi = make_school('HUB-M')
        SubSchool.objects.create(school=multi, name='Extra Section')
        stay = SchoolClass.objects.create(school=multi, name='Class 1')
        for _ in range(2):
            mod.backfill(django_apps, None)
        orphan.refresh_from_db()
        sec_orphan.refresh_from_db()
        stay.refresh_from_db()
        self.assertEqual(orphan.sub_school.name, 'English Section')
        self.assertEqual(SubSchool.objects.filter(school=fresh).count(), 1)
        self.assertEqual(sec_orphan.sub_school_id, self.section.id)
        self.assertIsNone(stay.sub_school_id)  # two sections exist: ambiguous, left alone

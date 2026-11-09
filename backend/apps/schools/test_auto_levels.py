"""Levels appear by themselves: lazy seeding, per-section ladders, data migration, assign-level."""

import importlib
from collections import defaultdict

from django.apps import apps as django_apps
from django.db.migrations.loader import MigrationLoader
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from apps.grades.models import ClassSubject, Subject
from apps.schools import class_levels
from apps.schools.models import ClassLevel, SchoolClass, SubSchool
from apps.schools.test_hierarchy_setup import BASE, HubBase, make_school, make_user
from apps.students import api as students_api


def _pupil(school, klass, n=1):
    return students_api.enrol_student(
        user=None, name=f'P{n}', matricule=f'{school.id}Q{n:03d}', school=school, school_class=klass,
        student_class=klass.name, class_level='x', section='General', admission_number=f'{school.id}-Q{n}',
    )


class LazySeedingTests(HubBase):
    def legacy(self):
        """A school that existed before this release: sections and classes but no levels."""
        ClassLevel.objects.filter(school=self.school).delete()
        SchoolClass.objects.filter(school=self.school).delete()

    def test_new_basic_school_has_its_ladder_at_creation(self):
        names = list(ClassLevel.objects.filter(school=self.school).order_by('order').values_list('name', flat=True))
        self.assertEqual(names, ['Nursery 1', 'Nursery 2', 'Nursery 3', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'])
        self.assertEqual(ClassLevel.objects.filter(school=self.secondary).count(), 0)

    def test_get_levels_seeds_once_without_any_click(self):
        self.legacy()
        first = self.client.get(f'{BASE}levels/')
        self.assertEqual(len(first.data), 9)
        self.assertEqual(set(first.data[0]['sections']), {str(self.section.id)})
        again = self.client.get(f'{BASE}levels/')
        self.assertEqual(len(again.data), 9)
        self.assertEqual(ClassLevel.objects.filter(school=self.school).count(), 9)

    def test_every_entry_point_seeds(self):
        entries = [
            lambda: self.client.get(f'{BASE}setup-summary/'),
            lambda: self.client.get(f'{BASE}classes/'),
            lambda: self.client.post(f'{BASE}classes/', {'name': 'Playgroup', 'sub_school': str(self.section.id)}, format='json'),
            lambda: self.client.get('/api/v1/students/students/basic-promotion/preview/'),
        ]
        for call in entries:
            self.legacy()
            self.assertEqual(ClassLevel.objects.filter(school=self.school).count(), 0)
            call()
            self.assertEqual(ClassLevel.objects.filter(school=self.school).count(), 9, call)

    def test_unleveled_classes_are_attached_on_seeding_without_renaming(self):
        self.legacy()
        a = SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Class 3 A')
        odd = SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Playgroup')
        pupil = _pupil(self.school, a)
        response = self.client.get(f'{BASE}setup-summary/')
        a.refresh_from_db(), odd.refresh_from_db(), pupil.refresh_from_db()
        self.assertEqual((a.name, a.level.name, a.stream), ('Class 3 A', 'Class 3', 'A'))
        self.assertIsNone(odd.level_id)
        self.assertEqual([c['name'] for c in response.data['unleveled_classes']], ['Playgroup'])
        self.assertEqual((pupil.school_class_id, pupil.class_level), (a.id, 'Class 3'))

    def test_hand_typed_class_name_is_placed_in_its_level(self):
        response = self.client.post(f'{BASE}classes/', {'name': 'Class 2 B', 'sub_school': str(self.section.id)}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        klass = SchoolClass.objects.get(pk=response.data['id'])
        self.assertEqual((klass.name, klass.level.name, klass.stream), ('Class 2 B', 'Class 2', 'B'))

    def test_no_subjects_anywhere(self):
        self.legacy()
        self.client.get(f'{BASE}levels/')
        make_school('NOSUBJ')
        self.assertEqual((Subject.objects.count(), ClassSubject.objects.count()), (0, 0))

    def test_secondary_school_is_never_seeded(self):
        self.client.force_authenticate(self.sec_admin)
        self.assertEqual(self.client.get('/api/v1/schools/hierarchy/classes/').status_code, 200)
        self.assertEqual(class_levels.ensure_levels_for_school(self.secondary), 0)
        self.assertFalse(ClassLevel.objects.filter(school=self.secondary).exists())


class PerSectionTests(HubBase):
    def test_bilingual_school_shows_each_ladder_under_its_own_section(self):
        school = make_school('SEC-BI', subsystem='bilingual')
        en = SubSchool.objects.get(school=school, name='Anglophone General Section')
        fr = SubSchool.objects.get(school=school, name='Francophone General Section')
        admin = make_user(school, 'SCHOOL_ADMIN', 'ADMB')
        self.client.force_authenticate(admin)
        data = self.client.get(f'{BASE}levels/').data
        self.assertEqual(len(data), 18)
        in_en = {l['name'] for l in data if str(en.id) in l['sections']}
        in_fr = {l['name'] for l in data if str(fr.id) in l['sections']}
        self.assertEqual(in_en, {'Nursery 1', 'Nursery 2', 'Nursery 3', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'})
        self.assertEqual(in_fr, {'Petite section', 'Moyenne section', 'Grande section', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'})
        self.assertEqual(in_en & in_fr, set())

    def test_adding_a_french_section_adds_the_french_ladder(self):
        self.assertFalse(ClassLevel.objects.filter(school=self.school, name='CM2').exists())
        french = SubSchool.objects.create(school=self.school, name='French Section')
        self.assertEqual(ClassLevel.objects.filter(school=self.school, language='fr').count(), 9)
        data = self.client.get(f'{BASE}levels/').data
        cm2 = next(l for l in data if l['name'] == 'CM2')
        self.assertEqual(cm2['sections'], [str(french.id)])
        # promotion stays inside a track: CM1 -> CM2, Class 5 -> Class 6
        cm1 = ClassLevel.objects.get(school=self.school, name='CM1')
        self.assertEqual(class_levels.next_level(cm1).name, 'CM2')
        self.assertEqual(class_levels.next_level(ClassLevel.objects.get(school=self.school, name='Class 5')).name, 'Class 6')

    def test_ensure_is_idempotent(self):
        before = ClassLevel.objects.filter(school=self.school).count()
        self.assertEqual(class_levels.ensure_levels_for_school(self.school), 0)
        self.assertEqual(ClassLevel.objects.filter(school=self.school).count(), before)


class DataMigrationTests(APITestCase):
    def setUp(self):
        self.mod = importlib.import_module('apps.schools.migrations.0033_seed_basic_class_levels')

    def test_seeds_legacy_schools_skips_schools_with_levels_and_is_idempotent(self):
        legacy = make_school('MIG-L')
        custom = make_school('MIG-C')
        secondary = make_school('MIG-S', 'secondary')
        ClassLevel.objects.filter(school__in=[legacy, custom]).delete()
        section = SubSchool.objects.get(school=legacy)
        klass = SchoolClass.objects.create(school=legacy, sub_school=section, name='Class 3 A')
        odd = SchoolClass.objects.create(school=legacy, sub_school=section, name='Playgroup')
        pupil = _pupil(legacy, klass)
        mine = ClassLevel.objects.create(school=custom, name='My own level', order=1)
        for _ in range(2):
            self.mod.seed(django_apps, None)
        self.assertEqual(ClassLevel.objects.filter(school=legacy).count(), 9)
        self.assertEqual(list(ClassLevel.objects.filter(school=custom)), [mine])  # skipped: already had a level
        self.assertEqual(ClassLevel.objects.filter(school=secondary).count(), 0)
        klass.refresh_from_db(), odd.refresh_from_db(), pupil.refresh_from_db()
        self.assertEqual((klass.name, klass.level.name, klass.stream), ('Class 3 A', 'Class 3', 'A'))
        self.assertIsNone(odd.level_id)
        self.assertEqual((pupil.school_class_id, pupil.class_level), (klass.id, 'Class 3'))

    def test_french_and_bilingual_schools(self):
        fr = make_school('MIG-F', subsystem='francophone')
        bi = make_school('MIG-B', subsystem='bilingual')
        ClassLevel.objects.filter(school__in=[fr, bi]).delete()
        self.mod.seed(django_apps, None)
        self.assertEqual(ClassLevel.objects.filter(school=fr).count(), 9)
        self.assertTrue(ClassLevel.objects.filter(school=fr, name='CE2').exists())
        self.assertEqual(ClassLevel.objects.filter(school=bi).count(), 18)


class AssignLevelTests(HubBase):
    def test_assign_keeps_the_name_and_syncs_pupils(self):
        odd = SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Class 4 Blue')
        pupil = _pupil(self.school, odd)
        level = ClassLevel.objects.get(school=self.school, name='Class 4')
        response = self.client.post(f'{BASE}classes/{odd.id}/assign-level/', {'level': str(level.id)}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        odd.refresh_from_db(), pupil.refresh_from_db()
        self.assertEqual((odd.name, odd.level_id, odd.stream), ('Class 4 Blue', level.id, 'Blue'))
        self.assertEqual(pupil.class_level, 'Class 4')

    def test_duplicate_foreign_and_unknown_level(self):
        level = ClassLevel.objects.get(school=self.school, name='Class 4')
        SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Class 4 A', level=level, stream='A')
        dup = SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Room A')
        self.assertEqual(self.client.post(f'{BASE}classes/{dup.id}/assign-level/', {'level': str(level.id), 'stream': 'a'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{BASE}classes/{dup.id}/assign-level/', {'level': 'nope'}, format='json').status_code, 400)
        foreign_level = ClassLevel.objects.get(school=self.other, name='Class 4')
        self.assertEqual(self.client.post(f'{BASE}classes/{dup.id}/assign-level/', {'level': str(foreign_level.id)}, format='json').status_code, 400)
        foreign = SchoolClass.objects.create(school=self.other, name='X', sub_school=SubSchool.objects.get(school=self.other))
        self.assertEqual(self.client.post(f'{BASE}classes/{foreign.id}/assign-level/', {'level': str(level.id)}, format='json').status_code, 404)

    def test_teacher_cannot_assign(self):
        odd = SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Room B')
        level = ClassLevel.objects.get(school=self.school, name='Class 1')
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.post(f'{BASE}classes/{odd.id}/assign-level/', {'level': str(level.id)}, format='json').status_code, 403)


class MigrationGraphTests(SimpleTestCase):
    def test_single_leaf_per_app(self):
        leaves = defaultdict(list)
        for app, name in MigrationLoader(None, ignore_no_migrations=True).graph.leaf_nodes():
            leaves[app].append(name)
        self.assertEqual({a: n for a, n in leaves.items() if len(n) > 1}, {})

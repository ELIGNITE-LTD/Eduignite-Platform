"""Class LEVELS for Basic Education: levels API, classes under a level, backfill command."""

from io import StringIO

from django.core.management import call_command
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from apps.grades.models import ClassSubject, Subject
from apps.schools import class_levels
from apps.schools.models import ClassLevel, School, SchoolClass, SubSchool
from apps.schools.test_hierarchy_setup import BASE, HubBase, make_school, make_user
from apps.students import api as students_api


def _pupil(school, klass, n):
    return students_api.enrol_student(
        user=None, name=f'Pupil {n}', matricule=f'{school.id}L{n:03d}', school=school,
        school_class=klass, student_class=klass.name, class_level='stale', section='General',
        admission_number=f'{school.id}-L{n}',
    )


class ParserTests(SimpleTestCase):
    def test_names_are_read_into_stage_language_and_stream(self):
        parse = class_levels.parse_basic_class_name
        self.assertEqual(parse('Class 3 A'), (5, 'en', 'A'))
        self.assertEqual(parse('Class 2'), (4, 'en', ''))
        self.assertEqual(parse('Primary 4b'), (6, 'en', 'B'))
        self.assertEqual(parse('CE1 B'), (5, 'fr', 'B'))
        self.assertEqual(parse('Nursery 1 Blue'), (0, 'en', 'Blue'))
        self.assertEqual(parse('Maternelle 2'), (1, 'fr', ''))
        self.assertEqual(parse('Form 1 A')[0], None)
        self.assertEqual(parse('Lower Sixth')[0], None)

    def test_compose(self):
        class L:
            name = 'Class 1'
        self.assertEqual(class_levels.compose_class_name(L, 'a'), 'Class 1 A')
        self.assertEqual(class_levels.compose_class_name(L, ''), 'Class 1')
        self.assertEqual(class_levels.compose_class_name(L, 'Blue'), 'Class 1 Blue')


class LevelApiTests(HubBase):
    def test_seed_is_idempotent_and_creates_no_subjects(self):
        first = self.client.post(f'{BASE}levels/seed/', {}, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(ClassLevel.objects.filter(school=self.school).count(), 9)
        again = self.client.post(f'{BASE}levels/seed/', {}, format='json')
        self.assertEqual((again.status_code, len(again.data['created'])), (200, 0))
        self.assertEqual(Subject.objects.filter(school=self.school).count(), 0)
        final = ClassLevel.objects.filter(school=self.school, is_final=True)
        self.assertEqual([l.name for l in final], ['Class 6'])

    def test_french_and_bilingual_ladders(self):
        fr = make_school('LV-FR', subsystem='francophone')
        self.assertEqual([l.name for l in class_levels.ensure_default_levels(fr)['created']][3:5], ['SIL', 'CP'])
        bi = make_school('LV-BI', subsystem='bilingual')
        class_levels.ensure_default_levels(bi)
        self.assertEqual(ClassLevel.objects.filter(school=bi).count(), 18)
        cp = ClassLevel.objects.get(school=bi, name='CP')
        self.assertEqual(class_levels.next_level(cp).name, 'CE1')  # stays in the French ladder
        c5 = ClassLevel.objects.get(school=bi, name='Class 5')
        self.assertEqual(class_levels.next_level(c5).name, 'Class 6')

    def test_crud_rename_recomposes_class_names_and_pupils(self):
        level = self.client.post(f'{BASE}levels/', {'name': 'Class 1', 'cycle': 'primary'}, format='json')
        self.assertEqual(level.status_code, 201, level.data)
        klass = self.client.post(f'{BASE}classes/', {'level': level.data['id'], 'stream': 'a'}, format='json')
        self.assertEqual(klass.status_code, 201, klass.data)
        self.assertEqual((klass.data['name'], klass.data['stream'], klass.data['level_name']), ('Class 1 A', 'A', 'Class 1'))
        pupil = _pupil(self.school, SchoolClass.objects.get(pk=klass.data['id']), 1)
        self.assertEqual(pupil.class_level, 'Class 1')  # the level is the source of truth
        rename = self.client.patch(f'{BASE}levels/{level.data["id"]}/', {'name': 'Primary 1'}, format='json')
        self.assertEqual(rename.status_code, 200, rename.data)
        self.assertEqual(rename.data['classes_renamed'], 1)
        pupil.refresh_from_db()
        self.assertEqual((pupil.student_class, pupil.class_level), ('Primary 1 A', 'Primary 1'))

    def test_duplicate_level_name_rejected_and_delete_is_guarded(self):
        self.client.post(f'{BASE}levels/', {'name': 'Class 1'}, format='json')
        dup = self.client.post(f'{BASE}levels/', {'name': 'class 1'}, format='json')
        self.assertEqual(dup.status_code, 400)
        level = ClassLevel.objects.get(school=self.school, name='Class 1')
        SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Class 1 A', level=level, stream='A')
        self.assertEqual(self.client.delete(f'{BASE}levels/{level.id}/').status_code, 400)
        SchoolClass.objects.filter(level=level).delete()
        self.assertEqual(self.client.delete(f'{BASE}levels/{level.id}/').status_code, 204)

    def test_reorder(self):
        a = class_levels.create_level(self.school, name='L-a')
        b = class_levels.create_level(self.school, name='L-b')
        response = self.client.post(f'{BASE}levels/reorder/', {'ids': [str(b.id), str(a.id)]}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([l['name'] for l in response.data][:2], ['L-b', 'L-a'])

    def test_isolation_permissions_and_secondary(self):
        foreign = class_levels.create_level(self.other, name='Class 1')
        self.assertEqual(self.client.patch(f'{BASE}levels/{foreign.id}/', {'name': 'X'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'{BASE}levels/{foreign.id}/').status_code, 404)
        self.assertEqual(self.client.get(f'{BASE}levels/').data, [])
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(f'{BASE}levels/').status_code, 403)
        self.client.force_authenticate(self.sec_admin)
        self.assertEqual(self.client.post(f'{BASE}levels/seed/', {}, format='json').status_code, 400)
        self.assertEqual(ClassLevel.objects.filter(school=self.secondary).count(), 0)

    def test_sub_admin_reads_but_cannot_manage_levels(self):
        sub_admin = make_user(self.school, 'SUB_ADMIN', 'SUBL')
        sub_admin.sub_school = self.section
        sub_admin.save()
        self.client.force_authenticate(sub_admin)
        self.assertEqual(self.client.get(f'{BASE}levels/').status_code, 200)
        self.assertEqual(self.client.post(f'{BASE}levels/', {'name': 'Class 1'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'{BASE}levels/seed/', {}, format='json').status_code, 403)

    def test_secondary_school_class_cannot_take_a_level(self):
        level = class_levels.create_level(self.secondary, name='Class 1')
        self.client.force_authenticate(self.sec_admin)
        response = self.client.post('/api/v1/schools/hierarchy/classes/', {'name': 'Form 1', 'level': str(level.id)}, format='json')
        self.assertEqual(response.status_code, 400)


class ClassesUnderLevelTests(HubBase):
    def setUp(self):
        super().setUp()
        class_levels.ensure_default_levels(self.school)
        self.c1 = ClassLevel.objects.get(school=self.school, name='Class 1')

    def test_bulk_count_creates_a_b_c_and_continues(self):
        body = {'level': str(self.c1.id), 'count': 3}
        first = self.client.post(f'{BASE}classes/bulk/', body, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(sorted(c['name'] for c in first.data['created']), ['Class 1 A', 'Class 1 B', 'Class 1 C'])
        more = self.client.post(f'{BASE}classes/bulk/', {'level': str(self.c1.id), 'count': 1}, format='json')
        self.assertEqual([c['name'] for c in more.data['created']], ['Class 1 D'])
        for klass in SchoolClass.objects.filter(school=self.school):
            self.assertEqual(klass.level_id, self.c1.id)
            self.assertEqual(klass.cycle, 'primary')

    def test_bulk_streams_are_idempotent_and_free_names_work(self):
        body = {'level': str(self.c1.id), 'streams': ['A', 'Blue']}
        self.client.post(f'{BASE}classes/bulk/', body, format='json')
        again = self.client.post(f'{BASE}classes/bulk/', body, format='json')
        self.assertEqual((again.status_code, len(again.data['created']), len(again.data['existing'])), (200, 0, 2))
        self.assertTrue(SchoolClass.objects.filter(school=self.school, name='Class 1 Blue', stream='Blue').exists())

    def test_existing_unleveled_class_is_adopted_not_duplicated(self):
        legacy = SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Class 1 A', cycle='primary')
        pupil = _pupil(self.school, legacy, 1)
        response = self.client.post(f'{BASE}classes/bulk/', {'level': str(self.c1.id), 'streams': ['A', 'B']}, format='json')
        self.assertEqual((len(response.data['created']), len(response.data['adopted'])), (1, 1))
        legacy.refresh_from_db()
        pupil.refresh_from_db()
        self.assertEqual((legacy.level_id, legacy.stream, legacy.name), (self.c1.id, 'A', 'Class 1 A'))
        self.assertEqual(pupil.class_level, 'Class 1')
        self.assertEqual(SchoolClass.objects.filter(school=self.school, name='Class 1 A').count(), 1)

    def test_other_school_level_rejected(self):
        foreign = class_levels.create_level(self.other, name='Class 1')
        response = self.client.post(f'{BASE}classes/bulk/', {'level': str(foreign.id), 'count': 1}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(SchoolClass.objects.filter(school=self.other).exists())

    def test_names_mode_places_class_in_its_level(self):
        self.client.post(f'{BASE}classes/bulk/', {'names': ['Class 1 C', 'Playgroup']}, format='json')
        placed = SchoolClass.objects.get(school=self.school, name='Class 1 C')
        self.assertEqual((placed.level_id, placed.stream), (self.c1.id, 'C'))
        self.assertIsNone(SchoolClass.objects.get(school=self.school, name='Playgroup').level_id)

    def test_create_single_class_with_level_and_clash(self):
        ok = self.client.post(f'{BASE}classes/', {'level': str(self.c1.id), 'stream': 'A'}, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)
        clash = self.client.post(f'{BASE}classes/', {'level': str(self.c1.id), 'stream': 'a'}, format='json')
        self.assertEqual(clash.status_code, 400)
        nothing = self.client.post(f'{BASE}classes/', {}, format='json')
        self.assertEqual(nothing.status_code, 400)

    def test_summary_counts_per_level(self):
        self.client.post(f'{BASE}classes/bulk/', {'level': str(self.c1.id), 'count': 2}, format='json')
        SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Odd class')
        summary = self.client.get(f'{BASE}setup-summary/').data
        row = next(l for l in summary['levels'] if l['name'] == 'Class 1')
        self.assertEqual(row['classes'], 2)
        self.assertEqual([c['name'] for c in summary['unleveled_classes']], ['Odd class'])

    def test_no_subjects_are_ever_created(self):
        self.client.post(f'{BASE}setup/quick/', {'languages': ['en', 'fr']}, format='json')
        self.client.post(f'{BASE}classes/bulk/', {'level': str(self.c1.id), 'count': 3}, format='json')
        make_school('NEWSCH')
        self.assertEqual((Subject.objects.count(), ClassSubject.objects.count()), (0, 0))


class BackfillCommandTests(APITestCase):
    def setUp(self):
        self.school = make_school('BF-1')
        self.section = SubSchool.objects.get(school=self.school)
        self.secondary = make_school('BF-S', 'secondary')
        mk = lambda n: SchoolClass.objects.create(school=self.school, sub_school=self.section, name=n)  # noqa: E731
        self.a, self.b, self.nur = mk('Class 3 A'), mk('Class 3 B'), mk('Nursery 2')
        self.odd, self.dupe = mk('Playgroup'), mk('Primary 3 A')  # no level / collides with Class 3 A
        self.form = SchoolClass.objects.create(school=self.secondary, name='Form 1 A')
        self.pupil = _pupil(self.school, self.a, 1)

    def _run(self, *args):
        out = StringIO()
        call_command('backfill_class_levels', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_writes_nothing(self):
        output = self._run()
        self.assertIn('DRY-RUN', output)
        self.assertFalse(ClassLevel.objects.exists())
        self.assertTrue(all(c.level_id is None for c in SchoolClass.objects.all()))
        self.assertIn("'Playgroup': no level", output)

    def test_apply_places_classes_keeps_names_and_is_idempotent(self):
        names_before = {c.pk: c.name for c in SchoolClass.objects.all()}
        self._run('--apply', '--log-file', str(self._tmp()))
        self.a.refresh_from_db(), self.b.refresh_from_db(), self.nur.refresh_from_db()
        self.assertEqual((self.a.level.name, self.a.stream), ('Class 3', 'A'))
        self.assertEqual((self.b.level.name, self.b.stream), ('Class 3', 'B'))
        self.assertEqual(self.nur.level.name, 'Nursery 2')
        self.assertIsNone(SchoolClass.objects.get(pk=self.odd.pk).level_id)     # ambiguous: left, reported
        self.assertIsNone(SchoolClass.objects.get(pk=self.dupe.pk).level_id)    # same level+stream as Class 3 A
        self.assertEqual(names_before, {c.pk: c.name for c in SchoolClass.objects.all()})
        self.pupil.refresh_from_db()
        self.assertEqual(self.pupil.school_class_id, self.a.id)  # class untouched
        self.assertEqual(self.pupil.class_level, 'Class 3')       # derived label follows the level
        levels, placed = ClassLevel.objects.count(), SchoolClass.objects.filter(level__isnull=False).count()
        self._run('--apply', '--log-file', str(self._tmp()))
        self.assertEqual((levels, placed), (ClassLevel.objects.count(), SchoolClass.objects.filter(level__isnull=False).count()))

    def test_secondary_school_untouched(self):
        self._run('--apply', '--log-file', str(self._tmp()))
        self.assertFalse(ClassLevel.objects.filter(school=self.secondary).exists())
        self.form.refresh_from_db()
        self.assertIsNone(self.form.level_id)

    def _tmp(self):
        import tempfile
        from pathlib import Path

        return Path(tempfile.mkdtemp()) / 'log.csv'


class ClassSyncTests(APITestCase):
    def test_level_is_source_of_truth_with_name_fallback_and_repair_command(self):
        school = make_school('CS-1')
        section = SubSchool.objects.get(school=school)
        level = class_levels.create_level(school, name='Class 2')
        leveled = SchoolClass.objects.create(school=school, sub_school=section, name='Class 2 B', level=level, stream='B')
        plain = SchoolClass.objects.create(school=school, sub_school=section, name='Mystery')
        p1, p2 = _pupil(school, leveled, 1), _pupil(school, plain, 2)
        self.assertEqual(p1.class_level, 'Class 2')
        self.assertEqual(p2.class_level, 'Mystery')  # inference fallback unchanged
        from apps.students.models import Student

        Student.objects.filter(pk=p1.pk).update(class_level='Class 2 B')  # drift
        out = StringIO()
        call_command('sync_student_class_fields', '--school', school.short_name, '--apply',
                     '--log-file', str(ClassSyncTests._log()), stdout=out)
        p1.refresh_from_db()
        self.assertEqual((p1.class_level, p1.school_class_id), ('Class 2', leveled.id))

    @staticmethod
    def _log():
        import tempfile
        from pathlib import Path

        return Path(tempfile.mkdtemp()) / 'sync.csv'

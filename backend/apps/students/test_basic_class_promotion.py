"""Level based promotion preview / confirm and the bulk "Move pupils" tool (Basic Education)."""

from collections import Counter
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.schools import class_levels
from apps.schools.models import ClassLevel, School, SchoolClass, SchoolSettings, SubSchool
from apps.students import api as students_api
from apps.students.models import Student, StudentMoveLog, StudentPromotionRecord

User = get_user_model()
BASE = '/api/v1/students/students/'
YEAR = '2026-2027'
_counter = iter(range(1, 100000))


def make_school(sid, category='basic'):
    school = School.objects.create(
        id=sid, name=f'{sid} School', short_name=sid, principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone', education_category=category,
    )
    SchoolSettings.objects.create(school=school, academic_year=YEAR)
    return school


def make_user(school, role, tag):
    return User.objects.create_user(
        matricule=f'{tag}-{school.id}', name=f'{tag} {school.id}', email=f'{tag.lower()}-{school.id}@example.org'.lower(),
        role=role, school=school, password='password123', is_license_paid=True,
    )


def pupil(school, klass, name=None, gender='male'):
    n = next(_counter)
    return students_api.enrol_student(
        user=None, name=name or f'Pupil {n:04d}', matricule=f'{school.id}P{n:05d}', school=school,
        school_class=klass, student_class=klass.name, class_level='x', section='General',
        admission_number=f'{school.id}-{n}', gender=gender,
    )


class Base(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.school = make_school('PL-1')
        cls.other = make_school('PL-2')
        cls.secondary = make_school('PL-S', 'secondary')
        cls.head = make_user(cls.school, 'SCHOOL_ADMIN', 'HEAD')
        cls.other_head = make_user(cls.other, 'SCHOOL_ADMIN', 'HEAD')
        cls.teacher = make_user(cls.school, 'TEACHER', 'TCH')
        cls.section = SubSchool.objects.get(school=cls.school)
        class_levels.ensure_default_levels(cls.school)
        cls.lv = {l.name: l for l in ClassLevel.objects.filter(school=cls.school)}

    def setUp(self):
        self.client.force_authenticate(self.head)

    def classes(self, level, streams, school=None):
        school = school or self.school
        lv = ClassLevel.objects.get(school=school, name=level)
        return [class_levels.create_classes_in_level(school, lv, SubSchool.objects.get(school=school), streams=[s])['created'][0]
                for s in streams]

    def preview(self, **params):
        params.setdefault('academic_year', YEAR)
        return self.client.get(BASE + 'basic-promotion/preview/', params)

    def confirm(self, overrides=None, **extra):
        return self.client.post(BASE + 'basic-promotion/confirm/', {'academic_year': YEAR, 'overrides': overrides or [], **extra}, format='json')

    @staticmethod
    def targets(response):
        return {r['name']: (r['target_class'] or {}).get('name') for r in response.data['rows']}


class PreviewRuleTests(Base):
    def test_same_letter_is_kept_by_default(self):
        c1a, c1b = self.classes('Class 1', ['A', 'B'])
        self.classes('Class 2', ['A', 'B'])
        pa, pb = pupil(self.school, c1a, 'Ann'), pupil(self.school, c1b, 'Bob')
        response = self.preview()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.targets(response)['Ann'], 'Class 2 A')
        self.assertEqual(self.targets(response)['Bob'], 'Class 2 B')
        self.assertEqual(response.data['blockers'], [])
        # a preview never writes
        pa.refresh_from_db()
        self.assertEqual(pa.school_class_id, c1a.id)
        self.assertFalse(StudentPromotionRecord.objects.exists())

    def test_fewer_target_classes_distribute_evenly_and_deterministically(self):
        sources = self.classes('Class 3', ['A', 'B', 'C'])
        t4a, t4b = self.classes('Class 4', ['A', 'B'])
        for index, klass in enumerate(sources):
            for k in range(7 if index == 0 else 6):  # 19 pupils
                pupil(self.school, klass, gender='female' if k % 2 else 'male')
        first = self.preview()
        counts = Counter(r['target_class']['name'] for r in first.data['rows'])
        self.assertEqual(sorted(counts.values()), [9, 10])
        by_gender = {t['name']: (t['male'], t['female']) for t in first.data['by_target']}
        males = [m for m, f in by_gender.values()]
        self.assertLessEqual(abs(males[0] - males[1]), 1)
        self.assertEqual(self.targets(first), self.targets(self.preview()))  # stable, no randomness
        self.assertEqual(first.data['summary']['promote'], 19)

    def test_single_target_class_receives_everyone(self):
        sources = self.classes('Class 1', ['A', 'B'])
        (only,) = self.classes('Class 2', ['A'])
        for klass in sources:
            pupil(self.school, klass)
            pupil(self.school, klass)
        self.assertEqual({r['target_class']['id'] for r in self.preview().data['rows']}, {str(only.id)})

    def test_more_targets_than_sources_match_by_stream_then_order(self):
        (c1,) = self.classes('Class 1', ['B'])
        self.classes('Class 2', ['A', 'B', 'C'])
        pupil(self.school, c1, 'Zed')
        self.assertEqual(self.targets(self.preview())['Zed'], 'Class 2 B')

    def test_missing_target_level_classes_is_a_clear_blocker_and_confirm_refuses(self):
        (c2,) = self.classes('Class 2', ['A'])
        pupil(self.school, c2, 'Stuck')
        response = self.preview()
        self.assertEqual(response.data['summary']['blocked'], 1)
        self.assertFalse(response.data['can_confirm'])
        self.assertEqual(response.data['blockers'][0]['message'], 'Create classes for Class 3 first.')
        refused = self.confirm()
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(Student.objects.get(name='Stuck').school_class_id, c2.id)
        self.assertFalse(StudentPromotionRecord.objects.exists())

    def test_final_level_graduates_and_nobody_moves(self):
        (c6,) = self.classes('Class 6', ['A'])
        kid = pupil(self.school, c6, 'Grad')
        response = self.preview()
        self.assertEqual(response.data['summary']['graduate'], 1)
        # Meeting the pass average in the final class graduates, with the promotion.
        done = self.confirm().data
        self.assertEqual(done['graduated'], 1)
        kid.refresh_from_db()
        self.assertEqual(kid.school_class_id, c6.id)
        self.assertEqual(StudentPromotionRecord.objects.get(student=kid).status, 'GRADUATED')

    def test_graduating_one_class_leaves_the_rest_and_other_classes_alone(self):
        (c5,) = self.classes('Class 5', ['A'])
        (c6,) = self.classes('Class 6', ['A'])
        a, b, mover = pupil(self.school, c6, 'A'), pupil(self.school, c6, 'B'), pupil(self.school, c5, 'Mover')
        done = self.confirm(graduate_ids=[str(a.id)], graduate_only=True).data
        self.assertEqual((done['graduated'], done['promoted']), (1, 0))
        self.assertEqual(StudentPromotionRecord.objects.get(student=a).status, 'GRADUATED')
        self.assertFalse(StudentPromotionRecord.objects.filter(student__in=[b, mover]).exists())
        mover.refresh_from_db()
        self.assertEqual(mover.school_class_id, c5.id)

    def test_repeaters_stay_in_the_same_class(self):
        (c4,) = self.classes('Class 4', ['A'])
        self.classes('Class 5', ['A'])
        weak, strong = pupil(self.school, c4, 'Weak'), pupil(self.school, c4, 'Strong')
        Student.objects.filter(pk=weak.pk).update(annual_average=Decimal('6.00'))
        Student.objects.filter(pk=strong.pk).update(annual_average=Decimal('15.00'))
        rows = {r['name']: r for r in self.preview().data['rows']}
        self.assertEqual(rows['Weak']['decision'], 'repeat')
        self.assertEqual(rows['Strong']['decision'], 'promote')
        self.confirm()
        weak.refresh_from_db(), strong.refresh_from_db()
        self.assertEqual(weak.school_class_id, c4.id)
        self.assertEqual(strong.school_class.name, 'Class 5 A')
        self.assertEqual(StudentPromotionRecord.objects.get(student=weak).status, 'REPEATED')

    def test_nursery_promotes_without_marks_by_default(self):
        (n1,) = self.classes('Nursery 1', ['A'])
        self.classes('Nursery 2', ['A'])
        kid = pupil(self.school, n1, 'Tiny')
        Student.objects.filter(pk=kid.pk).update(annual_average=Decimal('2.00'))
        self.assertEqual(self.preview().data['rows'][0]['decision'], 'promote')
        settings = self.school.settings
        settings.assessment_config = {'nursery_promote_without_marks': False}
        settings.save()
        self.assertEqual(self.preview().data['rows'][0]['decision'], 'repeat')

    def test_class_without_level_falls_back_to_name_ladder(self):
        legacy = SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Class 1 Z')
        SchoolClass.objects.create(school=self.school, sub_school=self.section, name='Class 2 Z')
        pupil(self.school, legacy, 'Old')
        self.assertEqual(self.targets(self.preview())['Old'], 'Class 2 Z')


class ConfirmTests(Base):
    def setUp(self):
        super().setUp()
        self.c1a, self.c1b = self.classes('Class 1', ['A', 'B'])
        self.c2a, self.c2b = self.classes('Class 2', ['A', 'B'])
        self.pa, self.pb = pupil(self.school, self.c1a, 'Ann'), pupil(self.school, self.c1b, 'Bob')

    def test_override_per_pupil_then_confirm_is_atomic_and_resyncs_fields(self):
        response = self.confirm([{'student': str(self.pa.pk), 'target_class': str(self.c2b.id)}])
        self.assertEqual(response.status_code, 200, response.data)
        self.pa.refresh_from_db(), self.pb.refresh_from_db()
        self.assertEqual(self.pa.school_class_id, self.c2b.id)
        self.assertEqual((self.pa.student_class, self.pa.class_level), ('Class 2 B', 'Class 2'))
        self.assertEqual(self.pb.school_class_id, self.c2b.id)
        record = StudentPromotionRecord.objects.get(student=self.pa)
        self.assertEqual((record.status, record.decided_by_id, record.promoted_to_class_id), ('PROMOTED', self.head.id, self.c2b.id))
        self.assertEqual(record.current_class_name, 'Class 1 A')
        self.assertTrue(record.is_applied)

    def test_override_repeat(self):
        self.confirm([{'student': str(self.pa.pk), 'action': 'repeat'}])
        self.pa.refresh_from_db()
        self.assertEqual(self.pa.school_class_id, self.c1a.id)
        self.assertEqual(StudentPromotionRecord.objects.get(student=self.pa).status, 'REPEATED')

    def test_confirm_twice_does_not_promote_twice(self):
        self.classes('Class 3', ['A', 'B'])
        self.assertEqual(self.confirm().data['promoted'], 2)
        again = self.confirm()
        self.assertEqual(again.status_code, 200)
        self.assertEqual((again.data['promoted'], again.data['already_applied']), (0, 2))
        self.pa.refresh_from_db()
        self.assertEqual(self.pa.school_class.name, 'Class 2 A')  # not Class 3 A
        self.assertEqual(StudentPromotionRecord.objects.filter(student=self.pa).count(), 1)

    def test_atomic_failure_moves_nobody(self):
        (c3,) = self.classes('Class 3', ['A'])
        stuck = pupil(self.school, self.c2a, 'Blocked-later')
        SchoolClass.objects.filter(level=self.lv['Class 3']).delete()  # Class 2 now has no target
        response = self.confirm()
        self.assertEqual(response.status_code, 400)
        self.pa.refresh_from_db(), stuck.refresh_from_db()
        self.assertEqual(self.pa.school_class_id, self.c1a.id)
        self.assertEqual(stuck.school_class_id, self.c2a.id)
        self.assertFalse(StudentPromotionRecord.objects.exists())

    def test_blocked_pupil_can_be_resolved_by_override(self):
        stuck = pupil(self.school, self.c2a, 'Stuck')  # Class 3 has no classes
        self.assertEqual(self.confirm().status_code, 400)
        ok = self.confirm([{'student': str(stuck.pk), 'action': 'repeat'}])
        self.assertEqual(ok.status_code, 200, ok.data)

    def test_no_pupil_is_lost(self):
        self.classes('Class 3', ['A'])
        extra = [pupil(self.school, self.c1a) for _ in range(5)]
        before = Student.objects.filter(school=self.school).count()
        self.confirm()
        self.assertEqual(Student.objects.filter(school=self.school).count(), before)
        self.assertEqual(Student.objects.filter(school=self.school, school_class__isnull=True).count(), 0)
        self.assertEqual(StudentPromotionRecord.objects.count(), before)

    def test_override_to_foreign_class_rejected(self):
        foreign = self.classes('Class 2', ['A'], school=self.other) if False else None
        other_level = ClassLevel.objects.get(school=self.other, name='Class 2')
        foreign = SchoolClass.objects.create(school=self.other, name='Class 2 A', level=other_level, stream='A')
        response = self.confirm([{'student': str(self.pa.pk), 'target_class': str(foreign.id)}])
        self.assertEqual(response.status_code, 400)
        self.pa.refresh_from_db()
        self.assertEqual(self.pa.school_class_id, self.c1a.id)

    def test_only_the_head_confirms_but_sub_admin_can_preview(self):
        sub = make_user(self.school, 'SUB_ADMIN', 'SUBP')
        sub.sub_school = self.section
        sub.save()
        self.client.force_authenticate(sub)
        self.assertEqual(self.preview().status_code, 200)
        self.assertEqual(self.confirm().status_code, 403)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.preview().status_code, 403)
        self.assertEqual(self.confirm().status_code, 403)

    def test_isolation_between_schools(self):
        self.client.force_authenticate(self.other_head)
        response = self.preview()
        self.assertEqual(response.data['rows'], [])
        self.confirm()
        self.pa.refresh_from_db()
        self.assertEqual(self.pa.school_class_id, self.c1a.id)

    def test_secondary_school_is_refused_and_untouched(self):
        sec_head = make_user(self.secondary, 'SCHOOL_ADMIN', 'SEC')
        form = SchoolClass.objects.create(school=self.secondary, name='Form 1')
        pupil(self.secondary, form, 'Sec')
        self.client.force_authenticate(sec_head)
        self.assertEqual(self.preview().status_code, 400)
        self.assertEqual(self.confirm().status_code, 400)
        self.assertEqual(Student.objects.get(name='Sec').school_class_id, form.id)


class BulkMoveTests(Base):
    def setUp(self):
        super().setUp()
        self.c1a, self.c1b = self.classes('Class 1', ['A', 'B'])
        (self.c2a,) = self.classes('Class 2', ['A'])
        self.kids = [pupil(self.school, self.c1a) for _ in range(3)]
        self.ids = [str(k.pk) for k in self.kids]

    def move(self, target, **extra):
        return self.client.post(BASE + 'bulk-move/', {'student_ids': self.ids, 'target_class': str(target.id), **extra}, format='json')

    def test_move_inside_level_is_audited_and_resyncs(self):
        response = self.move(self.c1b)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data['moved'], response.data['crossed_level']), (3, 0))
        for kid in self.kids:
            kid.refresh_from_db()
            self.assertEqual((kid.school_class_id, kid.student_class, kid.class_level), (self.c1b.id, 'Class 1 B', 'Class 1'))
        self.assertEqual(StudentMoveLog.objects.filter(moved_by=self.head, to_class=self.c1b).count(), 3)

    def test_crossing_levels_needs_acknowledgement(self):
        warned = self.move(self.c2a)
        self.assertEqual(warned.status_code, 409)
        self.assertTrue(warned.data['requires_confirmation'])
        self.assertEqual(len(warned.data['crossing']), 3)
        self.kids[0].refresh_from_db()
        self.assertEqual(self.kids[0].school_class_id, self.c1a.id)
        self.assertFalse(StudentMoveLog.objects.exists())
        done = self.move(self.c2a, acknowledge_level_change=True)
        self.assertEqual((done.status_code, done.data['moved'], done.data['crossed_level']), (200, 3, 3))
        self.assertTrue(StudentMoveLog.objects.filter(crossed_level=True).count() == 3)

    def test_other_school_pupils_and_classes_are_rejected(self):
        theirs = pupil(self.other, SchoolClass.objects.create(school=self.other, name='Class 1 A'))
        mixed = self.client.post(BASE + 'bulk-move/', {'student_ids': self.ids + [str(theirs.pk)], 'target_class': str(self.c1b.id)}, format='json')
        self.assertEqual(mixed.status_code, 400)
        self.kids[0].refresh_from_db()
        self.assertEqual(self.kids[0].school_class_id, self.c1a.id)
        foreign = SchoolClass.objects.get(school=self.other)
        self.assertEqual(self.move(foreign).status_code, 404)

    def test_permissions_and_sub_admin_scope(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.move(self.c1b).status_code, 403)
        french = SubSchool.objects.create(school=self.school, name='French Section')
        elsewhere = SchoolClass.objects.create(school=self.school, sub_school=french, name='CP A')
        sub = make_user(self.school, 'SUB_ADMIN', 'SUBM')
        sub.sub_school = self.section
        sub.save()
        self.client.force_authenticate(sub)
        self.assertEqual(self.move(self.c1b).status_code, 200)
        self.assertEqual(self.move(elsewhere, acknowledge_level_change=True).status_code, 403)

    def test_empty_selection_and_idempotent_retry(self):
        empty = self.client.post(BASE + 'bulk-move/', {'student_ids': [], 'target_class': str(self.c1b.id)}, format='json')
        self.assertEqual(empty.status_code, 400)
        self.move(self.c1b)
        again = self.move(self.c1b)
        self.assertEqual((again.data['moved'], again.data['unchanged']), (0, 3))
        self.assertEqual(StudentMoveLog.objects.count(), 3)


class CreateMissingClassesTests(Base):
    def test_one_click_creates_the_classes_pupils_are_about_to_move_into(self):
        c1 = self.classes('Class 1', ['A', 'B'])
        pupil(self.school, c1[0])
        pupil(self.school, c1[1])
        blockers = self.preview().data['blockers']
        self.assertEqual([b['code'] for b in blockers], ['no_classes'])
        r = self.client.post(BASE + 'basic-promotion/create-missing-classes/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(sorted(r.data['created']), ['Class 2 A', 'Class 2 B'])
        after = self.preview().data
        self.assertEqual(after['blockers'], [])
        self.assertTrue(after['can_confirm'])
        again = self.client.post(BASE + 'basic-promotion/create-missing-classes/', {}, format='json')
        self.assertEqual(again.data['created'], [])

    def test_only_the_head_and_only_basic_schools(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.post(BASE + 'basic-promotion/create-missing-classes/', {}, format='json').status_code, 403)
        sec_head = make_user(self.secondary, 'SCHOOL_ADMIN', 'HEAD')
        self.client.force_authenticate(sec_head)
        self.assertIn(self.client.post(BASE + 'basic-promotion/create-missing-classes/', {}, format='json').status_code, (400, 403))


class SchoolAverageAndRepeatersTests(Base):
    """The head sets ONE average for the whole school, promotes everyone, then promotes repeaters (some or all)."""

    def setUp(self):
        super().setUp()
        self.c4 = self.classes('Class 4', ['A', 'B'])
        self.c5 = self.classes('Class 5', ['A', 'B'])
        self.weak = pupil(self.school, self.c4[0], 'Weak')
        self.middling = pupil(self.school, self.c4[0], 'Middling')
        self.strong = pupil(self.school, self.c4[1], 'Strong')
        for p, avg in ((self.weak, '6.00'), (self.middling, '10.00'), (self.strong, '15.00')):
            Student.objects.filter(pk=p.pk).update(annual_average=Decimal(avg))

    def confirm(self, **body):
        body.setdefault('academic_year', YEAR)
        return self.client.post(BASE + 'basic-promotion/confirm/', body, format='json')

    def decisions(self, **params):
        return {r['name']: r['decision'] for r in self.preview(**params).data['rows']}

    def test_equal_to_or_above_the_average_is_promoted_below_repeats(self):
        self.assertEqual(self.decisions(pass_average=10), {'Weak': 'repeat', 'Middling': 'promote', 'Strong': 'promote'})
        self.assertEqual(self.decisions(pass_average=16), {'Weak': 'repeat', 'Middling': 'repeat', 'Strong': 'repeat'})
        self.assertEqual(self.decisions(pass_average=5), {'Weak': 'promote', 'Middling': 'promote', 'Strong': 'promote'})

    def test_the_average_applies_to_every_class_and_is_remembered_after_promoting(self):
        r = self.confirm(pass_average=12)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['promoted'], r.data['repeated']), (1, 2))
        self.weak.refresh_from_db(), self.middling.refresh_from_db(), self.strong.refresh_from_db()
        self.assertEqual(self.weak.school_class_id, self.c4[0].id)
        self.assertEqual(self.middling.school_class_id, self.c4[0].id)
        self.assertEqual(self.strong.school_class.level.name, 'Class 5')
        self.school.settings.refresh_from_db()
        self.assertEqual(self.school.settings.promotion_average, Decimal('12.00'))

    def test_a_bad_average_is_refused_and_a_refused_promotion_changes_nothing(self):
        for bad in ('abc', '21', '-1'):
            self.assertEqual(self.confirm(pass_average=bad).status_code, 400, bad)
            self.assertEqual(self.preview(pass_average=bad).status_code, 400, bad)
        self.assertEqual(StudentPromotionRecord.objects.count(), 0)

    def test_repeaters_are_listed_after_promotion_and_can_be_promoted_some_or_all(self):
        self.assertEqual(self.client.get(BASE + 'basic-promotion/repeaters/', {'academic_year': YEAR}).data['rows'], [])
        self.confirm(pass_average=12)
        rows = self.client.get(BASE + 'basic-promotion/repeaters/', {'academic_year': YEAR}).data['rows']
        self.assertEqual(sorted(r['name'] for r in rows), ['Middling', 'Weak'])
        self.assertEqual(sorted(r['average'] for r in rows), [6.0, 10.0])
        one = self.client.post(BASE + 'basic-promotion/promote-repeaters/', {'academic_year': YEAR, 'student_ids': [str(self.middling.pk)]}, format='json')
        self.assertEqual(one.status_code, 200, one.data)
        self.middling.refresh_from_db(), self.weak.refresh_from_db()
        self.assertEqual(self.middling.school_class.level.name, 'Class 5')
        self.assertEqual(self.weak.school_class_id, self.c4[0].id)
        self.assertEqual(StudentPromotionRecord.objects.get(student=self.middling).status, 'PROMOTED')
        rest = self.client.post(BASE + 'basic-promotion/promote-repeaters/', {'academic_year': YEAR, 'all': True}, format='json')
        self.assertEqual(rest.data['promoted'], 1)
        self.weak.refresh_from_db()
        self.assertEqual(self.weak.school_class.level.name, 'Class 5')
        self.assertEqual(self.client.get(BASE + 'basic-promotion/repeaters/', {'academic_year': YEAR}).data['rows'], [])
        self.assertEqual(self.client.post(BASE + 'basic-promotion/promote-repeaters/', {'academic_year': YEAR, 'all': True}, format='json').status_code, 400)

    def test_only_a_repeater_can_be_chosen(self):
        self.confirm(pass_average=12)
        r = self.client.post(BASE + 'basic-promotion/promote-repeaters/', {'academic_year': YEAR, 'student_ids': [str(self.strong.pk)]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.strong.refresh_from_db()
        self.assertEqual(self.strong.school_class.level.name, 'Class 5')

    def test_a_repeater_of_the_final_class_graduates_when_promoted(self):
        c6 = self.classes('Class 6', ['A'])
        kid = pupil(self.school, c6[0], 'Final')
        Student.objects.filter(pk=kid.pk).update(annual_average=Decimal('4.00'))
        self.confirm(pass_average=10)
        r = self.client.post(BASE + 'basic-promotion/promote-repeaters/', {'academic_year': YEAR, 'student_ids': [str(kid.pk)]}, format='json')
        self.assertEqual((r.status_code, r.data['graduated']), (200, 1))
        self.assertEqual(StudentPromotionRecord.objects.get(student=kid).status, 'GRADUATED')

    def test_nothing_changes_when_a_repeater_has_no_class_to_go_to(self):
        (c1,) = self.classes('Class 1', ['A'])  # Class 2 does not exist yet
        kid = pupil(self.school, c1, 'Stuck')
        Student.objects.filter(pk=kid.pk).update(annual_average=Decimal('2.00'))
        self.confirm(pass_average=10)
        r = self.client.post(BASE + 'basic-promotion/promote-repeaters/', {'academic_year': YEAR, 'student_ids': [str(kid.pk)]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Create classes for Class 2', str(r.data))
        kid.refresh_from_db()
        self.assertEqual(kid.school_class_id, c1.id)
        self.assertEqual(StudentPromotionRecord.objects.get(student=kid).status, 'REPEATED')

    def test_only_the_head_and_each_school_separately(self):
        self.confirm(pass_average=12)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.post(BASE + 'basic-promotion/promote-repeaters/', {'academic_year': YEAR, 'all': True}, format='json').status_code, 403)
        self.client.force_authenticate(self.other_head)
        self.assertEqual(self.client.get(BASE + 'basic-promotion/repeaters/', {'academic_year': YEAR}).data['rows'], [])


class LowPassAverageTests(Base):
    """A school may set a pass average below 10 (some promote at 8, 7.5 or even 5): nothing forces 10."""

    def setUp(self):
        super().setUp()
        self.c3 = self.classes('Class 3', ['A'])
        self.c4 = self.classes('Class 4', ['A'])
        self.kids = {}
        for name, avg in (('Four', '4.00'), ('Five', '5.00'), ('SevenFive', '7.50'), ('Eight', '8.00'), ('Ten', '10.00')):
            self.kids[name] = pupil(self.school, self.c3[0], name)
            Student.objects.filter(pk=self.kids[name].pk).update(annual_average=Decimal(avg))

    def decisions(self, value):
        r = self.preview(pass_average=value)
        self.assertEqual(r.status_code, 200, r.data)
        return {row['name']: row['decision'] for row in r.data['rows']}

    def test_low_averages_decide_correctly(self):
        self.assertEqual(self.decisions('7.5'), {'Four': 'repeat', 'Five': 'repeat', 'SevenFive': 'promote', 'Eight': 'promote', 'Ten': 'promote'})
        self.assertEqual(self.decisions('5'), {'Four': 'repeat', 'Five': 'promote', 'SevenFive': 'promote', 'Eight': 'promote', 'Ten': 'promote'})
        self.assertEqual(set(self.decisions('0').values()), {'promote'})

    def test_a_low_average_is_saved_and_applied_when_promoting(self):
        r = self.client.post(BASE + 'basic-promotion/confirm/', {'academic_year': YEAR, 'overrides': [], 'pass_average': '7.5'}, format='json')
        self.assertEqual((r.status_code, r.data['promoted'], r.data['repeated']), (200, 3, 2), r.data)
        self.school.settings.refresh_from_db()
        self.assertEqual(self.school.settings.promotion_average, Decimal('7.50'))
        record = StudentPromotionRecord.objects.get(student=self.kids['Eight'])
        self.assertEqual(record.promotion_average, Decimal('7.50'))
        # Next year the saved low average is the one proposed by default, no pass_average needed.
        self.assertEqual(self.preview().data['pass_average'], 7.5)
        self.assertEqual(self.preview().data['school_pass_average'], 7.5)

    def test_zero_is_accepted_not_mistaken_for_empty(self):
        r = self.client.post(BASE + 'basic-promotion/confirm/', {'academic_year': YEAR, 'overrides': [], 'pass_average': 0}, format='json')
        self.assertEqual((r.status_code, r.data['promoted'], r.data['repeated']), (200, 5, 0), r.data)
        self.school.settings.refresh_from_db()
        self.assertEqual(self.school.settings.promotion_average, Decimal('0.00'))

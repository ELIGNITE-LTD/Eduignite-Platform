"""Assessment configuration: defaults pin today's behaviour, Basic Education may configure it."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from apps.attendance.models import AttendanceRecord, AttendanceSession
from apps.registry import api as registry_api
from apps.schools.models import ClassTeacherAssignment, School, SchoolClass, SchoolSettings
from apps.students import api as students_api

from .assessment_config import (
    AssessmentConfigError,
    default_assessment_config,
    get_assessment_config,
    is_default_assessment_config,
    validate_assessment_config,
)
from .models import ClassSubject, Grade, Sequence, Subject, TermResult
from .sequence_defaults import ensure_cameroon_sequences_for_school
from .utils import (
    generate_report_card_data,
    generate_term_report_card_data,
    get_grade_letter,
    get_remark,
)

User = get_user_model()


class DefaultsPinTodaysBehaviourTests(SimpleTestCase):
    def test_letter_boundaries_are_the_cameroon_scale(self):
        cases = [
            (20, 'A'), (16, 'A'), ('15.99', 'B'), (14, 'B'), ('13.99', 'C'), (12, 'C'),
            ('11.99', 'D'), (10, 'D'), ('9.99', 'F'), (0, 'F'),
        ]
        for score, letter in cases:
            self.assertEqual(get_grade_letter(score), letter, score)

    def test_remark_boundaries(self):
        cases = [(16, 'Excellent'), (14, 'Very Good'), (12, 'Good'), (10, 'Average'), (8, 'Poor'), ('7.99', 'Very Poor')]
        for score, remark in cases:
            self.assertEqual(get_remark(score), remark, score)

    def test_default_config_values(self):
        cfg = get_assessment_config(None)
        self.assertEqual((cfg.max_score, cfg.pass_mark), (Decimal(20), Decimal(10)))
        self.assertEqual(cfg.total_sequences, 6)
        self.assertTrue(cfg.use_coefficients and cfg.show_rank and cfg.show_average)
        self.assertEqual(cfg.grading_style, 'numeric')
        self.assertEqual(cfg.assessment_mode, 'sequence')
        self.assertEqual([(l, int(m)) for l, m in cfg.grade_bands], [('A', 16), ('B', 14), ('C', 12), ('D', 10), ('F', 0)])
        self.assertTrue(is_default_assessment_config({}))
        self.assertTrue(is_default_assessment_config(default_assessment_config()))


class ValidationTests(SimpleTestCase):
    def bad(self, raw, key):
        with self.assertRaises(AssessmentConfigError) as ctx:
            validate_assessment_config(raw)
        self.assertIn(key, ctx.exception.errors)

    def test_rejections(self):
        self.bad({'max_score': 0}, 'max_score')
        self.bad({'max_score': 101}, 'max_score')
        self.bad({'max_score': 10, 'pass_mark': 11}, 'pass_mark')
        self.bad({'unknown': 1}, 'assessment_config')
        self.bad({'grading_style': 'weird'}, 'grading_style')
        self.bad({'grade_bands': [{'letter': 'A', 'min_score': 5}, {'letter': 'B', 'min_score': 8}]}, 'grade_bands')
        self.bad({'max_score': 10, 'grade_bands': [{'letter': 'A', 'min_score': 11}, {'letter': 'F', 'min_score': 0}]}, 'grade_bands')
        self.bad({'grade_bands': [{'letter': 'A', 'min_score': 10}]}, 'grade_bands')  # lowest not 0
        self.bad({'grade_bands': [{'letter': ' ', 'min_score': 0}]}, 'grade_bands')
        self.bad({'descriptive_bands': [{'label': '', 'min_percent': 0}]}, 'descriptive_bands')
        self.bad({'descriptive_bands': [{'label': 'A', 'min_percent': 10}]}, 'descriptive_bands')
        self.bad({'sequences_per_term': 0}, 'sequences_per_term')
        self.bad({'evaluations_per_term': 4}, 'evaluations_per_term')
        self.bad({'show_rank': 'yes'}, 'show_rank')
        self.bad({'preset': 'nope'}, 'preset')

    def test_scaling_with_max_score(self):
        cfg = validate_assessment_config({'max_score': 100})
        self.assertEqual(cfg['pass_mark'], 50)
        self.assertEqual([b['min_score'] for b in cfg['grade_bands']], [80, 70, 60, 50, 0])

    def test_presets_are_overridable(self):
        nursery = validate_assessment_config({'preset': 'nursery_descriptive'})
        self.assertEqual(nursery['grading_style'], 'descriptive')
        self.assertFalse(nursery['show_rank'])
        self.assertFalse(nursery['show_average'])
        self.assertEqual([l['label'] for l in nursery['nursery_scale']], ['Beginning', 'Developing', 'Secure', 'Excelling'])
        self.assertEqual([l['label_fr'] for l in nursery['nursery_scale']], ['D\u00e9butant', 'En progr\u00e8s', 'Acquis', 'Excellent'])
        primary = validate_assessment_config({'preset': 'primary_numeric', 'pass_mark': 12})
        self.assertEqual((primary['max_score'], primary['pass_mark'], primary['assessment_mode']), (20, 12, 'term_based'))
        self.assertTrue(primary['show_rank'])
        self.assertEqual([(b['letter'], b['min_score']) for b in primary['grade_bands']], [
            ('Excellent', 18), ('Very Good', 16), ('Good', 14), ('Fairly Good', 12), ('Pass', 10), ('Fail', 0)])
        self.assertEqual(primary['grade_bands'][1]['label_fr'], 'Tr\u00e8s bien')
        self.assertEqual([e['label'] for e in primary['evaluation_labels']], ['Test', 'Exam'])
        self.assertEqual([e['label_fr'] for e in primary['evaluation_labels']], ['Devoir', 'Examen'])
        self.assertFalse(primary['show_subject_position'])
        self.assertTrue(primary['show_class_average'])

    def test_camel_case_aliases_from_document_config(self):
        cfg = validate_assessment_config({
            'maxScore': 40, 'passMark': 20, 'showRank': False, 'showSubjectPosition': False,
            'gradeBands': [{'label': 'Good', 'labelFr': 'Bien', 'min': 20}, {'label': 'Fail', 'min': 0}],
            'nurseryScale': [{'label': 'Low', 'labelFr': 'Bas'}, {'label': 'High'}],
        })
        self.assertEqual((cfg['max_score'], cfg['pass_mark'], cfg['show_rank'], cfg['show_subject_position']), (40, 20, False, False))
        self.assertEqual(cfg['grade_bands'][0], {'letter': 'Good', 'min_score': 20, 'label_fr': 'Bien'})
        self.assertEqual(cfg['nursery_scale'], [{'label': 'Low', 'label_fr': 'Bas'}, {'label': 'High'}])

    def test_nursery_scale_and_evaluation_labels_validation(self):
        self.bad({'nursery_scale': [{'label': 'only one'}]}, 'nursery_scale')
        self.bad({'nursery_scale': [{'label': str(i)} for i in range(7)]}, 'nursery_scale')
        self.bad({'nursery_scale': [{'label': 'a'}, {'label': ''}]}, 'nursery_scale')
        self.bad({'evaluation_labels': [{'label': 'a'}, {'label': 'b'}, {'label': 'c'}]}, 'evaluation_labels')
        self.bad({'show_conduct': 'no'}, 'show_conduct')


def _school(sid, category, **extra):
    school = School.objects.create(
        id=sid, name=f'{sid} School', short_name=sid[:4], principal='Mme Principal', location='Douala',
        email=f'{sid.lower()}@example.com', phone='237651000300', school_type='general',
        subsystem='anglophone', education_category=category,
    )
    SchoolSettings.objects.create(school=school, academic_year='2026-2027', term='First', **extra)
    registry_api.install(school, 'grades', notify=False)
    return school


class AssessmentWorld(APITestCase):
    def make(self, sid, category, config=None, cycle=None):
        school = _school(sid, category)
        if config is not None:
            settings_obj = school.settings
            settings_obj.assessment_config = validate_assessment_config(config)
            settings_obj.save()
            school = School.objects.get(pk=school.pk)
        klass = SchoolClass.objects.create(school=school, name='Class 3 A', **({'cycle': cycle} if cycle else {}))
        teacher = User.objects.create_user(
            matricule=f'{sid}-T1', name='Teach Er', email=f'{sid.lower()}t@example.com',
            role='TEACHER', school=school, password='password123',
        )
        admin = User.objects.create_user(
            matricule=f'{sid}-AD', name='Ad Min', email=f'{sid.lower()}a@example.com',
            role='SCHOOL_ADMIN', school=school, password='password123',
        )
        subject = Subject.objects.create(school=school, name='Mathematics', code='MATH', level='Class 3', coefficient=3)
        ClassSubject.objects.create(school_class=klass, subject=subject)
        pupil = students_api.enrol_student(  # login-less pupil
            user=None, name='Lone Pupil', matricule=f'{sid}ST0001', school=school, school_class=klass,
            student_class=klass.name, class_level=klass.name, section='English', admission_number=f'{sid}-ADM-1',
            guardian_name='Papa Pupil',
        )
        return {'school': school, 'class': klass, 'teacher': teacher, 'admin': admin, 'subject': subject, 'pupil': pupil}

    def sequences(self, school, count=6, per_term=None):
        per_term = per_term or count // 3
        out = []
        n = 0
        for term in (1, 2, 3):
            for _ in range(per_term):
                n += 1
                out.append(Sequence.objects.create(
                    school=school, academic_year='2026-2027', name=f'Sequence {n}', term=term,
                    start_date=date(2026, 9, 1), end_date=date(2027, 6, 30), is_active=(n == 1),
                ))
        return out


class SettingsApiTests(AssessmentWorld):
    def url(self, school):
        return f'/api/v1/schools/settings/{school.id}/'

    def test_secondary_school_cannot_change_but_can_send_defaults(self):
        w = self.make('SEC1', 'secondary')
        self.client.force_authenticate(w['admin'])
        denied = self.client.patch(self.url(w['school']), {'assessment_config': {'max_score': 10}}, format='json')
        self.assertEqual(denied.status_code, 400, denied.data)
        self.assertIn('assessment_config', str(denied.data))
        ok = self.client.patch(self.url(w['school']), {'assessment_config': {}}, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(School.objects.get(pk=w['school'].pk).settings.assessment_config, {})
        # presets are changes too
        preset = self.client.patch(self.url(w['school']), {'assessment_config': {'preset': 'primary_numeric'}}, format='json')
        self.assertEqual(preset.status_code, 400)

    def test_basic_school_can_configure_and_gets_full_normalised_config_back(self):
        w = self.make('BAS1', 'basic')
        self.client.force_authenticate(w['admin'])
        resp = self.client.patch(self.url(w['school']), {'assessment_config': {'max_score': 10}}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        cfg = resp.data['assessment_config']
        self.assertEqual((cfg['max_score'], cfg['pass_mark']), (10, 5))
        self.assertEqual(get_assessment_config(School.objects.get(pk=w['school'].pk)).max_score, Decimal(10))

    def test_basic_school_invalid_config_is_400(self):
        w = self.make('BAS2', 'basic')
        self.client.force_authenticate(w['admin'])
        for cfg in (
            {'max_score': 500},
            {'grade_bands': [{'letter': 'A', 'min_score': 5}, {'letter': 'B', 'min_score': 15}]},
            {'descriptive_bands': [{'label': '', 'min_percent': 0}]},
        ):
            resp = self.client.patch(self.url(w['school']), {'assessment_config': cfg}, format='json')
            self.assertEqual(resp.status_code, 400, cfg)

    def test_secondary_ignores_stored_config(self):
        w = self.make('SEC2', 'secondary')
        w['school'].settings.assessment_config = {'max_score': 10}
        w['school'].settings.save()
        self.assertEqual(get_assessment_config(School.objects.get(pk=w['school'].pk)).max_score, Decimal(20))


class GradeEntryTests(AssessmentWorld):
    BULK = '/api/v1/grades/grades/bulk_create/'

    def bulk(self, w, seq, score):
        cs = ClassSubject.objects.get(school_class=w['class'])
        ClassTeacherAssignment.objects.get_or_create(school_class=w['class'], teacher=w['teacher'])
        self.client.force_authenticate(w['teacher'])
        return self.client.post(self.BULK, {
            'sequence_id': str(seq.id), 'class_subject_id': str(cs.id),
            'grades': [{'student': str(w['pupil'].id), 'subject': str(w['subject'].id), 'score': score}],
        }, format='json')

    def test_secondary_default_0_to_20(self):
        w = self.make('SEC3', 'secondary')
        w['class'].class_master = w['teacher']
        w['class'].save()
        ClassSubject.objects.filter(school_class=w['class']).update(teacher=w['teacher'])
        seq = self.sequences(w['school'])[0]
        too_high = self.bulk(w, seq, 21)
        self.assertEqual(too_high.status_code, 400)
        self.assertIn('Row 1: mark must be between 0 and 20.', str(too_high.data))
        self.assertEqual(self.bulk(w, seq, 20).status_code, 201)

    def test_basic_100_scale(self):
        w = self.make('BAS3', 'basic', {'max_score': 100})
        seq = self.sequences(w['school'])[0]
        self.assertEqual(self.bulk(w, seq, 101).status_code, 400)
        resp = self.bulk(w, seq, 85)
        self.assertEqual(resp.status_code, 201, resp.data)
        grade = Grade.objects.get(student=w['pupil'])
        self.assertEqual(grade.get_grade_letter(), 'A')  # 85/100 -> A (>=80)
        grade.score = Decimal('69.99')
        self.assertEqual(grade.get_grade_letter(), 'C')

    def test_basic_default_config_still_20(self):
        w = self.make('BAS4', 'basic')
        seq = self.sequences(w['school'])[0]
        self.assertEqual(self.bulk(w, seq, 21).status_code, 400)
        self.assertEqual(self.bulk(w, seq, 20).status_code, 201)


class CalendarTests(AssessmentWorld):
    URL = '/api/v1/grades/sequences/configure-cameroon-calendar/'

    def test_default_school_gets_six_and_exactly_six_rule(self):
        w = self.make('SEC4', 'secondary')
        ensure_cameroon_sequences_for_school(w['school'])
        self.assertEqual(Sequence.objects.filter(school=w['school']).count(), 6)
        self.client.force_authenticate(w['admin'])
        resp = self.client.post(self.URL, {
            'academic_year': '2026-2027',
            'sequences': [{'name': 'S1', 'term': 1, 'start_date': '2026-09-01', 'end_date': '2026-10-01'}] * 5,
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Provide exactly the six Cameroon sequences for the academic year.', str(resp.data))

    def test_basic_three_per_term(self):
        w = self.make('BAS5', 'basic', {'sequences_per_term': 3})
        ensure_cameroon_sequences_for_school(w['school'])
        seqs = Sequence.objects.filter(school=w['school'])
        self.assertEqual(seqs.count(), 9)
        self.assertEqual({t: seqs.filter(term=t).count() for t in (1, 2, 3)}, {1: 3, 2: 3, 3: 3})

    def test_basic_nursery_preset_one_per_term(self):
        w = self.make('BAS6', 'basic', {'preset': 'nursery_descriptive'})
        ensure_cameroon_sequences_for_school(w['school'])
        self.assertEqual(Sequence.objects.filter(school=w['school']).count(), 3)


class ReportCardTests(AssessmentWorld):
    def grade(self, w, seq, score):
        return Grade.objects.create(
            student=w['pupil'], subject=w['subject'], sequence=seq, school=w['school'],
            school_class=w['class'], score=Decimal(str(score)), teacher=w['teacher'],
        )

    def test_default_secondary_payload_values_unchanged(self):
        w = self.make('SEC5', 'secondary')
        seqs = self.sequences(w['school'])
        self.grade(w, seqs[0], 15)
        self.grade(w, seqs[1], 10)
        data = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        row = data['grades'][0]
        self.assertEqual((row['score'], row['grade_letter'], row['remark'], row['coefficient'], row['total']), (12.5, 'C', 'Good', 3.0, 37.5))
        self.assertEqual((data['average'], data['promotion_status'], data['rank']), (12.5, 'Promoted', 1))
        self.assertEqual(data['max_score'], 20.0)
        self.assertEqual(data['assessment']['assessment_mode'], 'sequence')
        # term 3 on defaults still aggregates all six sequences
        self.grade(w, seqs[2], 20)
        t3 = generate_term_report_card_data(w['pupil'], 3, '2026-2027')
        self.assertEqual(t3['grades'][0]['score'], 15.0)
        self.assertNotIn('annual_average', t3)

    def test_loginless_pupil_payload_has_the_checklist(self):
        w = self.make('BAS7', 'basic')
        seqs = self.sequences(w['school'])
        self.grade(w, seqs[0], 14)
        TermResult.objects.create(
            student=w['pupil'], school=w['school'], academic_year='2026-2027', term=1, average=14,
            teacher_comment='Good progress', principal_remark='Well done', conduct='Good',
        )
        ClassTeacherAssignment.objects.create(school_class=w['class'], teacher=w['teacher'], is_lead=True)
        session = AttendanceSession.objects.create(
            school=w['school'], teacher=w['teacher'], school_class=w['class'], date=date(2026, 9, 10),
            period='daily', session_type=AttendanceSession.TYPE_DAILY,
        )
        AttendanceRecord.objects.create(session=session, student=w['pupil'], status='present')
        # a period-based record must not count towards a basic school's days
        period = AttendanceSession.objects.create(
            school=w['school'], teacher=w['teacher'], school_class=w['class'], date=date(2026, 9, 11), period='morning',
        )
        AttendanceRecord.objects.create(session=period, student=w['pupil'], status='absent')

        data = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        self.assertEqual(data['student']['matricule'], 'BAS7ST0001')
        self.assertEqual(data['student']['name'], 'Lone Pupil')
        self.assertEqual(data['school']['name'], 'BAS7 School')
        self.assertEqual((data['class_name'], data['section'], data['academic_year']), ('Class 3 A', 'English', '2026-2027'))
        self.assertEqual(data['teacher_comment'], 'Good progress')
        self.assertEqual(data['headmaster_comment'], 'Well done')
        self.assertEqual(data['signatures']['class_teacher'], {'name': 'Teach Er', 'signature': ''})
        self.assertEqual(data['signatures']['headmaster']['name'], 'Mme Principal')
        self.assertEqual(data['signatures']['parent']['name'], 'Papa Pupil')
        self.assertEqual((data['attendance']['days_present'], data['attendance']['days_absent']), (1, 0))
        self.assertEqual(data['total_marks'], 42.0)
        self.assertEqual(data['grades'][0]['grade_label'], 'B')
        # sequence card too
        seq_data = generate_report_card_data(w['pupil'], seqs[0])
        self.assertEqual(seq_data['student']['matricule'], 'BAS7ST0001')
        self.assertEqual(seq_data['signatures']['headmaster']['signature'], '')

    def test_primary_numeric_term_based_annual_average(self):
        w = self.make('BAS8', 'basic', {'preset': 'primary_numeric'})
        seqs = self.sequences(w['school'], count=6)
        for seq, score in zip(seqs, (10, 12, 14, 16, 18, 20)):
            self.grade(w, seq, score)
        t3 = generate_term_report_card_data(w['pupil'], 3, '2026-2027')
        self.assertEqual(t3['grades'][0]['score'], 19.0)  # own term's evaluations only
        self.assertEqual(t3['term_averages'], {'1': 11.0, '2': 15.0, '3': 19.0})
        self.assertEqual(t3['annual_average'], 15.0)
        self.assertEqual(t3['assessment_mode'], 'term_based')

    def test_nursery_layout_areas_without_marks(self):
        from .models import AssessmentArea, AssessmentRating

        w = self.make('BAS9', 'basic', {'preset': 'nursery_descriptive'}, cycle='nursery')
        self.sequences(w['school'], count=3)
        area = AssessmentArea.objects.create(school=w['school'], name='Language', name_fr='Langage', order_index=1)
        AssessmentArea.objects.create(school=w['school'], name='Hidden', active=False)
        AssessmentRating.objects.create(
            school=w['school'], student=w['pupil'], area=area, academic_year='2026-2027', term=1, level=3,
        )
        data = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        self.assertEqual(data['layout'], 'nursery')
        self.assertEqual(len(data['areas']), 1)
        self.assertEqual((data['areas'][0]['name'], data['areas'][0]['level'], data['areas'][0]['label'], data['areas'][0]['label_fr']),
                         ('Language', 3, 'Secure', 'Acquis'))
        self.assertEqual(len(data['nursery_scale']), 4)
        self.assertIsNone(data['rank'])
        self.assertIsNone(data['average'])
        self.assertFalse(data['show_rank'])
        self.assertEqual(data['promotion_decision'], None)  # only on the final term
        self.assertEqual(generate_term_report_card_data(w['pupil'], 3, '2026-2027')['promotion_decision'], 'pending')

    def test_primary_layout_labels_bands_and_decision(self):
        w = self.make('BAS11', 'basic', {'preset': 'primary_numeric'}, cycle='primary')
        seqs = self.sequences(w['school'], count=6)
        for seq, score in zip(seqs, (17, 15, 12, 12, 9, 11)):
            self.grade(w, seq, score)
        t1 = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        row = t1['grades'][0]
        self.assertEqual(t1['layout'], 'primary')
        self.assertEqual((row['score'], row['grade_letter'], row['grade_label_fr']), (16.0, 'Very Good', 'Tr\u00e8s bien'))
        self.assertEqual(row['remark'], 'Very Good')
        self.assertEqual([x['evaluation_label'] for x in sorted(row['sequence_scores'], key=lambda i: i['sequence_name'])], ['Test', 'Exam'])
        self.assertEqual([x['evaluation_label_fr'] for x in sorted(row['sequence_scores'], key=lambda i: i['sequence_name'])], ['Devoir', 'Examen'])
        self.assertIsNone(row['position'])  # showSubjectPosition off in the preset
        self.assertIsNone(t1['promotion_decision'])
        t3 = generate_term_report_card_data(w['pupil'], 3, '2026-2027')
        self.assertEqual(t3['annual_average'], 12.67)  # mean of 16, 12, 10
        self.assertEqual(t3['promotion_decision'], 'promoted')
        TermResult.objects.create(student=w['pupil'], school=w['school'], academic_year='2026-2027', term=3, average=10, is_promoted=False)
        self.assertEqual(generate_term_report_card_data(w['pupil'], 3, '2026-2027')['promotion_decision'], 'repeat')

    def test_display_toggles_blank_sections(self):
        w = self.make('BAS12', 'basic', {'show_attendance': False, 'show_conduct': False, 'show_promotion': False,
                                         'show_class_average': False})
        seqs = self.sequences(w['school'])
        self.grade(w, seqs[0], 14)
        data = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        self.assertEqual(data['attendance'], {})
        self.assertEqual((data['conduct'], data['promotion_status'], data['class_average']), ('', '', ''))
        self.assertFalse(data['show_attendance'])

    def test_non_coefficient_numeric_basic(self):
        w = self.make('BAS10', 'basic', {'use_coefficients': False, 'show_rank': False, 'max_score': 10})
        seqs = self.sequences(w['school'])
        self.grade(w, seqs[0], 7)
        data = generate_report_card_data(w['pupil'], seqs[0])
        self.assertEqual(data['grades'][0]['coefficient'], 1.0)
        self.assertEqual(data['grades'][0]['grade_letter'], 'B')  # 7/10 = 70% -> B


class NurseryEndpointTests(AssessmentWorld):
    AREAS = '/api/v1/grades/assessment-areas/'
    RATINGS = '/api/v1/grades/assessment-ratings/'

    def setUp(self):
        self.w = self.make('NUR1', 'basic', {'preset': 'nursery_descriptive'}, cycle='nursery')
        self.other = self.make('NUR2', 'basic', cycle='nursery')

    def test_admin_manages_areas_and_isolation(self):
        self.client.force_authenticate(self.w['admin'])
        created = self.client.post(self.AREAS, {'name': 'Language', 'name_fr': 'Langage', 'order_index': 1}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        dup = self.client.post(self.AREAS, {'name': 'language'}, format='json')
        self.assertEqual(dup.status_code, 400)
        self.client.force_authenticate(self.other['admin'])
        self.assertEqual(self.client.get(self.AREAS).data, [])
        self.assertEqual(self.client.delete(f"{self.AREAS}{created.data['id']}/").status_code, 404)

    def test_teacher_can_read_but_not_manage_areas(self):
        self.client.force_authenticate(self.w['teacher'])
        self.assertEqual(self.client.get(self.AREAS).status_code, 200)
        self.assertEqual(self.client.post(self.AREAS, {'name': 'X'}, format='json').status_code, 403)

    def test_secondary_school_cannot_create_areas(self):
        sec = self.make('SEC9', 'secondary')
        self.client.force_authenticate(sec['admin'])
        self.assertEqual(self.client.post(self.AREAS, {'name': 'X'}, format='json').status_code, 400)

    def test_class_teacher_rates_own_class_only_and_report_reflects_it(self):
        from .models import AssessmentArea

        area = AssessmentArea.objects.create(school=self.w['school'], name='Motor skills')
        payload = {'academic_year': '2026-2027', 'term': 1,
                   'ratings': [{'student': str(self.w['pupil'].id), 'area': str(area.id), 'level': 2}]}
        # a teacher with no class assignment cannot rate
        self.client.force_authenticate(self.w['teacher'])
        self.assertEqual(self.client.post(self.RATINGS + 'bulk/', payload, format='json').status_code, 403)
        ClassTeacherAssignment.objects.create(school_class=self.w['class'], teacher=self.w['teacher'])
        ok = self.client.post(self.RATINGS + 'bulk/', payload, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        # not assessed, then out-of-range
        payload['ratings'][0]['level'] = None
        self.assertEqual(self.client.post(self.RATINGS + 'bulk/', payload, format='json').status_code, 200)
        payload['ratings'][0]['level'] = 5
        self.assertEqual(self.client.post(self.RATINGS + 'bulk/', payload, format='json').status_code, 400)
        payload['ratings'][0]['level'] = 4
        self.assertEqual(self.client.post(self.RATINGS + 'bulk/', payload, format='json').status_code, 200)
        listed = self.client.get(self.RATINGS, {'class_id': str(self.w['class'].id), 'term': 1})
        self.assertEqual([r['level'] for r in listed.data], [4])
        # other school's pupil / area is not reachable
        cross = {'academic_year': '2026-2027', 'term': 1,
                 'ratings': [{'student': str(self.other['pupil'].id), 'area': str(area.id), 'level': 1}]}
        self.assertEqual(self.client.post(self.RATINGS + 'bulk/', cross, format='json').status_code, 400)
        sequences = self.sequences(self.w['school'], count=3)
        data = generate_term_report_card_data(self.w['pupil'], 1, '2026-2027')
        self.assertEqual(data['areas'][0]['label'], 'Excelling')


class ReportGapTests(AssessmentWorld):
    COMMENTS = '/api/v1/grades/term-results/comments/'

    def test_branding_validation_and_payload(self):
        with self.assertRaises(AssessmentConfigError):
            validate_assessment_config({'brand_color': 'navy'})
        with self.assertRaises(AssessmentConfigError):
            validate_assessment_config({'report_language': 'de'})
        w = self.make('BRD1', 'basic', {'brand_color': '#1E3A8A', 'report_language': 'fr'})
        self.sequences(w['school'], count=3)
        data = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        self.assertEqual(data['branding'], {'color': '#1e3a8a', 'language': 'fr'})

    def test_default_branding_is_empty(self):
        w = self.make('BRD2', 'secondary')
        self.sequences(w['school'])
        data = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        self.assertEqual(data['branding'], {'color': '', 'language': ''})

    def test_subject_class_average(self):
        w = self.make('AVG1', 'basic', {'preset': 'primary_numeric'}, cycle='primary')
        seqs = self.sequences(w['school'], count=3)
        mate = students_api.enrol_student(
            user=None, name='Mate', matricule='AVG1ST0002', school=w['school'], school_class=w['class'],
            student_class=w['class'].name, class_level=w['class'].name, section='English', admission_number='AVG1-ADM-2',
        )
        for pupil, score in ((w['pupil'], 10), (mate, 14)):
            Grade.objects.create(student=pupil, subject=w['subject'], sequence=seqs[0], score=score, teacher=w['teacher'])
        data = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        self.assertEqual(data['grades'][0]['class_average'], 12.0)

    def test_class_teacher_comments_create_term_row(self):
        from .models import TermResult

        w = self.make('CMT1', 'basic', {'preset': 'nursery_descriptive'}, cycle='nursery')
        other = self.make('CMT2', 'basic', cycle='nursery')
        body = {'academic_year': '2026-2027', 'term': 1,
                'comments': [{'student': str(w['pupil'].id), 'teacher_comment': 'Lovely term', 'conduct': 'Good'}]}
        self.client.force_authenticate(w['teacher'])
        self.assertEqual(self.client.post(self.COMMENTS, body, format='json').status_code, 403)
        ClassTeacherAssignment.objects.create(school_class=w['class'], teacher=w['teacher'])
        ok = self.client.post(self.COMMENTS, body, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        row = TermResult.objects.get(student=w['pupil'], term=1)
        self.assertEqual((row.teacher_comment, row.conduct), ('Lovely term', 'Good'))
        cross = {**body, 'comments': [{'student': str(other['pupil'].id), 'teacher_comment': 'x'}]}
        self.assertEqual(self.client.post(self.COMMENTS, cross, format='json').status_code, 400)
        self.sequences(w['school'], count=3)
        data = generate_term_report_card_data(w['pupil'], 1, '2026-2027')
        self.assertEqual(data['teacher_comment'], 'Lovely term')

    def test_comments_listing_scoped_to_teacher_classes(self):
        w = self.make('CMT3', 'basic', cycle='primary')
        ClassTeacherAssignment.objects.create(school_class=w['class'], teacher=w['teacher'])
        self.client.force_authenticate(w['teacher'])
        body = {'academic_year': '2026-2027', 'term': 2,
                'comments': [{'student': str(w['pupil'].id), 'teacher_comment': 'Keep going'}]}
        self.assertEqual(self.client.post(self.COMMENTS, body, format='json').status_code, 200)
        listed = self.client.get(self.COMMENTS, {'class_id': str(w['class'].id), 'academic_year': '2026-2027', 'term': 2})
        self.assertEqual([(r['student'], r['teacher_comment']) for r in listed.data], [(str(w['pupil'].id), 'Keep going')])

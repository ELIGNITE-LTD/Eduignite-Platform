"""Conduct log (Basic Education): scope, isolation, report-card line, no overwrite, loginless pupils."""
from datetime import date

from django.utils import timezone

from apps.schools.models import ClassTeacherAssignment, SchoolClass
from apps.students import api as students_api

from .conduct import conduct_summary_line
from .models import ConductEntry, TermResult
from .test_assessment_config import AssessmentWorld, User
from .utils import generate_term_report_card_data

URL = '/api/v1/grades/conduct/'


class ConductTests(AssessmentWorld):
    def setUp(self):
        self.w = self.make('CND1', 'basic')
        ClassTeacherAssignment.objects.create(school_class=self.w['class'], teacher=self.w['teacher'], is_lead=True)

    def other_class_pupil(self):
        other = SchoolClass.objects.create(school=self.w['school'], name='Class 4 B')
        return students_api.enrol_student(
            user=None, name='Other Pupil', matricule='CND1ST0002', school=self.w['school'], school_class=other,
            student_class=other.name, class_level=other.name, section='English', admission_number='CND1-ADM-2',
            guardian_name='G',
        )

    def test_teacher_records_for_own_loginless_pupil_and_late_today_is_idempotent(self):
        self.client.force_authenticate(self.w['teacher'])
        pupil = self.w['pupil']
        self.assertIsNone(pupil.user_id)
        resp = self.client.post(URL, {'student': str(pupil.id), 'kind': 'praise', 'note': 'Helpful'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['student_name'], pupil.display_name)
        self.assertEqual(resp.data['date'], timezone.localdate().isoformat())
        first = self.client.post(URL + 'late-today/', {'student': str(pupil.id)}, format='json')
        again = self.client.post(URL + 'late-today/', {'student': str(pupil.id)}, format='json')
        self.assertEqual((first.status_code, again.status_code), (201, 200))
        self.assertEqual(ConductEntry.objects.filter(student=pupil, kind='late').count(), 1)
        counts = self.client.get(URL + 'counts/', {'class_id': str(self.w['class'].id)})
        self.assertEqual(counts.data[str(pupil.id)], {'warning': 0, 'praise': 1, 'note': 0, 'late': 1})

    def test_note_requires_text(self):
        self.client.force_authenticate(self.w['teacher'])
        resp = self.client.post(URL, {'student': str(self.w['pupil'].id), 'kind': 'note', 'note': '  '}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_teacher_cannot_touch_pupils_of_unassigned_class(self):
        other = self.other_class_pupil()
        ConductEntry.objects.create(school=self.w['school'], student=other, school_class=other.school_class,
                                    kind='warning', date=date(2026, 9, 10))
        self.client.force_authenticate(self.w['teacher'])
        denied = self.client.post(URL, {'student': str(other.id), 'kind': 'warning'}, format='json')
        self.assertEqual(denied.status_code, 400)
        late = self.client.post(URL + 'late-today/', {'student': str(other.id)}, format='json')
        self.assertEqual(late.status_code, 400)
        self.assertEqual(self.client.get(URL).data, [])

    def test_admin_sees_whole_school_and_filters_by_class(self):
        other = self.other_class_pupil()
        for pupil in (self.w['pupil'], other):
            ConductEntry.objects.create(school=self.w['school'], student=pupil, school_class=pupil.school_class,
                                        kind='late', date=date(2026, 9, 10))
        self.client.force_authenticate(self.w['admin'])
        self.assertEqual(len(self.client.get(URL).data), 2)
        self.assertEqual(len(self.client.get(URL, {'class_id': str(other.school_class_id)}).data), 1)
        ok = self.client.post(URL, {'student': str(other.id), 'kind': 'praise'}, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)

    def test_school_isolation(self):
        foreign = self.make('CND2', 'basic')
        ClassTeacherAssignment.objects.create(school_class=foreign['class'], teacher=foreign['teacher'])
        entry = ConductEntry.objects.create(school=foreign['school'], student=foreign['pupil'],
                                            school_class=foreign['class'], kind='warning', date=date(2026, 9, 10))
        for user in (self.w['admin'], self.w['teacher']):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(URL).data, [])
            self.assertEqual(self.client.delete(f'{URL}{entry.id}/').status_code, 404)
            self.assertEqual(
                self.client.post(URL, {'student': str(foreign['pupil'].id), 'kind': 'praise'}, format='json').status_code,
                400)
        self.assertTrue(ConductEntry.objects.filter(pk=entry.pk).exists())

    def test_secondary_school_gets_nothing(self):
        sec = self.make('CND3', 'secondary')
        self.client.force_authenticate(sec['admin'])
        self.assertEqual(self.client.get(URL).data, [])
        resp = self.client.post(URL, {'student': str(sec['pupil'].id), 'kind': 'praise'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_teacher_deletes_only_own_entries_admin_any(self):
        teacher = self.w['teacher']
        colleague = User.objects.create_user(matricule='CND1-T2', name='Col League', email='cnd1t2@example.com',
                                             role='TEACHER', school=self.w['school'], password='password123')
        ClassTeacherAssignment.objects.create(school_class=self.w['class'], teacher=colleague)
        mine = ConductEntry.objects.create(school=self.w['school'], student=self.w['pupil'], kind='note', note='x',
                                           date=date(2026, 9, 10), recorded_by=teacher)
        theirs = ConductEntry.objects.create(school=self.w['school'], student=self.w['pupil'], kind='note', note='y',
                                             date=date(2026, 9, 10), recorded_by=colleague)
        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.delete(f'{URL}{theirs.id}/').status_code, 403)
        self.assertEqual(self.client.delete(f'{URL}{mine.id}/').status_code, 204)
        self.client.force_authenticate(self.w['admin'])
        self.assertEqual(self.client.delete(f'{URL}{theirs.id}/').status_code, 204)

    def test_summary_line_counts_and_languages(self):
        pupil = self.w['pupil']
        make = lambda kind, d=date(2026, 9, 10): ConductEntry.objects.create(  # noqa: E731
            school=self.w['school'], student=pupil, kind=kind, date=d)
        self.assertEqual(conduct_summary_line(pupil), '')
        make('late'); make('late'); make('warning'); make('praise'); make('note')
        make('praise', date(2025, 1, 1))
        self.assertEqual(conduct_summary_line(pupil, date(2026, 9, 1), date(2027, 6, 30)),
                         '2 late arrivals, 1 warning, 1 praise')
        self.assertEqual(conduct_summary_line(pupil, date(2026, 9, 1), date(2027, 6, 30), lang='fr'),
                         '2 retards, 1 avertissement, 1 félicitation')

    def test_report_card_fills_conduct_only_when_none_stored(self):
        self.sequences(self.w['school'])
        pupil = self.w['pupil']
        ConductEntry.objects.create(school=self.w['school'], student=pupil, kind='late', date=date(2026, 9, 10))
        ConductEntry.objects.create(school=self.w['school'], student=pupil, kind='praise', date=date(2026, 10, 1))
        data = generate_term_report_card_data(pupil, 1, '2026-2027')
        self.assertEqual(data['conduct'], '1 late arrival, 1 praise')
        self.assertEqual(data['conduct_summary'], '1 late arrival, 1 praise')

    def test_report_card_never_overwrites_existing_conduct_text(self):
        self.sequences(self.w['school'])
        pupil = self.w['pupil']
        ConductEntry.objects.create(school=self.w['school'], student=pupil, kind='late', date=date(2026, 9, 10))
        TermResult.objects.create(student=pupil, school=self.w['school'], academic_year='2026-2027', term=1,
                                  average=0, conduct='Good')
        data = generate_term_report_card_data(pupil, 1, '2026-2027')
        self.assertEqual(data['conduct'], 'Good')
        self.assertEqual(data['conduct_summary'], '1 late arrival')

    def test_report_card_unchanged_without_entries_and_for_secondary(self):
        self.sequences(self.w['school'])
        self.assertEqual(generate_term_report_card_data(self.w['pupil'], 1, '2026-2027')['conduct'], 'Excellent')
        sec = self.make('CND4', 'secondary')
        self.sequences(sec['school'])
        ConductEntry.objects.create(school=sec['school'], student=sec['pupil'], kind='late', date=date(2026, 9, 10))
        data = generate_term_report_card_data(sec['pupil'], 1, '2026-2027')
        self.assertEqual((data['conduct'], data['conduct_summary']), ('Excellent', ''))

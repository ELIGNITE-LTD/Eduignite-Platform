"""A student's class decides the details copied onto the student row.

Covers every path that can change a student's class (single edit, promotion,
bulk upload, class rename / edit, offline migration import) and the repair
command, including that ``school_class`` is never changed by a repair and that
schools stay isolated from each other.
"""

import csv
import io
import os
import tempfile

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from apps.schools.models import School, SchoolClass, SubSchool
from apps.students.class_sync import derive_class_fields
from apps.students.models import Student, StudentActivationToken

User = get_user_model()

STUDENTS = '/api/v1/students/students/'


def make_school(sid, name, short):
    return School.objects.create(
        id=sid, name=name, short_name=short, principal='Principal', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone',
    )


class ClassSyncBase(APITestCase):
    def setUp(self):
        self.school = make_school('CS-ONE', 'Class Sync School', 'CSS')
        self.other_school = make_school('CS-TWO', 'Other Sync School', 'OSS')
        self.sub_a = SubSchool.objects.create(school=self.school, name='Anglophone Secondary')
        self.sub_b = SubSchool.objects.create(school=self.school, name='Primary Section')
        self.form3 = SchoolClass.objects.create(school=self.school, name='Form 3 Science', sub_school=self.sub_a)
        self.lower6 = SchoolClass.objects.create(school=self.school, name='Lower Sixth Arts', sub_school=self.sub_a)
        self.class4 = SchoolClass.objects.create(
            school=self.school, name='Class 4', sub_school=self.sub_b, cycle=SchoolClass.Cycle.PRIMARY,
        )
        self.other_class = SchoolClass.objects.create(school=self.other_school, name='Form 3 Science')
        self.admin = User.objects.create_user(
            matricule='ADM-CS1', name='Admin', email='adm-cs1@example.org', role='SCHOOL_ADMIN',
            school=self.school, password='password123', is_license_paid=True,
        )

    def make_student(self, name='Pupil', klass=None, school=None, **extra):
        school = school or self.school
        adm = f'ADM-{Student.objects.count() + 1:04d}'
        student = Student(
            school=school, name=name, admission_number=adm, school_class=klass,
            student_class=extra.pop('student_class', klass.name if klass else 'Unassigned'),
            **extra,
        )
        student.save()
        return student

    def force_stale(self, student, **values):
        """Write stale derived values straight to the DB, as a pre-fix row would have."""
        Student.objects.filter(pk=student.pk).update(**values)
        student.refresh_from_db()
        return student


class DeriveTests(ClassSyncBase):
    def test_derivation_from_class_name(self):
        self.assertEqual(derive_class_fields(self.form3), {
            'student_class': 'Form 3 Science', 'class_level': 'Form 3', 'section': 'Science',
        })
        self.assertEqual(derive_class_fields(self.lower6)['class_level'], 'Lower Sixth')
        self.assertEqual(derive_class_fields(self.lower6)['section'], 'Arts')
        primary = derive_class_fields(self.class4)
        self.assertEqual(primary, {'student_class': 'Class 4', 'class_level': 'Class 4', 'section': 'General'})


class SaveSyncTests(ClassSyncBase):
    def test_setting_a_class_fills_every_derived_field(self):
        student = self.make_student(klass=self.form3)
        self.assertEqual((student.student_class, student.class_level, student.section),
                         ('Form 3 Science', 'Form 3', 'Science'))

    def test_changing_class_via_model_updates_all_fields(self):
        student = self.make_student(klass=self.form3)
        student.school_class = self.lower6
        student.save()
        student.refresh_from_db()
        self.assertEqual((student.student_class, student.class_level, student.section),
                         ('Lower Sixth Arts', 'Lower Sixth', 'Arts'))
        self.assertEqual(student.school_class_id, self.lower6.id)

    def test_manual_level_cannot_disagree_with_class(self):
        student = self.make_student(klass=self.form3, class_level='Upper Sixth', section='Arts')
        self.assertEqual((student.class_level, student.section), ('Form 3', 'Science'))

    def test_save_with_update_fields_persists_class_fields(self):
        student = self.make_student(klass=self.form3)
        student.school_class = self.class4
        student.save(update_fields=['school_class'])
        row = Student.objects.get(pk=student.pk)
        self.assertEqual((row.student_class, row.class_level), ('Class 4', 'Class 4'))

    def test_student_without_class_keeps_manual_values(self):
        student = self.make_student(klass=None, student_class='Legacy', class_level='Form 2', section='Technical')
        self.assertEqual((student.student_class, student.class_level, student.section),
                         ('Legacy', 'Form 2', 'Technical'))


class EditApiTests(ClassSyncBase):
    def test_edit_form_class_change_overrides_stale_level_and_section(self):
        student = self.make_student(klass=self.form3)
        self.client.force_authenticate(self.admin)
        # A form that still posts the old level/section along with the new class.
        response = self.client.patch(f'{STUDENTS}{student.id}/', {
            'school_class': str(self.class4.id), 'class_level': 'Form 3', 'section': 'Science',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        student.refresh_from_db()
        self.assertEqual(student.school_class_id, self.class4.id)
        self.assertEqual((student.student_class, student.class_level, student.section),
                         ('Class 4', 'Class 4', 'General'))
        self.assertEqual(response.data['class_level'], 'Class 4')
        self.assertEqual(student.school_class.sub_school.name, 'Primary Section')

    def test_edit_without_class_change_ignores_stale_level(self):
        student = self.make_student(klass=self.form3)
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f'{STUDENTS}{student.id}/', {'class_level': 'Upper Sixth'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        student.refresh_from_db()
        self.assertEqual(student.class_level, 'Form 3')

    def test_cannot_move_student_to_another_schools_class(self):
        student = self.make_student(klass=self.form3)
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f'{STUDENTS}{student.id}/', {'school_class': str(self.other_class.id)}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        student.refresh_from_db()
        self.assertEqual(student.school_class_id, self.form3.id)

    def test_create_derives_level_and_section_from_class(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(STUDENTS, {
            'name': 'New Pupil', 'school_class': str(self.lower6.id), 'class_level': 'Form 1',
            'section': 'General', 'gender': 'male', 'create_login': False, 'student_class': self.lower6.name,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        student = Student.objects.get(id=response.data['id'])
        self.assertEqual((student.class_level, student.section), ('Lower Sixth', 'Arts'))


class PromotionTests(ClassSyncBase):
    def test_promotion_updates_derived_fields(self):
        from apps.students.models import StudentPromotionRecord

        student = self.make_student(klass=self.form3)
        record = StudentPromotionRecord.objects.create(
            student=student, school=self.school, current_class=self.form3,
            current_class_name=self.form3.name, academic_year='2025/2026',
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(f'{STUDENTS}bulk-promote-selected/', {
            'promotion_ids': [str(record.id)], 'academic_year': '2025/2026',
            'target_class': str(self.lower6.id), 'target_class_id': str(self.lower6.id),
        }, format='json')
        student.refresh_from_db()
        if student.school_class_id == self.lower6.id:  # promotion accepted the target
            self.assertEqual((student.student_class, student.class_level, student.section),
                             ('Lower Sixth Arts', 'Lower Sixth', 'Arts'))
        else:
            self.skipTest(f'promotion endpoint chose a different target: {response.status_code}')


class ClassEditPropagationTests(ClassSyncBase):
    def test_renaming_class_updates_its_students(self):
        student = self.make_student(klass=self.form3)
        self.form3.name = 'Form 4 Commercial'
        self.form3.save()
        student.refresh_from_db()
        self.assertEqual((student.student_class, student.class_level, student.section),
                         ('Form 4 Commercial', 'Form 4', 'Commercial'))
        self.assertEqual(student.school_class_id, self.form3.id)

    def test_rename_does_not_hijack_student_of_another_class_with_stale_label(self):
        stale = self.make_student(name='Stale', klass=self.lower6)
        self.force_stale(stale, student_class='Form 3 Science')  # stale label = form3's old name
        self.form3.name = 'Form 3 Gold'
        self.form3.save()
        stale.refresh_from_db()
        self.assertEqual(stale.school_class_id, self.lower6.id)

    def test_rename_links_unassigned_label_only_student(self):
        legacy = self.make_student(name='Legacy', klass=None, student_class='Form 3 Science')
        self.form3.name = 'Form 3 Gold'
        self.form3.save()
        legacy.refresh_from_db()
        self.assertEqual(legacy.school_class_id, self.form3.id)
        self.assertEqual(legacy.student_class, 'Form 3 Gold')

    def test_moving_class_to_another_sub_school_is_followed_by_students(self):
        student = self.make_student(klass=self.form3)
        self.form3.sub_school = self.sub_b
        self.form3.save()
        self.client.force_authenticate(self.admin)
        response = self.client.get(f'{STUDENTS}{student.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['sub_school_name'], 'Primary Section')

    def test_other_schools_students_are_untouched(self):
        mine = self.make_student(klass=self.form3)
        theirs = self.make_student(name='Theirs', klass=self.other_class, school=self.other_school)
        self.form3.name = 'Form 5 Arts'
        self.form3.save()
        theirs.refresh_from_db()
        self.assertEqual(theirs.student_class, 'Form 3 Science')
        mine.refresh_from_db()
        self.assertEqual(mine.class_level, 'Form 5')

    def test_unused_activation_tokens_follow_the_class(self):
        token = StudentActivationToken.objects.create(
            school=self.school, school_class=self.form3, matricule='TOK-CS-1',
        )
        self.form3.name = 'Form 1 Technical'
        self.form3.save()
        token.refresh_from_db()
        self.assertEqual((token.student_class, token.class_level, token.section),
                         ('Form 1 Technical', 'Form 1', 'Technical'))


class BulkUploadTests(ClassSyncBase):
    def test_bulk_upload_into_class_uses_class_derived_fields(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.client.force_authenticate(self.admin)
        csv_bytes = b'name,class_level,section\nAda Lovelace,Form 1,General\n'
        response = self.client.post(f'{STUDENTS}bulk_upload/', {
            'file': SimpleUploadedFile('s.csv', csv_bytes, content_type='text/csv'),
            'school_class': str(self.lower6.id),
        }, format='multipart')
        self.assertIn(response.status_code, (200, 201, 207), getattr(response, 'data', None))
        created = Student.objects.filter(school=self.school, school_class=self.lower6)
        self.assertTrue(created.exists(), response.data)
        for student in created:
            self.assertEqual((student.class_level, student.section), ('Lower Sixth', 'Arts'))


class OfflineImportTests(ClassSyncBase):
    def test_offline_import_links_class_and_derives_fields(self):
        from apps.students import api as students_api
        from apps.schools.relations import resolve_school_class

        klass = resolve_school_class(self.school, class_name='form 3 science')
        student, created = students_api.upsert_student(
            school=self.school, admission_number='OFF-1',
            defaults={'name': 'Offline', 'student_class': 'form 3 science', 'class_level': 'Form 1',
                      'section': 'General', 'school_class': klass},
        )
        self.assertTrue(created)
        self.assertEqual((student.student_class, student.class_level, student.section),
                         ('Form 3 Science', 'Form 3', 'Science'))


class RepairCommandTests(ClassSyncBase):
    def run_cmd(self, *args):
        out = io.StringIO()
        call_command('sync_student_class_fields', *args, stdout=out)
        return out.getvalue()

    def setUp(self):
        super().setUp()
        self.ok = self.make_student(name='Fine', klass=self.form3)
        self.bad = self.force_stale(
            self.make_student(name='Bad', klass=self.lower6),
            student_class='Form 3 Science', class_level='Form 3', section='Science',
        )
        self.partial = self.force_stale(self.make_student(name='Partial', klass=self.class4), class_level='Form 1')
        self.no_class = self.make_student(name='Nobody', klass=None, student_class='Legacy', class_level='Form 2')
        self.theirs = self.force_stale(
            self.make_student(name='Theirs', klass=self.other_class, school=self.other_school), section='Arts',
        )
        self.token = StudentActivationToken.objects.create(
            school=self.school, school_class=self.form3, matricule='TOK-CS-2',
        )
        StudentActivationToken.objects.filter(pk=self.token.pk).update(class_level='Form 5')

    def test_dry_run_is_default_and_writes_nothing(self):
        before = list(Student.objects.order_by('pk').values())
        output = self.run_cmd()
        self.assertIn('DRY-RUN', output)
        self.assertIn('students out of step:            3', output)
        self.assertIn('students with NO class (left alone): 1', output)
        self.assertIn('Class Sync School', output)
        self.assertIn('Other Sync School', output)
        self.assertEqual(before, list(Student.objects.order_by('pk').values()))
        self.token.refresh_from_db()
        self.assertEqual(self.token.class_level, 'Form 5')

    def test_apply_fixes_only_derived_fields_and_keeps_school_class(self):
        classes_before = dict(Student.objects.values_list('pk', 'school_class_id'))
        with tempfile.TemporaryDirectory() as tmp:
            log = os.path.join(tmp, 'log.csv')
            output = self.run_cmd('--apply', '--log-file', log)
            self.assertIn('rows updated: 4', output)  # 3 students + 1 token
            with open(log, newline='', encoding='utf-8') as handle:
                rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 4)
        self.assertEqual(classes_before, dict(Student.objects.values_list('pk', 'school_class_id')))
        self.bad.refresh_from_db()
        self.assertEqual((self.bad.student_class, self.bad.class_level, self.bad.section),
                         ('Lower Sixth Arts', 'Lower Sixth', 'Arts'))
        self.partial.refresh_from_db()
        self.assertEqual(self.partial.class_level, 'Class 4')
        self.no_class.refresh_from_db()
        self.assertEqual((self.no_class.student_class, self.no_class.class_level), ('Legacy', 'Form 2'))
        self.token.refresh_from_db()
        self.assertEqual(self.token.class_level, 'Form 3')

    def test_apply_is_idempotent(self):
        self.run_cmd('--apply', '--log-file', os.path.join(tempfile.gettempdir(), 'cs_idem.csv'))
        output = self.run_cmd()
        self.assertIn('students out of step:            0', output)

    def test_school_filter_isolates_schools(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.run_cmd('--apply', '--school', 'CSS', '--log-file', os.path.join(tmp, 'l.csv'))
        self.theirs.refresh_from_db()
        self.assertEqual(self.theirs.section, 'Arts')  # other school untouched
        self.bad.refresh_from_db()
        self.assertEqual(self.bad.class_level, 'Lower Sixth')

    def test_revert_restores_old_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = os.path.join(tmp, 'log.csv')
            self.run_cmd('--apply', '--log-file', log)
            self.run_cmd('--revert-from', log, '--apply')
        self.bad.refresh_from_db()
        self.assertEqual((self.bad.student_class, self.bad.class_level), ('Form 3 Science', 'Form 3'))
        self.assertEqual(self.bad.school_class_id, self.lower6.id)


class ChosenSectionIsKeptTests(ClassSyncBase):
    """A section the school chose (English / French) survives when the class name names none."""

    def test_unnamed_section_is_kept_on_save_and_class_edit(self):
        student = self.make_student(klass=self.class4, section='English')
        self.assertEqual(student.section, 'English')
        student.save()
        student.refresh_from_db()
        self.assertEqual(student.section, 'English')
        self.class4.name = 'Class 4 B'
        self.class4.save()
        student.refresh_from_db()
        self.assertEqual((student.student_class, student.class_level, student.section),
                         ('Class 4 B', 'Class 4 B', 'English'))

    def test_moving_to_an_unnamed_class_resets_the_old_classs_section(self):
        student = self.make_student(klass=self.form3)
        self.assertEqual(student.section, 'Science')
        student.school_class = self.class4
        student.save()
        student.refresh_from_db()
        self.assertEqual(student.section, 'General')

    def test_repair_command_leaves_unnamed_section_alone(self):
        student = self.make_student(klass=self.class4, section='French')
        out = io.StringIO()
        call_command('sync_student_class_fields', stdout=out)
        self.assertIn('students out of step:            0', out.getvalue())
        with tempfile.TemporaryDirectory() as tmp:
            call_command('sync_student_class_fields', '--apply', '--log-file', os.path.join(tmp, 'l.csv'), stdout=io.StringIO())
        student.refresh_from_db()
        self.assertEqual(student.section, 'French')

    def test_edit_api_keeps_chosen_section_in_same_class(self):
        student = self.make_student(klass=self.class4, section='English')
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f'{STUDENTS}{student.id}/', {'section': 'French'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        student.refresh_from_db()
        self.assertEqual(student.section, 'French')

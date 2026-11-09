"""Online admission applications: public form, review API, privacy, emails, enrolment."""

import shutil
import tempfile
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import signing
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.orders.models import EmailNotificationLog
from apps.schools import admissions_services as svc
from apps.schools.admissions_models import PrivateFileSystemStorage
from apps.schools.models import (
    AdmissionApplication,
    AdmissionAuditEntry,
    AdmissionSettings,
    ApplicationDocument,
    PublicationStatus,
    School,
    SchoolClass,
    SchoolPublicProfile,
    SchoolStatus,
)
from apps.students import api as students_api

User = get_user_model()
PUBLIC = '/api/v1/schools/public/{slug}/enrollment/'
ADMIN = '/api/v1/schools/admissions/'
PDF = b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'
PNG = b'\x89PNG\r\n\x1a\n' + b'0' * 40


def make_school(sid, category='basic', **extra):
    fields = dict(
        id=sid, name=f'School {sid}', short_name=sid, principal='P. Head', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000', school_type='general',
        subsystem='anglophone', description='A fine school.', status=SchoolStatus.ACTIVE,
        education_category=category,
    )
    fields.update(extra)
    return School.objects.create(**fields)


def make_user(matricule, role, school=None):
    return User.objects.create_user(
        matricule=matricule, name=f'User {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='password123', is_license_paid=True)


def publish(school, enabled=True):
    profile, _ = SchoolPublicProfile.objects.get_or_create(school=school)
    profile.publication_status = PublicationStatus.PUBLISHED
    profile.enrollment_enabled = enabled
    profile.save()
    return profile


class AdmissionBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.school = make_school('ADA')
        cls.other = make_school('ADB')
        cls.klass = SchoolClass.objects.create(school=cls.school, name='Class 1', cycle='primary')
        cls.other_class = SchoolClass.objects.create(school=cls.other, name='Class 1', cycle='primary')
        cls.admin = make_user('ADM-ADA', 'SCHOOL_ADMIN', cls.school)
        cls.sub = make_user('SUB-ADA', 'SUB_ADMIN', cls.school)
        cls.teacher = make_user('TCH-ADA', 'TEACHER', cls.school)
        cls.other_admin = make_user('ADM-ADB', 'SCHOOL_ADMIN', cls.other)
        publish(cls.school)
        cls.adm = AdmissionSettings.objects.create(school=cls.school, intake_year='2026')
        cls.url = PUBLIC.format(slug=cls.school.public_slug)

    def setUp(self):
        cache.clear()
        self.media = tempfile.mkdtemp()
        field = ApplicationDocument._meta.get_field('file')
        self._old_storage = field.storage
        field.storage = PrivateFileSystemStorage(location=self.media)
        self.addCleanup(shutil.rmtree, self.media, True)
        self.addCleanup(setattr, field, 'storage', self._old_storage)

    def token(self):
        return svc.issue_form_token(self.school)

    def payload(self, **extra):
        data = {
            'student_full_name': 'Ngu Mary Tabe', 'student_dob': '2019-05-04', 'student_gender': 'female',
            'class_applied': str(self.klass.id), 'guardian_name': 'Ngu Peter',
            'guardian_relationship': 'father', 'guardian_phone': '+237 650 111 222',
            'guardian_email': 'peter@example.org', 'consent': True, 'language': 'en',
            'form_token': self.token(),
        }
        data.update(extra)
        return data

    def submit(self, fast=True, **extra):
        with override_settings(ADMISSION_MIN_FILL_SECONDS=0 if fast else 3):
            return self.client.post(self.url, self.payload(**extra), format='json')

    def make_application(self, **extra):
        fields = dict(
            school=self.school, reference=svc.new_reference(), student_full_name='Ada Pupil',
            student_dob='2019-01-01', guardian_name='Mum', guardian_phone='650000001',
            class_applied=self.klass, class_applied_name='Class 1')
        fields.update(extra)
        return AdmissionApplication.objects.create(**fields)


class PublicConfigTests(AdmissionBase):
    def test_config_only_when_published_enabled_and_open(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['state'], 'open')
        self.assertIn('form_token', body)
        self.assertEqual(body['classes'][0]['name'], 'Class 1')
        self.assertEqual(body['classes'][0]['group'], 'Primary')
        self.assertNotIn('notification_email', str(body))
        self.assertEqual(body['fields']['student_dob'], 'required')
        self.assertEqual(body['education_category'], 'basic')

    def test_unpublished_disabled_or_unconfigured_is_404(self):
        profile = self.school.public_profile
        profile.publication_status = PublicationStatus.DRAFT
        profile.save()
        self.assertEqual(self.client.get(self.url).status_code, 404)
        publish(self.school, enabled=False)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 404)
        publish(self.school)
        self.adm.delete()
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_closed_and_not_yet_open_windows(self):
        today = timezone.localdate()
        self.adm.closes_on = today - timedelta(days=1)
        self.adm.save()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['state'], 'closed')
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 404)
        self.adm.closes_on = None
        self.adm.opens_on = today + timedelta(days=3)
        self.adm.save()
        self.assertEqual(self.client.get(self.url).json()['reason'], 'not_yet_open')

    def test_unknown_school_404(self):
        self.assertEqual(self.client.get(PUBLIC.format(slug='nope')).status_code, 404)

    def test_hidden_field_not_in_config(self):
        self.adm.field_config = {'guardian_address': 'hidden'}
        self.adm.save()
        self.assertNotIn('guardian_address', self.client.get(self.url).json()['fields'])


class SubmitTests(AdmissionBase):
    def test_submit_creates_application_and_returns_only_reference(self):
        with override_settings(ADMISSION_MIN_FILL_SECONDS=0):
            response = self.client.post(
                self.url, self.payload(), format='json', REMOTE_ADDR='203.0.113.9', HTTP_USER_AGENT='A' * 500)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(set(response.json()), {'reference', 'status'})
        self.assertRegex(response.json()['reference'], r'^ADM-\d{4}-[A-Z2-9]{6}$')
        self.assertNotIn('Ngu', response.content.decode())
        app = AdmissionApplication.objects.get()
        self.assertEqual(app.school_id, self.school.id)
        self.assertEqual(app.status, 'new')
        self.assertEqual(app.class_applied_id, self.klass.id)
        self.assertNotEqual(app.ip_hash, '203.0.113.9')
        self.assertEqual(len(app.ip_hash), 64)
        self.assertEqual(len(app.user_agent), 200)
        self.assertTrue(app.consent_given)
        self.assertEqual(AdmissionAuditEntry.objects.get().action, 'submitted')

    def test_validation_errors_use_codes(self):
        response = self.submit(student_full_name='', guardian_phone='abc', consent=False,
                               student_dob='2999-01-01', guardian_email='bad')
        self.assertEqual(response.status_code, 400)
        errors = response.json()['errors']
        self.assertEqual(errors['student_full_name'], 'required')
        self.assertEqual(errors['guardian_phone'], 'invalid')
        self.assertEqual(errors['consent'], 'required')
        self.assertEqual(errors['student_dob'], 'future')
        self.assertEqual(errors['guardian_email'], 'invalid')
        self.assertEqual(AdmissionApplication.objects.count(), 0)

    def test_required_follows_school_configuration(self):
        self.adm.field_config = {'student_dob': 'optional', 'guardian_address': 'required'}
        self.adm.save()
        response = self.submit(student_dob='')
        self.assertEqual(response.json()['errors'], {'guardian_address': 'required'})
        self.assertEqual(self.submit(student_dob='', guardian_address='Molyko').status_code, 201)

    def test_unknown_and_hidden_fields_rejected(self):
        self.assertEqual(self.submit(is_admin=True).json()['errors'], {'is_admin': 'unknown_field'})
        self.adm.field_config = {'guardian_address': 'hidden'}
        self.adm.save()
        self.assertEqual(self.submit(guardian_address='x').json()['errors'], {'guardian_address': 'unknown_field'})

    def test_class_of_another_school_rejected(self):
        response = self.submit(class_applied=str(self.other_class.id))
        self.assertEqual(response.json()['errors'], {'class_applied': 'invalid'})

    def test_class_must_be_offered_when_a_selection_exists(self):
        second = SchoolClass.objects.create(school=self.school, name='Class 2', cycle='primary')
        self.adm.classes_offered.set([second])
        self.assertEqual(self.submit().json()['errors'], {'class_applied': 'invalid'})
        self.assertEqual(self.submit(class_applied=str(second.id)).status_code, 201)

    def test_html_is_stripped(self):
        self.submit(student_full_name='<b>Ngu</b> <script>alert(1)</script>Mary', message='<img src=x onerror=1>Hi')
        app = AdmissionApplication.objects.get()
        self.assertNotIn('<', app.student_full_name)
        self.assertNotIn('<', app.message)
        self.assertIn('Hi', app.message)

    def test_honeypot_returns_success_but_stores_nothing(self):
        response = self.submit(website='http://spam.example')
        self.assertEqual(response.status_code, 201)
        self.assertIn('reference', response.json())
        self.assertEqual(AdmissionApplication.objects.count(), 0)

    def test_time_trap_and_bad_tokens(self):
        too_fast = self.submit(fast=False)
        self.assertEqual(too_fast.status_code, 400)
        self.assertEqual(too_fast.json()['errors'], {'form': 'too_fast'})
        self.assertEqual(self.submit(form_token='').json()['errors'], {'form': 'form_token'})
        self.assertEqual(self.submit(form_token='garbage:1:2').json()['errors'], {'form': 'form_token'})
        foreign = svc.issue_form_token(self.other)
        self.assertEqual(self.submit(form_token=foreign).json()['errors'], {'form': 'form_token'})
        self.assertEqual(AdmissionApplication.objects.count(), 0)

    def test_double_submit_is_idempotent(self):
        with self.captureOnCommitCallbacks(execute=True):
            first = self.submit(submission_id='abcd1234efgh')
        with self.captureOnCommitCallbacks(execute=True):
            second = self.submit(submission_id='abcd1234efgh')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()['reference'], second.json()['reference'])
        # Same child and contact without a submission id is also folded into one.
        third = self.submit()
        self.assertEqual(third.json()['reference'], first.json()['reference'])
        self.assertEqual(AdmissionApplication.objects.count(), 1)

    def test_throttle_scope_is_five_per_hour_per_ip(self):
        codes = [self.submit(student_full_name=f'Child Number {i}', guardian_phone=f'65000010{i}',
                             guardian_email=f'p{i}@example.org').status_code for i in range(6)]
        self.assertEqual(codes[:5], [201] * 5)
        self.assertEqual(codes[5], 429)

    def test_three_a_day_per_phone_per_school(self):
        codes = [self.submit(student_full_name=f'Child Number {i}', guardian_email='').status_code
                 for i in range(4)]
        self.assertEqual(codes, [201, 201, 201, 429])
        # Another school's applications do not count against this phone.
        self.assertEqual(AdmissionApplication.objects.filter(school=self.school).count(), 3)

    def test_documents_validated_and_stored_privately(self):
        pdf = SimpleUploadedFile('birth cert.pdf', PDF, content_type='application/pdf')
        with override_settings(ADMISSION_MIN_FILL_SECONDS=0):
            response = self.client.post(self.url, {**self.payload(consent='true'), 'documents': pdf}, format='multipart')
        self.assertEqual(response.status_code, 201, response.content)
        doc = ApplicationDocument.objects.get()
        self.assertEqual(doc.doc_type, 'pdf')
        self.assertTrue(doc.file.path.startswith(self.media))
        with self.assertRaises(ValueError):
            doc.file.url  # no public URL exists

    def test_document_type_is_sniffed_not_trusted(self):
        fake = SimpleUploadedFile('virus.pdf', b'MZ\x90\x00 not a pdf', content_type='application/pdf')
        with override_settings(ADMISSION_MIN_FILL_SECONDS=0):
            response = self.client.post(self.url, {**self.payload(consent='true'), 'documents': fake}, format='multipart')
        self.assertEqual(response.json()['errors'], {'documents': 'file_type'})
        wrong_ext = SimpleUploadedFile('photo.png', PDF)
        with override_settings(ADMISSION_MIN_FILL_SECONDS=0):
            response = self.client.post(self.url, {**self.payload(consent='true'), 'documents': wrong_ext}, format='multipart')
        self.assertEqual(response.json()['errors'], {'documents': 'file_type'})
        self.assertEqual(AdmissionApplication.objects.count(), 0)

    def test_document_size_and_count_limits(self):
        self.adm.max_document_mb = 1
        self.adm.max_documents = 1
        self.adm.save()
        big = SimpleUploadedFile('big.pdf', PDF + b'0' * (1024 * 1024 + 1))
        with override_settings(ADMISSION_MIN_FILL_SECONDS=0):
            response = self.client.post(self.url, {**self.payload(consent='true'), 'documents': big}, format='multipart')
        self.assertEqual(response.json()['errors'], {'documents': 'file_size'})
        two = [SimpleUploadedFile('a.pdf', PDF), SimpleUploadedFile('b.png', PNG)]
        with override_settings(ADMISSION_MIN_FILL_SECONDS=0):
            response = self.client.post(self.url, {**self.payload(consent='true'), 'documents': two}, format='multipart')
        self.assertEqual(response.json()['errors'], {'documents': 'too_many_files'})

    def test_no_public_access_to_applications(self):
        self.submit()
        for path in (ADMIN + 'applications/', ADMIN + 'export/', ADMIN + 'settings/'):
            self.assertIn(self.client.get(path).status_code, (401, 403))
        profile = self.client.get(f'/api/v1/schools/public/{self.school.public_slug}/')
        self.assertNotIn('Ngu', profile.content.decode())
        listing = self.client.get(PUBLIC.format(slug=self.school.public_slug))
        self.assertNotIn('Ngu', listing.content.decode())

    def test_logs_do_not_contain_personal_data(self):
        with self.assertLogs(level='DEBUG') as logs:
            import logging
            logging.getLogger('apps.schools').debug('probe')
            self.submit()
        joined = '\n'.join(logs.output)
        for secret in ('Ngu', 'peter@example.org', '650 111 222'):
            self.assertNotIn(secret, joined)


class EmailTests(AdmissionBase):
    def test_emails_sent_once_each(self):
        with mock.patch('core.email_service.send_transactional_email', return_value=True) as send:
            with self.captureOnCommitCallbacks(execute=True):
                app_id = self.submit().json()['reference']
            self.assertEqual(send.call_count, 2)
            recipients = {call.kwargs['to_email'] for call in send.call_args_list}
            self.assertEqual(recipients, {self.school.email, 'peter@example.org'})
            application = AdmissionApplication.objects.get(reference=app_id)
            svc.notify_submission(application.pk)
            self.assertEqual(send.call_count, 2)
        self.assertEqual(EmailNotificationLog.objects.filter(key__startswith='admission:').count(), 2)

    def test_school_notice_has_no_child_details(self):
        with mock.patch('core.email_service.send_transactional_email', return_value=True) as send:
            with self.captureOnCommitCallbacks(execute=True):
                self.submit()
        notice = [c for c in send.call_args_list if c.kwargs['to_email'] == self.school.email][0].kwargs
        self.assertNotIn('Mary', notice['html'] + notice['text'] + notice['subject'])

    def test_custom_notification_email_and_auto_reply(self):
        self.adm.notification_email = 'admissions@example.org'
        self.adm.auto_reply_en = 'We <b>will</b> call you.'
        self.adm.save()
        with mock.patch('core.email_service.send_transactional_email', return_value=True) as send:
            with self.captureOnCommitCallbacks(execute=True):
                self.submit()
        recipients = {c.kwargs['to_email'] for c in send.call_args_list}
        self.assertIn('admissions@example.org', recipients)
        ack = [c for c in send.call_args_list if c.kwargs['to_email'] == 'peter@example.org'][0].kwargs
        self.assertNotIn('<b>', ack['html'])  # escaped
        self.assertIn('&lt;b&gt;will', ack['html'])

    def test_mail_failure_does_not_break_the_request(self):
        with mock.patch('core.email_service.send_transactional_email', side_effect=RuntimeError('smtp down')):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.submit()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(AdmissionApplication.objects.count(), 1)
        self.assertEqual(EmailNotificationLog.objects.filter(key__startswith='admission:').count(), 0)

    def test_header_injection_is_neutralised(self):
        with mock.patch('core.email_service.send_transactional_email', return_value=True) as send:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.submit(guardian_name='Peter\r\nBcc: evil@example.org',
                                       guardian_email='peter@example.org')
        self.assertEqual(response.status_code, 201)
        for call in send.call_args_list:
            for key in ('subject', 'to_name', 'to_email'):
                self.assertNotIn('\n', call.kwargs[key])
        bad = self.submit(guardian_email='a@example.org\nBcc: evil@example.org', student_full_name='Other Child')
        self.assertEqual(bad.json()['errors'], {'guardian_email': 'invalid'})


class AdminAccessTests(AdmissionBase):
    def test_roles(self):
        for user, expected in ((self.admin, 200), (self.sub, 200), (self.teacher, 403), (self.other_admin, 200)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(ADMIN + 'applications/').status_code, expected)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(ADMIN + 'applications/').status_code, (401, 403))

    def test_tenant_isolation_everywhere(self):
        app = self.make_application()
        doc = ApplicationDocument.objects.create(application=app, doc_type='pdf', size=3)
        self.client.force_authenticate(self.other_admin)
        base = f'{ADMIN}applications/{app.id}/'
        self.assertEqual(self.client.get(ADMIN + 'applications/').json()['count'], 0)
        self.assertEqual(self.client.get(base).status_code, 404)
        self.assertEqual(self.client.patch(base, {'status': 'accepted'}, format='json').status_code, 404)
        self.assertEqual(self.client.post(base + 'enrol/', {}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f'{base}documents/{doc.id}/link/').status_code, 404)
        self.assertNotIn('Ada Pupil', b''.join(self.client.get(ADMIN + 'export/').streaming_content).decode())
        # A token minted for the owner cannot be used by the other school's admin.
        token = svc.make_download_token(doc, self.admin)
        self.assertEqual(self.client.get(f'{ADMIN}documents/download/{token}/').status_code, 403)
        self.assertEqual(AdmissionSettings.objects.filter(school=self.other).count(), 0)
        self.client.get(ADMIN + 'settings/')
        self.assertEqual(AdmissionSettings.objects.get(school=self.other).intake_year, '')
        app.refresh_from_db()
        self.assertEqual(app.status, 'new')

    def test_sub_admin_limited_to_their_sub_school(self):
        from apps.schools.models import SubSchool

        sub_school, _ = SubSchool.objects.get_or_create(school=self.school, name='English Section')
        in_scope = SchoolClass.objects.create(school=self.school, name='E1', sub_school=sub_school, cycle='primary')
        self.sub.sub_school = sub_school
        self.sub.save()
        mine = self.make_application(class_applied=in_scope, class_applied_name='E1')
        self.make_application()
        self.client.force_authenticate(self.sub)
        rows = self.client.get(ADMIN + 'applications/').json()['results']
        self.assertEqual([r['id'] for r in rows], [str(mine.id)])
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(ADMIN + 'applications/').json()['count'], 2)


class AdminListTests(AdmissionBase):
    def test_filter_search_paginate(self):
        a = self.make_application(student_full_name='Alice One', status='accepted')
        self.make_application(student_full_name='Bob Two', guardian_name='Carol', guardian_email='c@example.org')
        self.client.force_authenticate(self.admin)
        get = lambda q: self.client.get(ADMIN + 'applications/' + q).json()  # noqa: E731
        self.assertEqual(get('?status=accepted')['count'], 1)
        self.assertEqual(get('?q=carol')['count'], 1)
        self.assertEqual(get(f'?q={a.reference}')['count'], 1)
        self.assertEqual(get(f'?class={self.klass.id}')['count'], 2)
        self.assertEqual(get('?class=not-a-uuid')['count'], 0)
        today = timezone.localdate().isoformat()
        self.assertEqual(get(f'?date_from={today}&date_to={today}')['count'], 2)
        self.assertEqual(get('?date_from=2999-01-01')['count'], 0)
        page = get('?page_size=1')
        self.assertEqual(len(page['results']), 1)
        self.assertEqual(page['count'], 2)
        self.assertEqual(page['status_counts'], {'accepted': 1, 'new': 1})

    def test_patch_status_and_notes_write_audit(self):
        app = self.make_application()
        self.client.force_authenticate(self.admin)
        url = f'{ADMIN}applications/{app.id}/'
        response = self.client.patch(url, {'status': 'under_review', 'internal_notes': '<i>call</i> Monday'}, format='json')
        self.assertEqual(response.status_code, 200)
        app.refresh_from_db()
        self.assertEqual(app.status, 'under_review')
        self.assertEqual(app.internal_notes, 'call Monday')
        self.assertEqual(app.handled_by_id, self.admin.id)
        actions = list(AdmissionAuditEntry.objects.filter(application=app).values_list('action', 'from_status', 'to_status'))
        self.assertIn(('status_changed', 'new', 'under_review'), actions)
        self.assertIn(('notes_updated', '', ''), actions)
        self.assertEqual(self.client.patch(url, {'status': 'enrolled'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'status': 'bogus'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'reference': 'x'}, format='json').status_code, 400)

    def test_export_csv_neutralises_formulas_and_is_audited(self):
        self.make_application(student_full_name='=HYPERLINK("http://evil")')
        self.client.force_authenticate(self.admin)
        response = self.client.get(ADMIN + 'export/')
        body = b''.join(response.streaming_content).decode()
        self.assertEqual(response['Content-Type'].split(';')[0], 'text/csv')
        self.assertIn("'=HYPERLINK", body)
        self.assertTrue(AdmissionAuditEntry.objects.filter(action='exported').exists())


class SignedDocumentTests(AdmissionBase):
    def setUp(self):
        super().setUp()
        self.app = self.make_application()
        self.doc = ApplicationDocument(application=self.app, doc_type='pdf', content_type='application/pdf',
                                       original_name='cert.pdf', size=len(PDF))
        self.doc.file.save('abc.pdf', SimpleUploadedFile('abc.pdf', PDF), save=False)
        self.doc.save()
        self.client.force_authenticate(self.admin)

    def link(self):
        response = self.client.post(f'{ADMIN}applications/{self.app.id}/documents/{self.doc.id}/link/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['expires_in'], 300)
        return response.json()['url']

    def test_download_works_and_is_attachment_and_audited(self):
        response = self.client.get(self.link())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b''.join(response.streaming_content), PDF)
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        self.assertTrue(AdmissionAuditEntry.objects.filter(action='document_downloaded').exists())

    def test_expired_link(self):
        url = self.link()
        with mock.patch.object(svc, 'DOWNLOAD_MAX_AGE', -1):
            self.assertEqual(self.client.get(url).status_code, 410)

    def test_tampered_link(self):
        url = self.link()
        self.assertEqual(self.client.get(url[:-3] + 'abc/').status_code, 403)
        forged = signing.TimestampSigner(salt='other').sign(f'{self.doc.id}:{self.app.id}:{self.admin.pk}')
        self.assertEqual(self.client.get(f'{ADMIN}documents/download/{forged}/').status_code, 403)

    def test_link_bound_to_the_user_who_asked(self):
        url = self.link()
        self.client.force_authenticate(self.sub)
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(url).status_code, (401, 403))

    def test_document_of_other_application_cannot_be_linked(self):
        other_app = self.make_application(student_full_name='Someone Else')
        response = self.client.post(f'{ADMIN}applications/{other_app.id}/documents/{self.doc.id}/link/')
        self.assertEqual(response.status_code, 404)


class EnrolTests(AdmissionBase):
    def enrol(self, app, **body):
        self.client.force_authenticate(self.admin)
        return self.client.post(f'{ADMIN}applications/{app.id}/enrol/', body, format='json')

    def test_requires_accepted(self):
        app = self.make_application()
        self.assertEqual(self.enrol(app).status_code, 400)

    def test_enrols_loginless_pupil_once_for_basic_school(self):
        app = self.make_application(status='accepted', student_gender='female', guardian_email='m@example.org')
        with mock.patch.object(students_api, 'create_pupil_from_admission',
                               wraps=students_api.create_pupil_from_admission) as through_api:
            response = self.enrol(app)
        self.assertEqual(response.status_code, 201, response.content)
        through_api.assert_called_once()
        student = students_api.get_student(response.json()['student_id'])
        self.assertIsNone(student.user_id)
        self.assertEqual(student.display_name, 'Ada Pupil')
        self.assertEqual(student.school_class_id, self.klass.id)
        self.assertEqual(student.school_id, self.school.id)
        self.assertTrue(student.display_matricule)
        app.refresh_from_db()
        self.assertEqual(app.status, 'enrolled')
        self.assertEqual(str(app.enrolled_student_id), str(student.id))
        again = self.enrol(app)
        self.assertEqual(again.status_code, 409)
        self.assertEqual(students_api.list_students(school=self.school).count(), 1)
        self.assertTrue(AdmissionAuditEntry.objects.filter(action='enrolled', application=app).exists())

    def test_duplicate_pupil_is_warned_then_confirmed(self):
        app = self.make_application(status='accepted')
        first = self.enrol(self.make_application(status='accepted', student_full_name='Ada Pupil'))
        self.assertEqual(first.status_code, 201)
        warn = self.enrol(app)
        self.assertEqual(warn.status_code, 409)
        self.assertEqual(warn.json()['code'], 'possible_duplicate')
        self.assertEqual(len(warn.json()['duplicates']), 1)
        self.assertEqual(students_api.list_students(school=self.school).count(), 1)
        forced = self.enrol(app, confirm_duplicate=True)
        self.assertEqual(forced.status_code, 201)
        self.assertEqual(students_api.list_students(school=self.school).count(), 2)

    def test_class_required_and_must_belong_to_school(self):
        app = self.make_application(status='accepted', class_applied=None, class_applied_name='')
        self.assertEqual(self.enrol(app).status_code, 400)
        self.assertEqual(self.enrol(app, class_id=str(self.other_class.id)).status_code, 400)
        self.assertEqual(self.enrol(app, class_id=str(self.klass.id)).status_code, 201)

    def test_secondary_school_pupil_gets_a_login(self):
        school = make_school('ADS', category='secondary')
        publish(school)
        klass = SchoolClass.objects.create(school=school, name='Form 1')
        admin = make_user('ADM-ADS', 'SCHOOL_ADMIN', school)
        app = AdmissionApplication.objects.create(
            school=school, reference=svc.new_reference(), student_full_name='Sec Pupil', guardian_name='G',
            guardian_phone='650000009', class_applied=klass, class_applied_name='Form 1', status='accepted')
        self.client.force_authenticate(admin)
        response = self.client.post(f'{ADMIN}applications/{app.id}/enrol/', {}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertIsNotNone(students_api.get_student(response.json()['student_id']).user_id)


class SettingsApiTests(AdmissionBase):
    def test_get_and_patch(self):
        self.client.force_authenticate(self.admin)
        got = self.client.get(ADMIN + 'settings/').json()
        self.assertEqual(got['education_category'], 'basic')
        self.assertEqual(got['available_classes'][0]['group'], 'Primary')
        body = {
            'opens_on': '2026-01-01', 'closes_on': '2026-12-31', 'intake_year': '2026-2027',
            'classes_offered': [str(self.klass.id)], 'field_config': {'guardian_address': 'required'},
            'allowed_document_types': ['pdf'], 'max_document_mb': 3, 'notification_email': 'a@example.org',
            'consent_text_en': '<b>I agree</b>',
        }
        response = self.client.patch(ADMIN + 'settings/', body, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        adm = AdmissionSettings.objects.get(school=self.school)
        self.assertEqual(adm.field_config['guardian_address'], 'required')
        self.assertEqual(adm.consent_text_en, 'I agree')
        self.assertEqual(list(adm.classes_offered.values_list('id', flat=True)), [self.klass.id])
        self.assertTrue(AdmissionAuditEntry.objects.filter(action='settings_updated').exists())

    def test_rejects_bad_input(self):
        self.client.force_authenticate(self.admin)
        patch = lambda body: self.client.patch(ADMIN + 'settings/', body, format='json').status_code  # noqa: E731
        self.assertEqual(patch({'opens_on': '2026-05-01', 'closes_on': '2026-04-01'}), 400)
        self.assertEqual(patch({'classes_offered': [str(self.other_class.id)]}), 400)
        self.assertEqual(patch({'field_config': {'nope': 'required'}}), 400)
        self.assertEqual(patch({'field_config': {'guardian_phone': 'hidden', 'guardian_email': 'hidden'}}), 400)
        self.assertEqual(patch({'allowed_document_types': ['exe']}), 400)
        self.assertEqual(patch({'notification_email': 'a@b.com\nBcc: x@y.com'}), 400)
        self.assertEqual(patch({'school': 'ADB'}), 400)

    def test_teacher_cannot_edit(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.patch(ADMIN + 'settings/', {'intake_year': '2030'}, format='json').status_code, 403)


class MigrationTests(APITestCase):
    def test_no_missing_migrations(self):
        call_command('makemigrations', '--check', '--dry-run', verbosity=0)

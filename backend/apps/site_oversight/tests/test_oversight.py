"""Block / unblock of school websites by executive staff: previous status kept, reasons required,
school administrators told by email and in-app, isolation, module permission, activity log."""

import importlib
from unittest.mock import patch

from django.apps import apps as global_apps
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TransactionTestCase
from rest_framework.test import APIClient, APITestCase

from apps.notifications.models import Notification
from apps.orders.models import EmailNotificationLog
from apps.platform.executive_activity_model import ExecutiveActivityLog
from apps.schools.models import PublicationStatus, School, SchoolPublicProfile, SchoolStatus
from apps.site_oversight.models import SiteOversightCase, SiteOversightEvent

User = get_user_model()
SEND = 'core.email_service.send_transactional_email'
OV = '/api/v1/site-oversight/'
PS = '/api/v1/schools/public-site/'
REASON = 'The home page shows content that breaks the platform policy.'
STEPS = 'Remove the offending text and upload a proper school description.'


def make_school(sid):
    return School.objects.create(
        id=sid, name=f'School {sid}', short_name=sid, principal='P. Head', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000', school_type='general',
        subsystem='anglophone', description='A fine school.', status=SchoolStatus.ACTIVE)


def make_user(matricule, role, school=None, **extra):
    return User.objects.create_user(
        matricule=matricule, name=f'User {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='password123', is_license_paid=True, **extra)


class OversightTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = make_school('OVA')
        cls.b = make_school('OVB')
        cls.admin_a = make_user('ADM-OVA', 'SCHOOL_ADMIN', cls.a)
        cls.sub_a = make_user('SUB-OVA', 'SUB_ADMIN', cls.a)
        cls.teacher_a = make_user('TCH-OVA', 'TEACHER', cls.a)
        cls.admin_b = make_user('ADM-OVB', 'SCHOOL_ADMIN', cls.b)
        cls.ceo = make_user('CEO-OV', 'CEO')
        # Role label independence: the module decides, not the label.
        cls.designer = make_user('DES-OV', 'DESIGNER', allowed_modules=['school_websites'])
        cls.coo = make_user('COO-OV', 'COO', allowed_modules=['school_websites'])
        cls.no_module = make_user('INV-OV', 'INV')

    def setUp(self):
        cache.clear()

    def as_user(self, user):
        self.client.force_authenticate(user)

    def set_status(self, school, status):
        profile = SchoolPublicProfile.objects.get_or_create(school=school)[0]
        profile.publication_status = status
        profile.save()

    def block(self, school='OVA', reason=REASON, steps=STEPS):
        body = {}
        if reason is not None:
            body['reason'] = reason
        if steps is not None:
            body['resolution_steps'] = steps
        return self.client.post(f'{OV}schools/{school}/block/', body, format='json')

    def unblock(self, school='OVA', reason='The problem was fixed by the school.'):
        return self.client.post(f'{OV}schools/{school}/unblock/', {'reason': reason}, format='json')

    def public_status(self):
        return APIClient().get(f'/api/v1/schools/public/{self.a.public_slug}/').status_code

    def profile(self):
        return SchoolPublicProfile.objects.get(school=self.a)

    # --- previous status preserved ----------------------------------------
    def test_block_preserves_previous_status_and_unblock_restores_exactly(self):
        for previous in ('published', 'draft', 'unpublished'):
            with self.subTest(previous=previous):
                SiteOversightCase.objects.filter(school=self.a).delete()
                self.set_status(self.a, previous)
                self.as_user(self.ceo)
                response = self.block()
                self.assertEqual(response.status_code, 200, response.data)
                self.assertTrue(response.data['blocked'])
                self.assertEqual(response.data['case']['previous_status'], previous)
                self.assertEqual(self.profile().publication_status, 'unpublished')
                self.assertEqual(self.public_status(), 404)
                response = self.unblock()
                self.assertEqual(response.status_code, 200, response.data)
                self.assertFalse(response.data['blocked'])
                self.assertEqual(self.profile().publication_status, previous)
                self.assertFalse(self.profile().locked_by_founder)
                self.assertEqual(self.public_status(), 200 if previous == 'published' else 404)

    def test_blocked_site_cannot_be_published_or_edited_by_the_school(self):
        self.as_user(self.admin_a)
        self.assertEqual(self.client.post(PS + 'publish/').status_code, 200)
        self.as_user(self.ceo)
        self.block()
        self.as_user(self.admin_a)
        self.assertEqual(self.client.post(PS + 'publish/').status_code, 403)
        self.assertEqual(self.client.post(PS + 'unpublish/').status_code, 403)
        self.assertEqual(self.client.patch(PS + 'profile/', {'vision_en': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'{OV}schools/OVA/unblock/', {'reason': REASON}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'{OV}schools/OVA/block/', {'reason': REASON}, format='json').status_code, 403)

    def test_double_block_and_unblock_when_not_blocked_conflict(self):
        self.as_user(self.ceo)
        self.assertEqual(self.unblock().status_code, 409)
        self.assertEqual(self.block().status_code, 200)
        self.assertEqual(self.block().status_code, 409)

    # --- reasons ----------------------------------------------------------
    def test_reason_required_for_every_action(self):
        self.as_user(self.ceo)
        self.set_status(self.a, 'published')
        for bad in (None, '', '   ', 'too short', 'x' * 1001, '<b></b>'):
            self.assertEqual(self.block(reason=bad).status_code, 400, bad)
        self.assertEqual(self.block(steps=None).status_code, 400)
        self.assertEqual(self.block(steps='short').status_code, 400)
        self.assertEqual(self.client.post(f'{OV}schools/OVA/unblock/', {}, format='json').status_code, 400)
        self.assertEqual(self.block().status_code, 200)
        self.assertEqual(self.unblock(reason=None).status_code, 400)
        self.assertEqual(self.unblock(reason='short').status_code, 400)
        self.assertEqual(self.client.post(f'{OV}schools/OVA/resolution/',
                                          {'resolution_steps': STEPS}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{OV}schools/OVA/resolution/',
                                          {'reason': REASON}, format='json').status_code, 400)
        self.assertEqual(self.unblock().status_code, 200)
        # publish / unpublish / edit on behalf
        for action in ('publish', 'unpublish'):
            self.assertEqual(self.client.post(f'{OV}schools/OVA/{action}/', {}, format='json').status_code, 400)
            self.assertEqual(self.client.post(f'{PS}{action}/', {'school': 'OVA'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(PS + 'profile/', {'school': 'OVA', 'vision_en': 'x'},
                                           format='json').status_code, 400)
        # legacy endpoints also need the reason now
        self.assertEqual(self.client.post(f'{PS}schools/OVA/force-unpublish/', {}, format='json').status_code, 400)
        self.assertEqual(SiteOversightEvent.objects.filter(action='block').count(), 1)

    def test_staff_publish_unpublish_edit_with_reason_are_recorded(self):
        self.as_user(self.coo)
        ok = 'Publishing on behalf of the school as agreed.'
        self.assertEqual(self.client.post(f'{OV}schools/OVA/publish/', {'reason': ok}, format='json').status_code, 200)
        self.assertEqual(self.profile().publication_status, 'published')
        self.assertEqual(self.client.patch(PS + 'profile/', {'school': 'OVA', 'vision_en': 'Edited', 'reason': ok},
                                           format='json').status_code, 200)
        self.assertEqual(self.profile().vision_en, 'Edited')
        self.assertEqual(self.client.post(f'{OV}schools/OVA/unpublish/', {'reason': ok}, format='json').status_code, 200)
        actions = list(SiteOversightEvent.objects.filter(school=self.a).values_list('action', flat=True))
        self.assertEqual(sorted(actions), ['edit', 'publish', 'unpublish'])
        event = SiteOversightEvent.objects.filter(action='publish').first()
        self.assertEqual(event.reason, ok)
        self.assertEqual(event.actor_role, 'COO')
        self.assertEqual(event.actor_department, 'Operational Department')

    def test_staff_cannot_publish_while_blocked(self):
        self.as_user(self.ceo)
        self.block()
        self.assertEqual(self.client.post(f'{OV}schools/OVA/publish/', {'reason': REASON}, format='json').status_code, 409)

    def test_events_are_append_only(self):
        self.as_user(self.ceo)
        self.block()
        event = SiteOversightEvent.objects.get()
        event.reason = 'changed afterwards'
        with self.assertRaises(PermissionError):
            event.save()
        with self.assertRaises(PermissionError):
            event.delete()

    # --- permission by module, not role label -----------------------------
    def test_module_decides_not_role_label(self):
        for user in (self.designer, self.coo, self.ceo):
            self.as_user(user)
            self.assertEqual(self.client.get(OV + 'schools/').status_code, 200, user.role)
        for user in (self.no_module, self.admin_a, self.teacher_a):
            self.as_user(user)
            self.assertEqual(self.client.get(OV + 'schools/').status_code, 403, user.role)
            self.assertEqual(self.block().status_code, 403, user.role)
        # taking the module away denies the same label
        self.designer.allowed_modules = []
        self.designer.save(update_fields=['allowed_modules'])
        self.as_user(self.designer)
        self.assertEqual(self.block().status_code, 403)
        self.assertEqual(self.client.post(f'{OV}schools/OVA/publish/', {'reason': REASON}, format='json').status_code, 403)
        self.assertEqual(self.client.patch(PS + 'profile/', {'school': 'OVA', 'reason': REASON},
                                           format='json').status_code, 403)
        self.assertFalse(SiteOversightCase.objects.exists())

    def test_executive_with_module_can_block_and_unblock(self):
        self.as_user(self.designer)
        self.assertEqual(self.block().status_code, 200)
        self.assertEqual(self.unblock().status_code, 200)

    def test_list_filters_blocked_and_status(self):
        self.set_status(self.a, 'published')
        self.as_user(self.ceo)
        self.block()
        rows = self.client.get(OV + 'schools/', {'blocked': '1'}).data['results']
        self.assertEqual([r['id'] for r in rows], ['OVA'])
        self.assertTrue(rows[0]['blocked'])
        self.assertEqual(rows[0]['case']['block_reason'], REASON)
        published = self.client.get(OV + 'schools/', {'status': 'published'}).data['results']
        self.assertNotIn('OVA', [r['id'] for r in published])
        self.assertEqual([r['id'] for r in self.client.get(OV + 'schools/', {'q': 'OVB'}).data['results']], ['OVB'])

    # --- tenant isolation -------------------------------------------------
    def test_school_admin_sees_only_own_block(self):
        self.as_user(self.ceo)
        self.block()
        self.as_user(self.admin_b)
        data = self.client.get(OV + 'mine/').data
        self.assertFalse(data['blocked'])
        self.assertEqual(data['timeline'], [])
        self.as_user(self.sub_a)
        data = self.client.get(OV + 'mine/').data
        self.assertTrue(data['blocked'])
        self.assertEqual(data['case']['resolution_steps'], STEPS)
        self.assertEqual(len(data['timeline']), 1)
        self.as_user(self.teacher_a)
        self.assertEqual(self.client.get(OV + 'mine/').status_code, 403)
        self.assertFalse(SiteOversightCase.objects.filter(school=self.b).exists())
        self.assertFalse(SchoolPublicProfile.objects.get(school=self.b).locked_by_founder)

    def test_unblocked_shows_last_resolved_for_the_success_banner(self):
        self.as_user(self.ceo)
        self.block()
        self.unblock()
        self.as_user(self.admin_a)
        data = self.client.get(OV + 'mine/').data
        self.assertFalse(data['blocked'])
        self.assertEqual(data['last_resolved']['restored_status'], 'draft')
        self.assertEqual(data['timeline'][0]['action'], 'unblock')

    # --- notifications ----------------------------------------------------
    @patch(SEND, return_value=True)
    def test_school_admins_get_email_and_in_app_once(self, send):
        self.as_user(self.coo)
        with self.captureOnCommitCallbacks(execute=True):
            self.block()
        self.assertEqual(Notification.objects.filter(recipient=self.admin_a).count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.sub_a).count(), 1)
        self.assertEqual(Notification.objects.filter(recipient__in=[self.teacher_a, self.admin_b]).count(), 0)
        note = Notification.objects.get(recipient=self.admin_a)
        self.assertEqual(note.url, '/dashboard/school-website')
        self.assertIn(REASON, note.message)
        self.assertIn(STEPS, note.message)
        self.assertIn('Operational Department', note.message)
        self.assertEqual(send.call_count, 2)
        sent = {c.kwargs['to_email'] for c in send.call_args_list}
        self.assertEqual(sent, {'adm-ova@example.org', 'sub-ova@example.org'})
        html = send.call_args.kwargs['html']
        self.assertIn(REASON, html)
        self.assertIn(STEPS, html)
        self.assertIn('/dashboard/school-website', html)
        self.assertIn('offline until the issue is resolved', send.call_args.kwargs['text'])
        self.assertEqual(EmailNotificationLog.objects.filter(key__startswith='site-oversight:').count(), 2)
        # idempotent: running the sender again for the same event sends nothing more
        from apps.site_oversight.notifications import send_emails
        send_emails(str(SiteOversightEvent.objects.get().pk))
        self.assertEqual(send.call_count, 2)

    @patch(SEND, return_value=True)
    def test_text_is_escaped_in_the_email(self, send):
        self.as_user(self.ceo)
        with self.captureOnCommitCallbacks(execute=True):
            self.block(reason='Contains <script>alert(1)</script> and a long enough explanation')
        self.assertNotIn('<script>', send.call_args.kwargs['html'])

    @patch(SEND, side_effect=RuntimeError('provider down'))
    def test_email_failure_never_breaks_the_action(self, send):
        self.as_user(self.ceo)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.block().status_code, 200)
        self.assertTrue(self.profile().locked_by_founder)
        self.assertEqual(Notification.objects.filter(recipient=self.admin_a).count(), 1)

    @patch(SEND, return_value=True)
    def test_unblock_and_resolution_update_renotify(self, send):
        self.set_status(self.a, 'published')
        self.as_user(self.ceo)
        with self.captureOnCommitCallbacks(execute=True):
            self.block()
        new_steps = 'Also add a phone number and a correct address to the page.'
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f'{OV}schools/OVA/resolution/',
                                        {'reason': 'More detail for the school', 'resolution_steps': new_steps},
                                        format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(SiteOversightCase.objects.get().resolution_steps, new_steps)
        self.assertEqual(Notification.objects.filter(recipient=self.admin_a).count(), 2)
        self.assertEqual(send.call_count, 4)
        self.assertIn(new_steps, send.call_args.kwargs['text'])
        with self.captureOnCommitCallbacks(execute=True):
            self.unblock()
        self.assertEqual(Notification.objects.filter(recipient=self.admin_a).count(), 3)
        self.assertEqual(send.call_count, 6)
        self.assertIn('live again', send.call_args.kwargs['text'])
        timeline = self.client.get(f'{OV}schools/OVA/timeline/').data['timeline']
        self.assertEqual([e['action'] for e in timeline], ['unblock', 'steps_updated', 'block'])

    # --- legacy + activity log --------------------------------------------
    def test_legacy_endpoints_still_work_with_a_reason(self):
        self.set_status(self.a, 'published')
        self.as_user(self.ceo)
        body = {'reason': REASON, 'resolution_steps': STEPS}
        response = self.client.post(f'{PS}schools/OVA/force-unpublish/', body, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['locked_by_founder'])
        self.assertEqual(SiteOversightCase.objects.get().previous_status, 'published')
        response = self.client.post(f'{PS}schools/OVA/unlock/', {'reason': REASON}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['publication_status'], 'published')
        rows = self.client.get(PS + 'schools/', {'status': 'blocked'}).data['results']
        self.assertEqual(rows, [])

    def test_executive_activity_log_records_the_actions(self):
        self.as_user(self.coo)
        self.block()
        self.unblock()
        entries = ExecutiveActivityLog.objects.filter(module='school_websites')
        self.assertEqual(entries.count(), 2)
        self.assertEqual({e.actor_id for e in entries}, {self.coo.pk})


class BackfillTests(TransactionTestCase):
    def test_locked_sites_get_an_open_case_restoring_unpublished(self):
        school = make_school('OVL')
        SchoolPublicProfile.objects.update_or_create(
            school=school, defaults={'locked_by_founder': True, 'publication_status': 'unpublished'})
        free = make_school('OVF')
        SchoolPublicProfile.objects.update_or_create(school=free, defaults={'publication_status': 'published'})
        migration = importlib.import_module('apps.site_oversight.migrations.0002_backfill_locked_sites')
        migration.backfill(global_apps, None)
        migration.backfill(global_apps, None)  # idempotent
        case = SiteOversightCase.objects.get()
        self.assertEqual((case.school_id, case.state, case.previous_status, case.migrated),
                         ('OVL', 'open', 'unpublished', True))
        self.assertEqual(SiteOversightEvent.objects.count(), 1)
        self.assertEqual(SchoolPublicProfile.objects.get(school=free).publication_status, 'published')
        admin = make_user('ADM-OVL', 'SCHOOL_ADMIN', school)
        ceo = make_user('CEO-OVL', 'CEO')
        client = APIClient()
        client.force_authenticate(ceo)
        response = client.post(f'{OV}schools/OVL/unblock/', {'reason': 'Reviewed and cleared by staff.'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(SchoolPublicProfile.objects.get(school=school).publication_status, 'unpublished')
        self.assertFalse(SchoolPublicProfile.objects.get(school=school).locked_by_founder)
        self.assertIsNotNone(admin)


class MigrationStateTests(TransactionTestCase):
    def test_makemigrations_check_is_clean(self):
        call_command('makemigrations', '--check', '--dry-run', verbosity=0)

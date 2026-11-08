"""School public-site management API: tenant isolation, publish rules, audit, founder oversight."""

import importlib

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase
from rest_framework.test import APITestCase

from apps.schools.models import PublicationStatus, PublicSiteAuditLog, School, SchoolPublicProfile, SchoolStatus

User = get_user_model()
BASE = '/api/v1/schools/public-site/'


def make_school(sid, **extra):
    fields = dict(
        id=sid, name=f'School {sid}', short_name=sid, principal='P. Head', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000', school_type='general',
        subsystem='anglophone', description='A fine school.', status=SchoolStatus.ACTIVE,
    )
    fields.update(extra)
    return School.objects.create(**fields)


def make_user(matricule, role, school=None):
    return User.objects.create_user(
        matricule=matricule, name=f'User {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='password123', is_license_paid=True,
    )


class PublicSiteManagementTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = make_school('PSA')
        cls.b = make_school('PSB')
        cls.admin_a = make_user('ADM-PSA', 'SCHOOL_ADMIN', cls.a)
        cls.sub_a = make_user('SUB-PSA', 'SUB_ADMIN', cls.a)
        cls.admin_b = make_user('ADM-PSB', 'SCHOOL_ADMIN', cls.b)
        cls.teacher_a = make_user('TCH-PSA', 'TEACHER', cls.a)
        cls.ceo = make_user('CEO-PS', 'CEO')
        cls.cto = make_user('CTO-PS', 'CTO')
        cls.coo = make_user('COO-PS', 'COO')

    def setUp(self):
        cache.clear()

    def as_user(self, user):
        self.client.force_authenticate(user)

    # --- access -----------------------------------------------------------
    def test_anonymous_and_teacher_denied(self):
        self.assertIn(self.client.get(BASE + 'profile/').status_code, (401, 403))
        self.as_user(self.teacher_a)
        self.assertEqual(self.client.get(BASE + 'profile/').status_code, 403)
        self.assertEqual(self.client.post(BASE + 'publish/').status_code, 403)

    def test_admin_reads_own_profile_default_draft_and_private(self):
        self.as_user(self.admin_a)
        data = self.client.get(BASE + 'profile/').data
        self.assertEqual(data['publication_status'], 'draft')
        self.assertFalse(data['show_email'])
        self.assertFalse(data['show_phone'])
        self.assertFalse(data['show_principal'])
        self.assertFalse(data['enrollment_enabled'])
        self.assertEqual(data['school']['id'], 'PSA')
        self.assertFalse(data['is_live'])

    def test_sub_admin_can_edit_own_school(self):
        self.as_user(self.sub_a)
        response = self.client.patch(BASE + 'profile/', {'vision_en': 'Hello'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    # --- tenant isolation -------------------------------------------------
    def test_admin_cannot_read_or_modify_other_school(self):
        self.as_user(self.admin_a)
        self.assertEqual(self.client.get(BASE + 'profile/', {'school': 'PSB'}).status_code, 403)
        self.assertEqual(
            self.client.patch(BASE + 'profile/', {'school': 'PSB', 'vision_en': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(BASE + 'publish/', {'school': 'PSB'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(BASE + 'unpublish/', {'school': 'PSB'}, format='json').status_code, 403)
        self.assertEqual(self.client.get(BASE + 'audit/', {'school': 'PSB'}).status_code, 403)
        self.assertEqual(
            self.client.post(BASE + 'preview-token/rotate/', {'school': 'PSB'}, format='json').status_code, 403)
        self.assertFalse(SchoolPublicProfile.objects.filter(school=self.b).exists())

    def test_own_edits_never_touch_other_school_and_audit_is_separate(self):
        self.as_user(self.admin_a)
        self.client.patch(BASE + 'profile/', {'vision_en': 'Only A'}, format='json')
        self.as_user(self.admin_b)
        self.assertEqual(self.client.get(BASE + 'profile/').data['vision_en'], '')
        self.assertEqual(self.client.get(BASE + 'audit/').data['count'], 0)

    def test_executive_must_name_school_and_can_manage_any(self):
        self.as_user(self.coo)
        self.assertEqual(self.client.get(BASE + 'profile/').status_code, 400)
        response = self.client.patch(BASE + 'profile/', {'school': 'PSB', 'vision_en': 'By exec'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(SchoolPublicProfile.objects.get(school=self.b).vision_en, 'By exec')

    # --- editing ----------------------------------------------------------
    def test_html_is_stripped_from_text_fields(self):
        self.as_user(self.admin_a)
        payload = {
            'vision_en': '<script>alert(1)</script>Be <b>bold</b>',
            'hero_title_fr': '<img src=x onerror=alert(1)>Bienvenue',
            'core_values': [{'en': '<i>Integrity</i>', 'fr': 'Integrite'}],
        }
        data = self.client.patch(BASE + 'profile/', payload, format='json').data
        self.assertNotIn('<', data['vision_en'])
        self.assertIn('Be bold', data['vision_en'])
        self.assertEqual(data['hero_title_fr'], 'Bienvenue')
        self.assertEqual(data['core_values'], [{'en': 'Integrity', 'fr': 'Integrite'}])

    def test_validation_of_colour_social_and_protected_fields(self):
        self.as_user(self.admin_a)
        self.assertEqual(self.client.patch(BASE + 'profile/', {'theme_accent': 'red'}, format='json').status_code, 400)
        self.assertEqual(
            self.client.patch(BASE + 'profile/', {'social_links': {'facebook': 'javascript:alert(1)'}},
                              format='json').status_code, 400)
        self.assertEqual(
            self.client.patch(BASE + 'profile/', {'og_image': 'http://insecure/x.png'}, format='json').status_code, 400)
        for field in ('publication_status', 'preview_token', 'locked_by_founder', 'published_at'):
            response = self.client.patch(BASE + 'profile/', {field: 'x'}, format='json')
            self.assertEqual(response.status_code, 400, field)
        ok = self.client.patch(
            BASE + 'profile/', {'theme_accent': '#1a73e8', 'social_links': {'facebook': 'https://fb.com/x'}},
            format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(SchoolPublicProfile.objects.get(school=self.a).publication_status, 'draft')

    # --- publish / unpublish ---------------------------------------------
    def test_publish_validation_errors_are_clear(self):
        bare = make_school('PSC', description='', email='', phone='')
        admin = make_user('ADM-PSC', 'SCHOOL_ADMIN', bare)
        self.as_user(admin)
        response = self.client.post(BASE + 'publish/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('description', response.data['errors'])
        self.assertIn('contact', response.data['errors'])
        self.assertEqual(SchoolPublicProfile.objects.get(school=bare).publication_status, 'draft')

    def test_publish_then_page_is_public_then_unpublish_hides_it(self):
        self.as_user(self.admin_a)
        slug = self.a.public_slug
        public = APITestCaseClient()
        self.assertEqual(public.get(f'/api/v1/schools/public/{slug}/').status_code, 404)
        response = self.client.post(BASE + 'publish/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['publication_status'], 'published')
        self.assertIsNotNone(response.data['published_at'])
        self.assertEqual(public.get(f'/api/v1/schools/public/{slug}/').status_code, 200)
        self.assertEqual(self.client.post(BASE + 'unpublish/').status_code, 200)
        self.assertEqual(public.get(f'/api/v1/schools/public/{slug}/').status_code, 404)

    def test_publish_refused_when_school_not_active(self):
        pending = make_school('PSD', status=SchoolStatus.PENDING)
        self.as_user(make_user('ADM-PSD', 'SCHOOL_ADMIN', pending))
        response = self.client.post(BASE + 'publish/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('school', response.data['errors'])

    def test_preview_token_rotation_works_and_invalidates_old(self):
        self.as_user(self.admin_a)
        first = self.client.post(BASE + 'preview-token/rotate/').data['preview_token']
        second = self.client.post(BASE + 'preview-token/rotate/').data['preview_token']
        self.assertNotEqual(first, second)
        public = APITestCaseClient()
        url = f'/api/v1/schools/public/{self.a.public_slug}/'
        self.assertEqual(public.get(url, {'preview': first}).status_code, 404)
        preview = public.get(url, {'preview': second})
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview['Cache-Control'], 'no-store')

    # --- audit ------------------------------------------------------------
    def test_every_change_writes_an_audit_row(self):
        self.as_user(self.admin_a)
        self.client.patch(BASE + 'profile/', {'vision_en': 'Vision', 'show_email': True}, format='json',
                          REMOTE_ADDR='10.1.2.3')
        self.client.post(BASE + 'preview-token/rotate/')
        self.client.post(BASE + 'publish/')
        self.client.post(BASE + 'unpublish/')
        actions = list(PublicSiteAuditLog.objects.filter(school=self.a).order_by('created_at')
                       .values_list('action', flat=True))
        self.assertEqual(actions, ['profile_updated', 'preview_token_rotated', 'published', 'unpublished'])
        row = PublicSiteAuditLog.objects.get(school=self.a, action='profile_updated')
        self.assertEqual(row.actor, self.admin_a)
        self.assertEqual(row.ip_address, '10.1.2.3')
        self.assertEqual(row.changes['vision_en'], {'before': '', 'after': 'Vision'})
        self.assertEqual(row.changes['show_email']['after'], 'True')
        listing = self.client.get(BASE + 'audit/').data
        self.assertEqual(listing['count'], 4)
        self.assertEqual(listing['results'][0]['action'], 'unpublished')

    def test_noop_patch_writes_no_audit(self):
        self.as_user(self.admin_a)
        self.client.patch(BASE + 'profile/', {'vision_en': ''}, format='json')
        self.assertEqual(PublicSiteAuditLog.objects.filter(school=self.a).count(), 0)

    # --- founders ---------------------------------------------------------
    def test_founders_list_status_and_non_founders_cannot(self):
        self.as_user(self.admin_a)
        self.client.post(BASE + 'publish/')
        self.as_user(self.admin_b)
        self.assertEqual(self.client.get(BASE + 'schools/').status_code, 403)
        self.as_user(self.coo)
        self.assertEqual(self.client.get(BASE + 'schools/').status_code, 403)
        self.as_user(self.ceo)
        rows = {r['id']: r for r in self.client.get(BASE + 'schools/').data['results']}
        self.assertEqual(rows['PSA']['publication_status'], 'published')
        self.assertTrue(rows['PSA']['is_live'])
        self.assertEqual(rows['PSB']['publication_status'], 'draft')
        drafts = self.client.get(BASE + 'schools/', {'status': 'draft'}).data['results']
        self.assertNotIn('PSA', [r['id'] for r in drafts])
        self.assertIn('PSB', [r['id'] for r in drafts])

    def test_founder_force_unpublish_locks_until_unlocked(self):
        self.as_user(self.admin_a)
        self.client.post(BASE + 'publish/')
        public = APITestCaseClient()
        url = f'/api/v1/schools/public/{self.a.public_slug}/'
        self.assertEqual(public.get(url).status_code, 200)
        self.as_user(self.admin_b)
        self.assertEqual(self.client.post(BASE + 'schools/PSA/force-unpublish/').status_code, 403)
        self.as_user(self.cto)
        response = self.client.post(BASE + 'schools/PSA/force-unpublish/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(public.get(url).status_code, 404)
        self.as_user(self.admin_a)
        self.assertEqual(self.client.post(BASE + 'publish/').status_code, 403)
        self.as_user(self.ceo)
        self.assertEqual(self.client.post(BASE + 'schools/PSA/unlock/').status_code, 200)
        self.as_user(self.admin_a)
        self.assertEqual(self.client.post(BASE + 'publish/').status_code, 200)
        actions = set(PublicSiteAuditLog.objects.filter(school=self.a).values_list('action', flat=True))
        self.assertTrue({'force_unpublished', 'publication_unlocked'} <= actions)
        self.as_user(self.ceo)
        self.assertEqual(self.client.post(BASE + 'schools/NOPE/force-unpublish/').status_code, 404)

    def test_mine_tells_any_school_user_whether_their_site_is_live(self):
        self.as_user(self.teacher_a)
        data = self.client.get(BASE + 'mine/').data
        self.assertFalse(data['is_live'])
        self.assertEqual(data['slug'], self.a.public_slug)
        self.as_user(self.admin_a)
        self.client.post(BASE + 'publish/')
        self.as_user(self.teacher_a)
        self.assertTrue(self.client.get(BASE + 'mine/').data['is_live'])
        self.as_user(self.admin_b)
        self.assertFalse(self.client.get(BASE + 'mine/').data['is_live'])
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(BASE + 'mine/').status_code, (401, 403))

    def test_kill_switch_still_overrides_published(self):
        self.as_user(self.admin_a)
        self.client.post(BASE + 'publish/')
        School.objects.filter(pk='PSA').update(public_profile_enabled=False)
        self.assertEqual(APITestCaseClient().get(f'/api/v1/schools/public/{self.a.public_slug}/').status_code, 404)


def APITestCaseClient():
    from rest_framework.test import APIClient
    return APIClient()


class BackfillMigrationTests(TransactionTestCase):
    """The data migration must leave every existing school as a DRAFT (nothing public)."""

    def test_backfill_creates_draft_profile_for_every_school(self):
        make_school('BF1')
        make_school('BF2')
        make_school('BF3')
        SchoolPublicProfile.objects.all().delete()
        migration = importlib.import_module('apps.schools.migrations.0029_public_site_profile')
        from django.apps import apps as global_apps
        migration.create_draft_profiles(global_apps, connection.schema_editor)
        self.assertEqual(SchoolPublicProfile.objects.count(), School.objects.count())
        self.assertFalse(SchoolPublicProfile.objects.exclude(publication_status=PublicationStatus.DRAFT).exists())
        self.assertFalse(SchoolPublicProfile.objects.filter(show_email=True).exists())
        # idempotent
        migration.create_draft_profiles(global_apps, connection.schema_editor)
        self.assertEqual(SchoolPublicProfile.objects.count(), School.objects.count())


class MigrationStateTests(TransactionTestCase):
    def test_makemigrations_check_is_clean(self):
        call_command('makemigrations', '--check', '--dry-run', verbosity=0)

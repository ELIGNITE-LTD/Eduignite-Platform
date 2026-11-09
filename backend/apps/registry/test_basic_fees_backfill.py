"""Basic Education schools must have the Fees app.

Covers the 0008 backfill (idempotent, additive, never re-enables, never touches
non-basic schools), the default bundle for new schools, and that the Fees
routes and permission are reachable for the school admin and the bursar.
"""

from importlib import import_module

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.registry import api as registry_api
from apps.registry.models import AppInstallation
from apps.schools.models import School

User = get_user_model()
MY_APPS = '/api/v1/registry/my-apps/'


def make_school(sid, category):
    return School.objects.create(
        id=sid, name=f'School {sid}', short_name=sid, principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone', education_category=category,
    )


def run_backfill():
    module = import_module('apps.registry.migrations.0008_backfill_fees_for_basic_schools')
    module.backfill(django_apps, None)


class BasicFeesBackfillTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.basic = make_school('FEE-B', 'basic')
        cls.basic_off = make_school('FEE-OFF', 'basic')
        cls.secondary = make_school('FEE-S', 'secondary')
        cls.higher = make_school('FEE-H', 'higher')
        # The state production is in: no fees row at all for these schools.
        AppInstallation.objects.all().delete()
        # A founder switched Fees off on purpose for this one.
        AppInstallation.objects.create(
            school=cls.basic_off, app_key='fees', is_enabled=False, note='Turned off by founder.',
        )

    def fees_row(self, school):
        return AppInstallation.objects.filter(school=school, app_key='fees').first()

    def test_backfill_gives_every_basic_school_fees(self):
        run_backfill()
        row = self.fees_row(self.basic)
        self.assertIsNotNone(row)
        self.assertTrue(row.is_enabled)
        self.assertTrue(registry_api.is_installed(self.basic, 'fees'))

    def test_backfill_never_reenables_what_was_turned_off(self):
        run_backfill()
        row = self.fees_row(self.basic_off)
        self.assertFalse(row.is_enabled)
        self.assertEqual(row.note, 'Turned off by founder.')
        self.assertEqual(AppInstallation.objects.filter(school=self.basic_off, app_key='fees').count(), 1)

    def test_backfill_leaves_secondary_and_higher_schools_alone(self):
        run_backfill()
        self.assertIsNone(self.fees_row(self.secondary))
        self.assertIsNone(self.fees_row(self.higher))
        self.assertEqual(AppInstallation.objects.filter(school__in=[self.secondary, self.higher]).count(), 0)

    def test_backfill_is_idempotent_and_adds_nothing_but_fees(self):
        run_backfill()
        before = list(AppInstallation.objects.order_by('id').values_list('id', 'school_id', 'app_key', 'is_enabled'))
        run_backfill()
        run_backfill()
        after = list(AppInstallation.objects.order_by('id').values_list('id', 'school_id', 'app_key', 'is_enabled'))
        self.assertEqual(before, after)
        self.assertEqual({k for _i, _s, k, _e in after}, {'fees'})

    def test_backfill_does_not_rewrite_an_existing_licence(self):
        from datetime import date

        school = make_school('FEE-LIC', 'basic')
        AppInstallation.objects.create(
            school=school, app_key='fees', is_enabled=True, licence_expiry=date(2030, 1, 1),
            allowed_roles=['BURSAR'],
        )
        run_backfill()
        row = self.fees_row(school)
        self.assertEqual(row.licence_expiry, date(2030, 1, 1))
        self.assertEqual(row.allowed_roles, ['BURSAR'])

    def test_new_basic_school_gets_fees_by_default_and_secondary_does_not(self):
        fresh_basic = make_school('FEE-NEW', 'basic')
        fresh_secondary = make_school('FEE-NEWS', 'secondary')
        registry_api.install_defaults(fresh_basic)
        registry_api.install_defaults(fresh_secondary)
        self.assertTrue(registry_api.is_installed(fresh_basic, 'fees'))
        self.assertFalse(registry_api.is_installed(fresh_secondary, 'fees'))

    def test_install_defaults_only_missing_does_not_reenable_fees(self):
        # The restore-from-drafts path calls install_defaults(only_missing=True).
        registry_api.install_defaults(self.basic_off, only_missing=True)
        self.assertFalse(self.fees_row(self.basic_off).is_enabled)
        registry_api.install_defaults(self.basic, only_missing=True)
        self.assertTrue(registry_api.is_installed(self.basic, 'fees'))

    def test_fees_route_owned_by_fees_app_and_open_to_admin_and_bursar(self):
        run_backfill()
        for role, matricule in (('SCHOOL_ADMIN', 'ADM-FEE-B'), ('BURSAR', 'BUR-FEE-B')):
            user = User.objects.create_user(
                matricule=matricule, name=role, email=f'{matricule.lower()}@example.org', role=role,
                school=self.basic, password='password123', is_license_paid=True,
            )
            self.client.force_authenticate(user)
            body = self.client.get(MY_APPS).data
            self.assertIn('/dashboard/fees', body['routes'], role)
            self.assertIn('/dashboard/fees', body['claimed_routes'])
            owners = [a['key'] for a in body['apps'] if '/dashboard/fees' in a['routes']]
            self.assertEqual(owners, ['fees'])
            self.assertTrue(registry_api.is_installed_for_user(user, 'fees'))

    def test_school_without_fees_is_refused_by_the_server(self):
        admin = User.objects.create_user(
            matricule='ADM-FEE-OFF', name='Head', email='adm-off@example.org', role='SCHOOL_ADMIN',
            school=self.basic_off, password='password123', is_license_paid=True,
        )
        self.client.force_authenticate(admin)
        response = self.client.get('/api/v1/fees/fee-structures/')
        self.assertEqual(response.status_code, 403)

"""Changes outside the proprietor endpoints: removed linking, role labels, sessions, migrations."""

import importlib
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import SimpleTestCase
from django.urls import NoReverseMatch, get_resolver, reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.authentication.jwt_auth import token_is_revoked
from apps.proprietors.tests.helpers import make_proprietor, make_school, make_user
from apps.users.role_labels import role_display


class LinkedAccountsRemovedTests(APITestCase):
    def test_the_module_and_its_routes_are_gone(self):
        with self.assertRaises(ImportError):
            importlib.import_module('apps.users.linked_accounts')
        for name in ('linked-schools', 'linked-schools-create-primary', 'linked-schools-link',
                     'linked-schools-switch', 'linked-schools-unlink'):
            with self.assertRaises(NoReverseMatch):
                reverse(f'users:{name}')

    def test_no_url_pattern_mentions_linked_schools_or_switching(self):
        def walk(patterns, prefix=''):
            for p in patterns:
                text = prefix + str(p.pattern)
                if hasattr(p, 'url_patterns'):
                    yield from walk(p.url_patterns, text)
                else:
                    yield text

        routes = list(walk(get_resolver().url_patterns))
        self.assertTrue(routes)
        offenders = [r for r in routes if 'linked-schools' in r or 'linked_schools' in r]
        self.assertEqual(offenders, [])

    def test_old_endpoints_do_not_resolve(self):
        from django.urls import Resolver404, resolve

        for sub in ('create-primary/', 'link/', 'switch/', 'unlink/'):
            with self.assertRaises(Resolver404):
                resolve(f'/api/v1/users/linked-schools/{sub}')
        # the bare path is now just the ordinary user-detail route with a bogus id
        self.assertEqual(resolve('/api/v1/users/linked-schools/').url_name, 'user-detail')

    def test_dormant_models_are_documented_as_unused(self):
        from apps.users import models

        for cls in (models.AccountLinkGroup, models.LinkedAccount, models.AccountLinkEvent):
            self.assertIn('DEPRECATED AND UNUSED', cls.__doc__)


class RoleDisplayTests(APITestCase):
    def test_school_admin_label_depends_on_education_category(self):
        secondary = make_school('SEC1', 'Sec', category='secondary')
        basic = make_school('BAS1', 'Bas', category='basic')
        higher = make_school('HIG1', 'Hig', category='higher')
        self.assertEqual(role_display(make_user('A1', 'SCHOOL_ADMIN', school=secondary)), 'Principal')
        self.assertEqual(role_display(make_user('A2', 'SCHOOL_ADMIN', school=basic)), 'Discipline Master')
        self.assertEqual(role_display(make_user('A3', 'SCHOOL_ADMIN', school=higher)), 'School Administrator')
        self.assertEqual(role_display(make_user('A4', 'SCHOOL_ADMIN')), 'School Administrator')
        self.assertEqual(role_display(make_user('A5', 'SUB_ADMIN', school=basic)), 'Sub Administrator')
        self.assertEqual(role_display(make_user('A6', 'TEACHER', school=basic)), 'Teacher')
        self.assertEqual(role_display(make_proprietor('P1')), 'Proprietor')

    def test_user_serializer_and_property_use_it(self):
        basic = make_school('BAS1', 'Bas', category='basic')
        admin = make_user('A2', 'SCHOOL_ADMIN', school=basic)
        self.assertEqual(admin.display_role, 'Discipline Master')
        self.client.force_authenticate(admin)
        response = self.client.get(f'/api/v1/users/{admin.pk}/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['display_role'], 'Discipline Master')
        self.assertEqual(response.json()['role'], 'SCHOOL_ADMIN')  # the stored key never changes


class SessionRevocationTests(APITestCase):
    def test_token_cutoff(self):
        user = make_user('U1', 'TEACHER')
        token = {'iat': 1000}
        self.assertFalse(token_is_revoked(token, user))  # null cutoff: nothing changes for anyone
        user.sessions_valid_after = timezone.now()
        self.assertTrue(token_is_revoked(token, user))
        self.assertTrue(token_is_revoked({}, user))  # no issue time: refused
        self.assertFalse(token_is_revoked({'iat': (timezone.now() + timedelta(seconds=5)).timestamp()}, user))

    def test_tokens_carry_iat_and_existing_users_keep_working(self):
        make_user('U2', 'TEACHER', password='Passw0rd!123')
        login = self.client.post('/api/v1/auth/login/', {'matricule': 'U2', 'password': 'Passw0rd!123'}, format='json')
        self.assertEqual(login.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + login.json()['access_token'])
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 200)
        from rest_framework_simplejwt.tokens import AccessToken

        self.assertIn('iat', AccessToken(login.json()['access_token']).payload)


class MigrationTests(SimpleTestCase):
    databases = {'default'}

    def test_no_pending_model_changes(self):
        out = StringIO()
        call_command('makemigrations', '--check', '--dry-run', stdout=out, stderr=out)

    def test_new_migrations_are_additive_only(self):
        from django.db import migrations

        from apps.proprietors.migrations import __path__ as prop_path  # noqa: F401

        destructive = (migrations.DeleteModel, migrations.RemoveField, migrations.RunSQL)
        for module_name in ('apps.proprietors.migrations.0001_initial',
                            'apps.users.migrations.0028_proprietor_role_and_session_cutoff'):
            module = importlib.import_module(module_name)
            for op in module.Migration.operations:
                self.assertNotIsInstance(op, destructive, (module_name, op))

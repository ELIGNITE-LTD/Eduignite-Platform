"""Linked school accounts: create a primary school, link, switch, isolation."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.schools.models import School
from apps.users.models import AccountLinkEvent, LinkedAccount

User = get_user_model()

BASE = '/api/v1/users/linked-schools/'


def _school(sid, name, category='secondary', **extra):
    return School.objects.create(
        id=sid, name=name, short_name=sid[:4], principal='P', location='Douala',
        email=f'{sid.lower()}@example.com', education_category=category,
        status='Active', **extra,
    )


def _admin(school, password='Secret-pass-1', role='SCHOOL_ADMIN', **extra):
    user = User.objects.create_user(
        matricule=school.matricule if role == 'SCHOOL_ADMIN' else f'{school.matricule}SA001',
        name=f'Admin {school.id}', email=f'admin-{school.id.lower()}@example.com',
        role=role, password=password, school=school, **extra,
    )
    return user


class LinkedAccountsBase(TestCase):
    def setUp(self):
        cache.clear()
        self.sec = _school('SEC1', 'Lycee Secondaire Un')
        self.owner = _admin(self.sec)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def create_primary(self, **overrides):
        payload = {
            'name': 'Ecole Primaire Test', 'location': 'Douala',
            'phone': '+237677000111', 'principal': 'Mme Owner',
        }
        payload.update(overrides)
        return self.client.post(BASE + 'create-primary/', payload, format='json')


class CreatePrimaryTests(LinkedAccountsBase):
    def test_creates_draft_basic_school_admin_and_link(self):
        res = self.create_primary()
        self.assertEqual(res.status_code, 201, res.data)
        school = School.objects.get(name='Ecole Primaire Test')
        self.assertEqual(school.education_category, 'basic')
        self.assertTrue(school.is_drafted)
        self.assertIsNone(school.draft_delete_after)
        admin = User.objects.get(school=school, role='SCHOOL_ADMIN')
        self.assertTrue(admin.is_drafted)
        self.assertFalse(admin.is_active)
        self.assertEqual(admin.matricule, school.matricule)
        self.assertEqual(res.data['credentials']['matricule'], school.matricule)
        self.assertTrue(admin.check_password(res.data['credentials']['temporary_password']))
        self.assertTrue(admin.must_change_password)
        self.assertEqual(
            LinkedAccount.objects.get(user=admin).group_id,
            LinkedAccount.objects.get(user=self.owner).group_id,
        )
        self.assertTrue(AccountLinkEvent.objects.filter(action='create', target=admin).exists())

    def test_matricule_unique_and_school_matricule_format(self):
        self.create_primary(name='Ecole Alpha Un')
        self.create_primary(name='Ecole Beta Deux')
        matricules = list(User.objects.filter(role='SCHOOL_ADMIN').values_list('matricule', flat=True))
        self.assertEqual(len(matricules), len(set(matricules)))
        for school in School.objects.exclude(id='SEC1'):
            self.assertRegex(school.matricule, r'^[A-Z0-9]{2,4}\d{2,}\d{2}$')

    def test_duplicate_name_is_refused_without_second_school(self):
        self.assertEqual(self.create_primary().status_code, 201)
        res = self.create_primary(name='ecole primaire test')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(School.objects.filter(name__iexact='ecole primaire test').count(), 1)

    def test_duplicate_email_refused(self):
        res = self.create_primary(email=self.owner.email)
        self.assertEqual(res.status_code, 409)

    def test_cannot_create_beyond_limit(self):
        from apps.users import linked_accounts

        linked_accounts.MAX_LINKED_SCHOOLS = 2
        try:
            self.assertEqual(self.create_primary().status_code, 201)
            self.assertEqual(self.create_primary(name='Another School Two').status_code, 400)
        finally:
            linked_accounts.MAX_LINKED_SCHOOLS = 10

    def test_secondary_school_untouched(self):
        self.create_primary()
        self.sec.refresh_from_db()
        self.assertEqual(self.sec.education_category, 'secondary')
        self.assertFalse(self.sec.is_drafted)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.school_id, 'SEC1')

    def test_invalid_phone_rejected(self):
        self.assertEqual(self.create_primary(phone='abc').status_code, 400)


class PermissionTests(LinkedAccountsBase):
    def test_other_roles_cannot_use_it(self):
        for role in ('SUB_ADMIN', 'TEACHER', 'BURSAR'):
            user = User.objects.create_user(
                matricule=f'{self.sec.matricule}{role[:2]}9', name='x', email=f'{role}@x.com',
                role=role, password='pw-12345678', school=self.sec,
            )
            client = APIClient()
            client.force_authenticate(user)
            self.assertEqual(client.get(BASE).status_code, 403, role)
            self.assertEqual(client.post(BASE + 'create-primary/', {}, format='json').status_code, 403, role)
            self.assertEqual(client.post(BASE + 'link/', {}, format='json').status_code, 403, role)
        self.assertEqual(School.objects.count(), 1)

    def test_anonymous_refused(self):
        self.assertIn(APIClient().get(BASE).status_code, (401, 403))


class LinkExistingTests(LinkedAccountsBase):
    def setUp(self):
        super().setUp()
        self.other_school = _school('PRI1', 'Ecole Primaire Existante', category='basic')
        self.other = _admin(self.other_school, password='Other-pass-1')

    def link(self, matricule=None, password='Other-pass-1'):
        return self.client.post(
            BASE + 'link/',
            {'matricule': matricule or self.other.matricule, 'password': password},
            format='json',
        )

    def test_link_with_correct_credentials(self):
        res = self.link()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(res.data['accounts']), 2)
        self.assertTrue(AccountLinkEvent.objects.filter(action='link', target=self.other).exists())

    def test_wrong_password_and_unknown_matricule_same_generic_error(self):
        wrong = self.link(password='nope')
        unknown = self.link(matricule='NOSUCH9999')
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(wrong.data, unknown.data)
        self.assertFalse(LinkedAccount.objects.filter(user=self.other).exists())

    def test_lockout_after_repeated_failures(self):
        for _ in range(5):
            self.assertEqual(self.link(password='bad').status_code, 400)
        res = self.link()  # even the right password is refused during lockout
        self.assertEqual(res.status_code, 429)
        self.assertFalse(LinkedAccount.objects.filter(user=self.other).exists())

    def test_cannot_link_other_role_or_drafted_or_inactive(self):
        teacher = User.objects.create_user(
            matricule='TCHX1', name='t', email='t@x.com', role='TEACHER',
            password='Other-pass-1', school=self.other_school,
        )
        self.assertEqual(self.link(matricule=teacher.matricule).status_code, 400)
        self.other.is_drafted = True
        self.other.save(update_fields=['is_drafted'])
        self.assertEqual(self.link().status_code, 400)
        self.other.is_drafted = False
        self.other.is_active = False
        self.other.save(update_fields=['is_drafted', 'is_active'])
        self.assertEqual(self.link().status_code, 400)

    def test_pending_activation_marker_is_not_a_password(self):
        self.other.set_password('!pending_activation')
        self.other.save(update_fields=['password'])
        self.assertEqual(self.link(password='!pending_activation').status_code, 400)

    def test_cannot_absorb_account_already_in_another_group(self):
        third_school = _school('THI1', 'Troisieme Ecole')
        third = _admin(third_school)
        third_client = APIClient()
        third_client.force_authenticate(third)
        r = third_client.post(
            BASE + 'link/', {'matricule': self.other.matricule, 'password': 'Other-pass-1'}, format='json'
        )
        self.assertEqual(r.status_code, 201)
        res = self.link()
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], 'We could not link this account. Check the matricule and password and try again.')


class SwitchTests(LinkedAccountsBase):
    def setUp(self):
        super().setUp()
        self.other_school = _school('PRI1', 'Ecole Primaire Existante', category='basic')
        self.other = _admin(self.other_school, password='Other-pass-1')
        self.client.post(
            BASE + 'link/', {'matricule': self.other.matricule, 'password': 'Other-pass-1'}, format='json'
        )

    def switch(self, account_id, client=None):
        return (client or self.client).post(BASE + 'switch/', {'account_id': str(account_id)}, format='json')

    def test_switch_within_group_returns_login_shape_for_target(self):
        res = self.switch(self.other.id)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(set(res.data), {'access_token', 'refresh_token', 'user'})
        self.assertEqual(res.data['user']['matricule'], self.other.matricule)
        self.assertEqual(res.data['user']['school']['id'], 'PRI1')
        self.assertTrue(AccountLinkEvent.objects.filter(action='switch', target=self.other).exists())

    def test_token_acts_as_target_only_no_data_leak(self):
        res = self.switch(self.other.id)
        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access_token']}")
        me = fresh.get('/api/v1/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertIn(self.other.matricule, str(me.data))
        self.assertNotIn(self.owner.matricule, str(me.data.get('matricule', '')))
        schools = fresh.get('/api/v1/schools/schools/')
        body = schools.content.decode()
        self.assertIn('PRI1', body)
        self.assertNotIn('SEC1', body)

    def test_switch_back_without_password(self):
        res = self.switch(self.other.id)
        other_client = APIClient()
        other_client.force_authenticate(self.other)
        back = self.switch(self.owner.id, client=other_client)
        self.assertEqual(back.status_code, 200)
        self.assertEqual(back.data['user']['school']['id'], 'SEC1')
        self.assertIn('access_token', res.data)

    def test_switch_to_unlinked_account_denied(self):
        stranger_school = _school('STR1', 'Stranger School')
        stranger = _admin(stranger_school)
        self.assertEqual(self.switch(stranger.id).status_code, 403)

    def test_switch_to_account_in_other_group_denied(self):
        a_school = _school('GRA1', 'Group A School')
        b_school = _school('GRB1', 'Group B School')
        a, b = _admin(a_school), _admin(b_school)
        ca = APIClient(); ca.force_authenticate(a)
        ca.post(BASE + 'link/', {'matricule': b.matricule, 'password': 'Secret-pass-1'}, format='json')
        # self.owner is in a different group from a and b
        self.assertEqual(self.switch(b.id).status_code, 403)

    def test_switch_to_non_admin_member_denied(self):
        teacher = User.objects.create_user(
            matricule='TCHZ1', name='t', email='tz@x.com', role='TEACHER',
            password='pw-12345678', school=self.sec,
        )
        LinkedAccount.objects.create(group=self.owner.account_link.group, user=teacher)
        self.assertEqual(self.switch(teacher.id).status_code, 403)

    def test_drafted_school_not_switchable(self):
        self.create = self.client.post(
            BASE + 'create-primary/',
            {'name': 'Ecole Brouillon', 'location': 'X', 'phone': '677000111', 'principal': 'Me'},
            format='json',
        )
        draft_admin = User.objects.get(school__name='Ecole Brouillon', role='SCHOOL_ADMIN')
        res = self.switch(draft_admin.id)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['code'], 'pending_activation')
        self.assertNotIn('access_token', res.data)
        listing = self.client.get(BASE).data['accounts']
        pending = [a for a in listing if a['account_id'] == str(draft_admin.id)][0]
        self.assertEqual(pending['status'], 'pending_activation')
        self.assertFalse(pending['can_switch'])

    def test_suspended_and_inactive_not_switchable(self):
        self.other.is_suspended = True
        self.other.save(update_fields=['is_suspended'])
        self.assertEqual(self.switch(self.other.id).status_code, 403)
        self.other.is_suspended = False
        self.other.is_active = False
        self.other.save(update_fields=['is_suspended', 'is_active'])
        self.assertEqual(self.switch(self.other.id).status_code, 403)

    def test_switch_after_activation_works(self):
        self.client.post(
            BASE + 'create-primary/',
            {'name': 'Ecole Activee', 'location': 'X', 'phone': '677000111', 'principal': 'Me'},
            format='json',
        )
        school = School.objects.get(name='Ecole Activee')
        admin = User.objects.get(school=school, role='SCHOOL_ADMIN')
        # EduIgnite activates through the existing restore flow semantics.
        School.objects.filter(pk=school.pk).update(is_drafted=False, status='Active')
        User.objects.filter(pk=admin.pk).update(is_drafted=False, is_active=True)
        self.assertEqual(self.switch(admin.id).status_code, 200)

    def test_listing_marks_current_and_categories(self):
        accounts = self.client.get(BASE).data['accounts']
        self.assertEqual(len(accounts), 2)
        current = [a for a in accounts if a['is_current']]
        self.assertEqual(len(current), 1)
        self.assertEqual(current[0]['school_id'], 'SEC1')
        self.assertEqual({a['education_category'] for a in accounts}, {'secondary', 'basic'})

    def test_unlink_then_switch_denied(self):
        res = self.client.post(BASE + 'unlink/', {'account_id': str(self.other.id)}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.switch(self.other.id).status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.other.pk).exists())


class CreatePrimaryAppsTests(LinkedAccountsBase):
    def test_new_primary_school_gets_default_apps_once(self):
        from apps.registry.models import AppInstallation

        self.assertEqual(self.create_primary().status_code, 201)
        school = School.objects.get(name='Ecole Primaire Test')
        keys = set(AppInstallation.objects.filter(school=school, is_enabled=True).values_list('app_key', flat=True))
        for needed in ('grades', 'attendance', 'announcements', 'fees'):
            self.assertIn(needed, keys)

    def test_install_defaults_is_idempotent_and_respects_disabled_apps(self):
        from apps.registry import api as registry_api
        from apps.registry.models import AppInstallation

        self.create_primary()
        school = School.objects.get(name='Ecole Primaire Test')
        before = AppInstallation.objects.filter(school=school).count()
        registry_api.uninstall(school, 'announcements', notify=False)
        self.assertEqual(registry_api.install_defaults(school, only_missing=True), 0)
        self.assertEqual(AppInstallation.objects.filter(school=school).count(), before)
        self.assertFalse(AppInstallation.objects.get(school=school, app_key='announcements').is_enabled)

    def test_restore_installs_apps_for_school_without_any(self):
        from apps.registry.models import AppInstallation

        self.create_primary()
        school = School.objects.get(name='Ecole Primaire Test')
        AppInstallation.objects.filter(school=school).delete()
        ceo = User.objects.create_user(
            matricule='LNK-CEO', name='CEO', email='lnkceo@example.org', role='CEO',
            password='Passw0rd!123', is_license_paid=True,
        )
        self.client.force_authenticate(ceo)
        res = self.client.post(f'/api/v1/schools/schools/{school.id}/restore/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(AppInstallation.objects.filter(school=school, app_key='grades', is_enabled=True).exists())
        self.assertTrue(AppInstallation.objects.filter(school=school, app_key='fees', is_enabled=True).exists())
        self.client.post(f'/api/v1/schools/schools/{school.id}/restore/')
        self.assertEqual(AppInstallation.objects.filter(school=school, app_key='grades').count(), 1)

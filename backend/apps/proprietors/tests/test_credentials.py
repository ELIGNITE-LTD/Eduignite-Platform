"""Credential reset by a proprietor: re-authentication, scope, revocation, audit."""

import time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase

from apps.proprietors.models import ProprietorActionLog
from apps.proprietors.tests.helpers import SEND, make_proprietor, make_school, make_user

User = get_user_model()
OWN_PASSWORD = 'Own-Passw0rd!77'
NEW_PASSWORD = 'Brand-New#Pass42'


def url(school_id, user_id):
    return f'/api/v1/proprietor/schools/{school_id}/admins/{user_id}/credentials/'


class CredentialResetTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.mine = make_school('MIN1', 'Mine College', category='secondary')
        cls.basic = make_school('MIN2', 'Mine Primary', category='basic')
        cls.foreign = make_school('FOR1', 'Foreign College', category='secondary')
        cls.prop = make_proprietor('EDUPRO2601', [cls.mine, cls.basic], password=OWN_PASSWORD)
        cls.other_prop = make_proprietor('EDUPRO2602', [cls.foreign], password=OWN_PASSWORD)
        cls.admin = make_user('MIN126', 'SCHOOL_ADMIN', school=cls.mine, email='head@gmail.com', password='Old-Passw0rd!1')
        cls.sub = make_user('MIN126SA001', 'SUB_ADMIN', school=cls.mine)
        cls.basic_admin = make_user('MIN226', 'SCHOOL_ADMIN', school=cls.basic)
        cls.foreign_admin = make_user('FOR126', 'SCHOOL_ADMIN', school=cls.foreign)

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.prop)

    def body(self, **over):
        data = {'matricule': self.prop.matricule, 'password': OWN_PASSWORD, 'new_password': NEW_PASSWORD}
        data.update(over)
        return data

    def post(self, school, target, **over):
        return self.client.post(url(school.pk, target.pk), self.body(**over), format='json')

    def unchanged(self, user):
        fresh = User.objects.get(pk=user.pk)
        return (fresh.password, fresh.email, fresh.phone, fresh.is_active, fresh.matricule, fresh.must_change_password,
                fresh.sessions_valid_after) == (user.password, user.email, user.phone, user.is_active, user.matricule,
                                                user.must_change_password, user.sessions_valid_after)

    # -- success -------------------------------------------------------------

    @patch(SEND, return_value=True)
    def test_success_changes_password_audits_and_emails_without_the_password(self, send):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post(self.mine, self.admin)
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertEqual(data['changed'], ['password'])
        self.assertTrue(data['sessions_revoked'])
        self.assertNotIn(NEW_PASSWORD, response.content.decode())
        self.assertNotIn(OWN_PASSWORD, response.content.decode())
        admin = User.objects.get(pk=self.admin.pk)
        self.assertTrue(admin.check_password(NEW_PASSWORD))
        self.assertFalse(admin.check_password('Old-Passw0rd!1'))
        self.assertTrue(admin.must_change_password)  # default
        self.assertEqual(admin.matricule, 'MIN126')
        # audit
        log = ProprietorActionLog.objects.get(action=ProprietorActionLog.ACTION_CREDENTIALS_RESET)
        self.assertEqual((log.actor, log.proprietor, log.school, log.target_user), (self.prop, self.prop, self.mine, admin))
        self.assertNotIn(NEW_PASSWORD, log.detail)
        self.assertNotIn(OWN_PASSWORD, log.detail)
        # notification: informational, no password
        self.assertEqual([c.kwargs['to_email'] for c in send.call_args_list], ['head@gmail.com'])
        mail = send.call_args.kwargs
        self.assertIn('MIN126', mail['text'])
        for blob in (mail['text'], mail['html']):
            self.assertNotIn(NEW_PASSWORD, blob)
            self.assertNotIn(OWN_PASSWORD, blob)

    @patch(SEND, return_value=True)
    def test_email_phone_active_and_keep_password_flag(self, send):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post(self.mine, self.admin, email='newhead@gmail.com', phone='+237670000123',
                                 is_active=False, require_password_change=False)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(sorted(response.json()['changed']), ['deactivated', 'email', 'password', 'phone'])
        admin = User.objects.get(pk=self.admin.pk)
        self.assertEqual((admin.email, admin.phone, admin.is_active, admin.must_change_password),
                         ('newhead@gmail.com', '+237670000123', False, False))
        # both the new and the OLD address are told (so a hijack is noticed)
        self.assertEqual(sorted(c.kwargs['to_email'] for c in send.call_args_list), ['head@gmail.com', 'newhead@gmail.com'])

    @patch(SEND, return_value=True)
    def test_sub_admin_of_a_linked_school_and_basic_school_admin_work(self, send):
        self.assertEqual(self.post(self.mine, self.sub).status_code, 200)
        self.assertEqual(self.post(self.basic, self.basic_admin).status_code, 200)

    # -- sessions ------------------------------------------------------------

    def test_old_sessions_die_and_new_password_signs_in(self):
        anon = APIClient()
        login = anon.post('/api/v1/auth/login/', {'matricule': 'MIN126', 'password': 'Old-Passw0rd!1'}, format='json')
        self.assertEqual(login.status_code, 200, login.content)
        access, refresh = login.json()['access_token'], login.json()['refresh_token']
        anon.credentials(HTTP_AUTHORIZATION='Bearer ' + access)
        self.assertEqual(anon.get('/api/v1/auth/me/').status_code, 200)

        self.assertEqual(self.post(self.mine, self.admin).status_code, 200)

        self.assertEqual(anon.get('/api/v1/auth/me/').status_code, 401)  # access token revoked
        anon.credentials()
        self.assertEqual(anon.post('/api/v1/auth/refresh/', {'refresh': refresh}, format='json').status_code, 401)
        self.assertEqual(anon.post('/api/v1/auth/login/', {'matricule': 'MIN126', 'password': 'Old-Passw0rd!1'},
                                   format='json').status_code, 401)
        time.sleep(1.2)  # a token minted within the same second as the reset is refused (fails closed)
        fresh = anon.post('/api/v1/auth/login/', {'matricule': 'MIN126', 'password': NEW_PASSWORD}, format='json')
        self.assertEqual(fresh.status_code, 200, fresh.content)
        self.assertTrue(fresh.json()['user']['must_change_password'])
        anon.credentials(HTTP_AUTHORIZATION='Bearer ' + fresh.json()['access_token'])
        self.assertEqual(anon.get('/api/v1/auth/me/').status_code, 200)

    # -- own-credential check ----------------------------------------------------

    def test_wrong_own_password_or_matricule_gets_one_generic_failure(self):
        wrong_pw = self.post(self.mine, self.admin, password='Not-My-Passw0rd!')
        wrong_mat = self.post(self.mine, self.admin, matricule='EDUPRO9999')
        someone_elses = self.post(self.mine, self.admin, matricule='EDUPRO2602', password=OWN_PASSWORD)
        for response in (wrong_pw, wrong_mat, someone_elses):
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json()['code'], 'reauth_failed')
        self.assertEqual(wrong_pw.json()['message'], wrong_mat.json()['message'])
        self.assertTrue(self.unchanged(self.admin))
        self.assertEqual(ProprietorActionLog.objects.filter(action=ProprietorActionLog.ACTION_REAUTH_FAILED).count(), 3)
        self.assertEqual(ProprietorActionLog.objects.filter(action=ProprietorActionLog.ACTION_CREDENTIALS_RESET).count(), 0)

    def test_reauth_is_checked_before_scope_so_probing_reveals_nothing(self):
        wrong = self.post(self.foreign, self.foreign_admin, password='nope-nope-nope')
        self.assertEqual((wrong.status_code, wrong.json()['code']), (403, 'reauth_failed'))

    def test_lockout_after_repeated_failures_even_with_the_right_password(self):
        for _ in range(5):
            self.assertEqual(self.post(self.mine, self.admin, password='wrong-wrong-1').status_code, 403)
        locked = self.post(self.mine, self.admin)  # now correct
        self.assertEqual(locked.status_code, 429)
        self.assertEqual(locked.json()['code'], 'reauth_locked')
        self.assertTrue(self.unchanged(self.admin))
        self.assertTrue(ProprietorActionLog.objects.filter(action=ProprietorActionLog.ACTION_LOCKED_OUT).exists())
        # another proprietor is not affected
        self.client.force_authenticate(self.other_prop)
        ok = self.client.post(url(self.foreign.pk, self.foreign_admin.pk), {
            'matricule': 'EDUPRO2602', 'password': OWN_PASSWORD, 'new_password': NEW_PASSWORD}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)

    def test_lockout_expires_with_the_window(self):
        from datetime import timedelta
        from django.utils import timezone

        for _ in range(5):
            self.post(self.mine, self.admin, password='wrong-wrong-1')
        ProprietorActionLog.objects.update(created_at=timezone.now() - timedelta(minutes=16))
        self.assertEqual(self.post(self.mine, self.admin).status_code, 200)

    def test_ip_lockout_across_accounts(self):
        for i in range(20):
            ProprietorActionLog.objects.create(
                action=ProprietorActionLog.ACTION_REAUTH_FAILED, actor=self.other_prop, proprietor=self.other_prop,
                ip_address='203.0.113.9')
        response = self.client.post(url(self.mine.pk, self.admin.pk), self.body(), format='json',
                                    REMOTE_ADDR='203.0.113.9')
        self.assertEqual(response.status_code, 429)

    def test_the_pending_activation_marker_is_never_a_password(self):
        User.objects.filter(pk=self.prop.pk).update(password='!pending_activation')  # unusable-ish
        response = self.post(self.mine, self.admin, password='!pending_activation')
        self.assertEqual(response.status_code, 403)

    # -- scope ---------------------------------------------------------------

    def test_cannot_target_an_unlinked_school(self):
        for response in (self.post(self.foreign, self.foreign_admin), self.post(self.mine, self.foreign_admin)):
            self.assertEqual(response.status_code, 404)
        self.assertTrue(self.unchanged(self.foreign_admin))
        self.assertEqual(self.post(self.foreign, self.foreign_admin).json()['code'], 'not_found')

    def test_cannot_target_non_admins_executives_or_other_proprietors(self):
        teacher = make_user('T1', 'TEACHER', school=self.mine)
        bursar = make_user('B1', 'BURSAR', school=self.mine)
        student = make_user('S1', 'STUDENT', school=self.mine)
        parent = make_user('P1', 'PARENT', school=self.mine)
        ceo = make_user('CEO9', 'CEO', school=self.mine)
        coo = make_user('COO9', 'COO', school=self.mine)
        twin = make_user('TWIN1', 'TEACHER', school=self.mine, is_teacher_twin=True)
        drafted = make_user('DRAFT1', 'SCHOOL_ADMIN', school=self.mine, is_drafted=True)
        for victim in (teacher, bursar, student, parent, ceo, coo, twin, drafted, self.other_prop, self.prop):
            cache.clear()  # the endpoint is rate limited
            response = self.post(self.mine, victim)
            self.assertEqual(response.status_code, 404, victim.role)
            self.assertTrue(self.unchanged(victim), victim.role)
        # an admin of ANOTHER linked school under the wrong school path
        self.assertEqual(self.post(self.basic, self.admin).status_code, 404)
        self.assertEqual(self.client.post(url(self.mine.pk, 'not-a-uuid'), self.body(), format='json').status_code, 404)

    def test_matricule_role_and_school_cannot_be_changed(self):
        extra = {'target_matricule': 'HACKED', 'role': 'CEO', 'school': 'FOR1', 'matricule_new': 'X'}
        response = self.client.post(url(self.mine.pk, self.admin.pk), self.body(**extra), format='json')
        # the body's `matricule` is the proprietor's own; extra keys are ignored
        self.assertEqual(response.status_code, 200)
        admin = User.objects.get(pk=self.admin.pk)
        self.assertEqual((admin.matricule, admin.role, admin.school_id), ('MIN126', 'SCHOOL_ADMIN', 'MIN1'))

    # -- validation ----------------------------------------------------------

    def test_password_validators_enforced_and_failures_do_not_count_as_lockout(self):
        for weak in ('short', 'password', '12345678', 'MIN126'):
            response = self.post(self.mine, self.admin, new_password=weak)
            self.assertEqual(response.status_code, 400, weak)
            self.assertIn('new_password', response.json()['errors'])
        self.assertTrue(self.unchanged(self.admin))
        self.assertEqual(ProprietorActionLog.objects.filter(action=ProprietorActionLog.ACTION_REAUTH_FAILED).count(), 0)

    def test_email_already_used_or_invalid_and_missing_fields(self):
        self.assertEqual(self.post(self.mine, self.admin, email=self.sub.email).status_code, 400)
        self.assertEqual(self.post(self.mine, self.admin, email='not-an-email').status_code, 400)
        self.assertEqual(self.post(self.mine, self.admin, phone='abc').status_code, 400)
        incomplete = self.client.post(url(self.mine.pk, self.admin.pk), {'new_password': NEW_PASSWORD}, format='json')
        self.assertEqual(incomplete.status_code, 400)
        self.assertTrue(self.unchanged(self.admin))

    # -- who may call --------------------------------------------------------

    def test_only_proprietors_may_call_it(self):
        for user in (self.admin, self.sub, make_user('CEO8', 'CEO'), make_user('TCH8', 'TEACHER', school=self.mine)):
            self.client.force_authenticate(user)
            self.assertEqual(self.post(self.mine, self.admin).status_code, 403, user.role)
        self.client.force_authenticate(None)
        self.assertEqual(self.post(self.mine, self.admin).status_code, 401)
        self.assertTrue(self.unchanged(self.admin))

    def test_a_deactivated_proprietor_is_refused(self):
        User.objects.filter(pk=self.prop.pk).update(is_active=False)
        self.client.force_authenticate(User.objects.get(pk=self.prop.pk))
        self.assertEqual(self.post(self.mine, self.admin).status_code, 403)

    def test_a_proprietor_who_still_has_the_temporary_password_is_refused(self):
        User.objects.filter(pk=self.prop.pk).update(must_change_password=True)
        self.client.force_authenticate(User.objects.get(pk=self.prop.pk))
        self.assertEqual(self.post(self.mine, self.admin).status_code, 403)

    def test_rate_limit(self):
        statuses = {self.post(self.mine, self.admin, password='wrong-wrong-1').status_code for _ in range(12)}
        self.assertTrue(statuses & {403, 429})
        self.assertIn(429, statuses)

    @patch(SEND, side_effect=RuntimeError('mail down'))
    def test_email_failure_never_breaks_the_reset(self, send):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post(self.mine, self.admin)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.get(pk=self.admin.pk).check_password(NEW_PASSWORD))

    @patch(SEND, return_value=True)
    def test_notification_is_sent_once_per_audit_row(self, send):
        from apps.orders.notifications import send_admin_credentials_changed

        with self.captureOnCommitCallbacks(execute=True):
            self.post(self.mine, self.admin)
        log = ProprietorActionLog.objects.get(action=ProprietorActionLog.ACTION_CREDENTIALS_RESET)
        send_admin_credentials_changed(log.pk, ['head@gmail.com'])  # a retry
        self.assertEqual(send.call_count, 1)

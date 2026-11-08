"""Founder side: who may manage proprietors, create / link / replace / unlink."""

from unittest.mock import patch

from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.proprietors.models import ProprietorActionLog, ProprietorSchoolLink
from apps.proprietors.tests.helpers import SEND, make_proprietor, make_school, make_user

BASE = '/api/v1/users/proprietors/'


class FounderAccessTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.school = make_school('AAA1', 'Alpha School')

    def test_only_ceo_and_cto_may_use_the_founder_endpoints(self):
        for role, expected in (('CEO', 200), ('CTO', 200)):
            self.client.force_authenticate(make_user(f'{role}01', role))
            self.assertEqual(self.client.get(BASE).status_code, expected, role)
        refused = [
            make_user('COO01', 'COO', allowed_modules=['schools']),  # the schools module alone is not enough
            make_user('SUP01', 'SUPER_ADMIN', allowed_modules=['schools']),
            make_user('ADM01', 'SCHOOL_ADMIN', school=self.school),
            make_user('TCH01', 'TEACHER', school=self.school),
            make_proprietor('PRP01'),
        ]
        for user in refused:
            self.client.force_authenticate(user)
            for method, url in (('get', BASE), ('post', BASE), ('get', BASE + 'schools/')):
                response = getattr(self.client, method)(url, {'name': 'x', 'email': 'x@y.org'}, format='json')
                self.assertEqual(response.status_code, 403, (user.role, method, url))
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(BASE).status_code, 401)

    def test_proprietor_cannot_change_his_own_links(self):
        prop = make_proprietor('PRP02')
        self.client.force_authenticate(prop)
        response = self.client.put(f'{BASE}{prop.pk}/schools/', {'school_ids': ['AAA1']}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(ProprietorSchoolLink.objects.exists())


class CreateProprietorTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.ceo = make_user('CEO01', 'CEO')
        self.client.force_authenticate(self.ceo)

    @patch(SEND, return_value=True)
    def test_create_returns_one_time_password_and_emails_without_it(self, send):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(BASE, {'name': 'Mr Ndi', 'email': 'ndi@gmail.com', 'phone': '+237670000000'},
                                        format='json')
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        creds = body['credentials']
        self.assertTrue(creds['matricule'].startswith('EDUPRO'), creds['matricule'])
        self.assertTrue(creds['must_change_password'])
        user = type(self.ceo).objects.get(matricule=creds['matricule'])
        self.assertEqual(user.role, 'PROPRIETOR')
        self.assertIsNone(user.school_id)
        self.assertTrue(user.must_change_password)
        self.assertTrue(user.check_password(creds['temporary_password']))
        self.assertNotIn(creds['temporary_password'], str(user.password))
        self.assertEqual(body['proprietor']['schools'], [])
        # The welcome email goes out once, with the matricule and NO password.
        self.assertEqual(send.call_count, 1)
        mail = send.call_args.kwargs
        self.assertEqual(mail['to_email'], 'ndi@gmail.com')
        self.assertIn(creds['matricule'], mail['text'])
        self.assertNotIn(creds['temporary_password'], mail['text'])
        self.assertNotIn(creds['temporary_password'], mail['html'])
        log = ProprietorActionLog.objects.get(action=ProprietorActionLog.ACTION_CREATED)
        self.assertEqual(log.actor, self.ceo)
        self.assertNotIn(creds['temporary_password'], log.detail)

    @patch(SEND, return_value=True)
    def test_temporary_password_signs_in_but_is_useless_until_changed(self, send):
        response = self.client.post(BASE, {'name': 'Mr Ndi', 'email': 'ndi@gmail.com'}, format='json')
        creds = response.json()['credentials']
        self.client.force_authenticate(None)
        login = self.client.post('/api/v1/auth/login/', {
            'matricule': creds['matricule'], 'password': creds['temporary_password']}, format='json')
        self.assertEqual(login.status_code, 200, login.content)
        self.assertTrue(login.json()['user']['must_change_password'])
        self.assertEqual(login.json()['user']['role'], 'PROPRIETOR')
        # The proprietor API refuses the temporary password until it is replaced.
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + login.json()['access_token'])
        self.assertEqual(self.client.get('/api/v1/proprietor/overview/').status_code, 403)

    def test_duplicate_email_and_bad_input_rejected(self):
        make_user('X01', 'TEACHER', email='taken@gmail.com')
        response = self.client.post(BASE, {'name': 'A', 'email': 'TAKEN@gmail.com'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.json()['errors'])
        self.assertEqual(self.client.post(BASE, {'name': 'A', 'email': 'nope'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(BASE, {'name': 'A', 'email': 'a@b.org', 'phone': 'abc'}, format='json')
                         .status_code, 400)

    def test_generic_user_endpoints_cannot_mint_or_promote_a_proprietor(self):
        school = make_school('AAA1', 'Alpha School')
        response = self.client.post('/api/v1/users/', {
            'name': 'Sneaky', 'email': 'sneaky@gmail.com', 'role': 'PROPRIETOR', 'school': school.pk,
        }, format='json')
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(type(self.ceo).objects.filter(role='PROPRIETOR').exists())

    def test_matricules_are_sequential_in_the_existing_founder_format(self):
        first = self.client.post(BASE, {'name': 'A', 'email': 'a@gmail.com'}, format='json').json()
        second = self.client.post(BASE, {'name': 'B', 'email': 'b@gmail.com'}, format='json').json()
        a, b = first['credentials']['matricule'], second['credentials']['matricule']
        yy = timezone.now().strftime('%y')
        self.assertEqual(a, f'EDUPRO{yy}01')
        self.assertEqual(b, f'EDUPRO{yy}02')


class LinkSchoolsTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.ceo = make_user('CEO01', 'CEO')
        self.client.force_authenticate(self.ceo)
        self.a = make_school('AAA1', 'Alpha Nursery', category='basic')
        self.b = make_school('BBB1', 'Beta College', category='secondary')
        self.c = make_school('CCC1', 'Gamma Institute', category='higher')
        self.prop = make_proprietor('PRP01')
        self.url = f'{BASE}{self.prop.pk}/schools/'

    def ids(self, response):
        return sorted(s['id'] for s in response.json()['schools'])

    def test_replace_is_atomic_idempotent_and_spans_all_categories(self):
        first = self.client.put(self.url, {'school_ids': ['AAA1', 'BBB1', 'CCC1']}, format='json')
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(self.ids(first), ['AAA1', 'BBB1', 'CCC1'])
        self.assertEqual(first.json()['added'], ['AAA1', 'BBB1', 'CCC1'])
        again = self.client.put(self.url, {'school_ids': ['CCC1', 'AAA1', 'BBB1', 'AAA1']}, format='json')
        self.assertEqual((again.json()['added'], again.json()['removed']), ([], []))
        swap = self.client.put(self.url, {'school_ids': ['BBB1']}, format='json')
        self.assertEqual(self.ids(swap), ['BBB1'])
        self.assertEqual(swap.json()['removed'], ['AAA1', 'CCC1'])
        self.assertEqual(ProprietorSchoolLink.objects.filter(proprietor=self.prop).count(), 1)
        cleared = self.client.put(self.url, {'school_ids': []}, format='json')
        self.assertEqual(cleared.json()['schools'], [])
        self.assertFalse(ProprietorSchoolLink.objects.exists())
        self.assertEqual(
            ProprietorActionLog.objects.filter(action=ProprietorActionLog.ACTION_SCHOOLS_SET).count(), 3)

    def test_unknown_or_drafted_school_rejects_everything(self):
        self.client.put(self.url, {'school_ids': ['AAA1']}, format='json')
        drafted = make_school('DDD1', 'Drafted School', is_drafted=True, drafted_at=timezone.now())
        for bad in (['BBB1', 'NOPE'], ['BBB1', drafted.pk]):
            response = self.client.put(self.url, {'school_ids': bad}, format='json')
            self.assertEqual(response.status_code, 400, bad)
            self.assertIn('school_ids', response.json()['errors'])
        links = ProprietorSchoolLink.objects.filter(proprietor=self.prop)
        self.assertEqual(sorted(links.values_list('school_id', flat=True)), ['AAA1'])  # unchanged

    def test_bad_payload(self):
        self.assertEqual(self.client.put(self.url, {}, format='json').status_code, 400)
        self.assertEqual(self.client.put(self.url, {'school_ids': 'AAA1'}, format='json').status_code, 400)

    def test_a_school_can_have_several_proprietors(self):
        other = make_proprietor('PRP02')
        self.client.put(self.url, {'school_ids': ['AAA1']}, format='json')
        self.client.put(f'{BASE}{other.pk}/schools/', {'school_ids': ['AAA1']}, format='json')
        self.assertEqual(ProprietorSchoolLink.objects.filter(school=self.a).count(), 2)
        self.client.put(self.url, {'school_ids': []}, format='json')
        self.assertEqual(ProprietorSchoolLink.objects.filter(school=self.a).count(), 1)  # the co-owner keeps it

    def test_linking_a_non_proprietor_user_is_not_possible(self):
        teacher = make_user('TCH01', 'TEACHER', school=self.a)
        self.assertEqual(
            self.client.put(f'{BASE}{teacher.pk}/schools/', {'school_ids': ['AAA1']}, format='json').status_code, 404)

    def test_list_and_detail_show_linked_schools_and_filters(self):
        self.client.put(self.url, {'school_ids': ['AAA1', 'CCC1']}, format='json')
        listing = self.client.get(BASE).json()
        self.assertEqual(listing['count'], 1)
        self.assertEqual(listing['results'][0]['school_count'], 2)
        self.assertEqual(sorted(s['id'] for s in listing['results'][0]['schools']), ['AAA1', 'CCC1'])
        self.assertEqual(self.client.get(f'{BASE}{self.prop.pk}/').json()['matricule'], self.prop.matricule)
        self.assertEqual(self.client.get(BASE + '?q=nomatch').json()['count'], 0)

    def test_school_choices_use_executive_filters_and_flag_linked(self):
        self.client.put(self.url, {'school_ids': ['BBB1']}, format='json')
        make_school('DDD1', 'Drafted School', is_drafted=True, drafted_at=timezone.now())
        everything = self.client.get(BASE + 'schools/').json()
        self.assertEqual(sorted(r['id'] for r in everything['results']), ['AAA1', 'BBB1', 'CCC1'])
        self.assertTrue(all(r['linked'] is False for r in everything['results']))
        secondary = self.client.get(BASE + f'schools/?education_category=secondary&proprietor={self.prop.pk}').json()
        self.assertEqual([r['id'] for r in secondary['results']], ['BBB1'])
        self.assertTrue(secondary['results'][0]['linked'])
        self.assertEqual(secondary['results'][0]['proprietor_count'], 1)
        sample = everything['results'][0]
        for key in ('education_category', 'school_type', 'subsystem', 'status', 'name', 'location'):
            self.assertIn(key, sample)


class LifecycleTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.cto = make_user('CTO01', 'CTO')
        self.client.force_authenticate(self.cto)
        self.prop = make_proprietor('PRP01', password='Sup3rSecret!pass', must_change_password=False)

    def test_update_name_email_phone(self):
        response = self.client.patch(f'{BASE}{self.prop.pk}/', {
            'name': 'New Name', 'email': 'new@gmail.com', 'phone': '+237670000009'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.prop.refresh_from_db()
        self.assertEqual((self.prop.name, self.prop.email, self.prop.phone), ('New Name', 'new@gmail.com', '+237670000009'))
        clash = self.client.patch(f'{BASE}{self.prop.pk}/', {'email': self.cto.email}, format='json')
        self.assertEqual(clash.status_code, 400)

    def test_deactivate_blocks_login_and_kills_existing_sessions(self):
        self.client.force_authenticate(None)
        login = self.client.post('/api/v1/auth/login/', {
            'matricule': self.prop.matricule, 'password': 'Sup3rSecret!pass'}, format='json').json()
        access, refresh = login['access_token'], login['refresh_token']
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + access)
        self.assertEqual(self.client.get('/api/v1/proprietor/overview/').status_code, 200)
        self.client.credentials()
        self.client.force_authenticate(self.cto)
        self.assertEqual(self.client.post(f'{BASE}{self.prop.pk}/deactivate/').status_code, 200)
        self.client.force_authenticate(None)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + access)
        self.assertEqual(self.client.get('/api/v1/proprietor/overview/').status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/v1/auth/refresh/', {'refresh': refresh}, format='json').status_code, 401)
        self.assertEqual(self.client.post('/api/v1/auth/login/', {
            'matricule': self.prop.matricule, 'password': 'Sup3rSecret!pass'}, format='json').status_code, 403)
        self.client.force_authenticate(self.cto)
        self.assertEqual(self.client.post(f'{BASE}{self.prop.pk}/activate/').status_code, 200)
        self.assertTrue(ProprietorActionLog.objects.filter(action=ProprietorActionLog.ACTION_DEACTIVATED).exists())

    def test_reissue_password_revokes_sessions_and_forces_change(self):
        response = self.client.post(f'{BASE}{self.prop.pk}/reset-password/')
        self.assertEqual(response.status_code, 200)
        creds = response.json()['credentials']
        self.prop.refresh_from_db()
        self.assertTrue(self.prop.check_password(creds['temporary_password']))
        self.assertTrue(self.prop.must_change_password)
        self.assertIsNotNone(self.prop.sessions_valid_after)
        row = ProprietorActionLog.objects.get(action=ProprietorActionLog.ACTION_PASSWORD_ISSUED)
        self.assertNotIn(creds['temporary_password'], row.detail)

    def test_no_hard_delete_endpoint(self):
        self.assertEqual(self.client.delete(f'{BASE}{self.prop.pk}/').status_code, 405)

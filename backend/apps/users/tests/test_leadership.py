"""EduIgnite leadership memory: kept by the CEO and CTO, read by the EduIgnite AI. No seed data, nothing automatic."""

from datetime import date

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.ai_features.utils import build_system_prompt
from apps.users.models import FounderProfile, LeadershipEntry

User = get_user_model()
URL = '/api/v1/users/leadership/'


def make_user(matricule, role, name=None, **extra):
    return User.objects.create_user(
        matricule=matricule, name=name or f'Person {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, password='password123', is_license_paid=True, **extra)


class NothingIsPreFilledTests(APITestCase):
    def test_a_fresh_system_has_no_leadership_records(self):
        self.assertEqual(LeadershipEntry.objects.count(), 0)

    def test_creating_or_changing_executive_accounts_records_nothing(self):
        ceo = make_user('CEO0', 'CEO', 'Nsame Rene Tamjong')
        FounderProfile.objects.create(user=ceo, founder_title='Founder and CEO')
        ceo.is_active = False
        ceo.save()
        self.assertEqual(LeadershipEntry.objects.count(), 0)


class ApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.ceo = make_user('CEO9', 'CEO')
        self.cto = make_user('CTO9', 'CTO')
        self.coo = make_user('COO9', 'COO')
        self.teacher = make_user('TCH9', 'TEACHER')

    def test_only_the_ceo_and_cto_can_use_it(self):
        for user, code in ((self.ceo, 200), (self.cto, 200), (self.coo, 403), (self.teacher, 403)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(URL).status_code, code, user.role)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(URL).status_code, 401)

    def test_an_executive_without_access_cannot_add_or_delete(self):
        entry = LeadershipEntry.objects.create(person_name='Bright', title='Director')
        self.client.force_authenticate(self.coo)
        self.assertEqual(self.client.post(URL, {'person_name': 'X', 'title': 'Y'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'{URL}{entry.id}/').status_code, 403)
        self.assertTrue(LeadershipEntry.objects.filter(id=entry.id).exists())

    def test_the_cto_adds_a_former_leader_with_dates(self):
        self.client.force_authenticate(self.cto)
        r = self.client.post(URL, {'person_name': 'Bright', 'title': 'Director of EduIgnite', 'is_current': False,
                                   'start_date': '2023-03-01', 'end_date': '2024-06-30'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertFalse(r.data['is_current'])
        self.assertEqual(LeadershipEntry.objects.count(), 1)

    def test_validation(self):
        self.client.force_authenticate(self.ceo)
        bad_order = self.client.post(URL, {'person_name': 'X', 'title': 'T', 'is_current': False,
                                           'start_date': '2024-06-01', 'end_date': '2023-01-01'}, format='json')
        self.assertEqual(bad_order.status_code, 400)
        current_with_end = self.client.post(URL, {'person_name': 'X', 'title': 'T', 'is_current': True,
                                                  'end_date': '2024-01-01'}, format='json')
        self.assertEqual(current_with_end.status_code, 400)
        blank = self.client.post(URL, {'person_name': '  ', 'title': 'T'}, format='json')
        self.assertEqual(blank.status_code, 400)

    def test_a_founder_edits_and_deletes(self):
        self.client.force_authenticate(self.ceo)
        entry = LeadershipEntry.objects.create(person_name='Nsame Rene', title='CEO')
        r = self.client.patch(f'{URL}{entry.id}/', {'person_name': 'Nsame Rene Tamjong'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.delete(f'{URL}{entry.id}/').status_code, 204)
        self.assertEqual(LeadershipEntry.objects.count(), 0)


class AiPromptTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_nothing_recorded_adds_nothing(self):
        self.assertNotIn('EDUIGNITE LEADERSHIP', build_system_prompt('', None))

    def test_the_conversation_prompt_has_current_and_former_leaders_with_periods(self):
        LeadershipEntry.objects.create(person_name='Nsame Rene Tamjong', title='CEO (Chief Executive Officer)',
                                       is_current=True, start_date=date(2024, 3, 1))
        LeadershipEntry.objects.create(person_name='Bright', title='Director of EduIgnite', is_current=False,
                                       start_date=date(2023, 3, 1), end_date=date(2024, 6, 30))
        LeadershipEntry.objects.create(person_name='Ada', title='Advisor', is_current=False)
        LeadershipEntry.objects.create(person_name='Ada', title='Head of Operations', is_current=True,
                                       department='Operations', start_date=date(2024, 7, 1))
        cache.clear()
        prompt = build_system_prompt('', None)
        self.assertIn('Current:', prompt)
        self.assertIn('- Nsame Rene Tamjong: CEO (Chief Executive Officer); since March 2024', prompt)
        self.assertIn('Former (no longer in the position):', prompt)
        self.assertIn('- Bright: Director of EduIgnite; March 2023 to June 2024', prompt)
        self.assertIn('- Ada: Advisor; dates not recorded', prompt)
        self.assertIn('- Ada: Head of Operations, Operations; since July 2024', prompt)  # a promotion is two entries
        self.assertIn('never share emails, phone numbers, shares', prompt)

    def test_other_features_do_not_carry_the_records(self):
        LeadershipEntry.objects.create(person_name='Bright', title='Director')
        cache.clear()
        self.assertNotIn('EDUIGNITE LEADERSHIP', build_system_prompt('exam_generation', None))
        self.assertNotIn('EDUIGNITE LEADERSHIP', build_system_prompt('', 'json'))

    def test_adding_editing_and_deleting_reach_the_ai_at_once(self):
        entry = LeadershipEntry.objects.create(person_name='Bright', title='Director')
        self.assertIn('Bright', build_system_prompt('', None))
        entry.person_name = 'Bright Mbah'
        entry.save()
        self.assertIn('Bright Mbah', build_system_prompt('', None))
        entry.delete()
        self.assertNotIn('Bright', build_system_prompt('', None))

    def test_a_failure_reading_the_records_never_breaks_the_chat(self):
        from unittest import mock

        with mock.patch('apps.users.leadership.build_prompt_text', side_effect=RuntimeError('db down')):
            cache.clear()
            prompt = build_system_prompt('', None)
        self.assertIn('You are the EduIgnite AI', prompt)
        self.assertNotIn('EDUIGNITE LEADERSHIP', prompt)

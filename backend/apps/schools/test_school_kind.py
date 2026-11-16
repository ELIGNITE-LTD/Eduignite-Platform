"""Nursery school vs primary school: a kind of basic school kept in SchoolSettings.sections."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient, APITestCase

from apps.users.serializers import UserDetailSerializer

from .models import ClassLevel, School, SchoolClass, SchoolSettings
from .school_kind import school_kind
from .test_hierarchy_setup import BASE, HubBase, make_school, make_user
from .test_public_profile import _school, publish

User = get_user_model()
SCHOOLS_URL = '/api/v1/schools/schools/'
DIRECTORY = '/api/v1/schools/public/'


def _payload(name, short_name, email, **extra):
    data = {
        'name': name, 'short_name': short_name, 'principal': 'Mme Principal',
        'location': 'Douala', 'email': email, 'phone': '237650800800',
        'school_type': 'general', 'subsystem': 'anglophone', 'education_category': 'basic',
    }
    data.update(extra)
    return data


def _levels(school, cycle=None):
    rows = ClassLevel.objects.filter(school=school)
    if cycle:
        rows = rows.filter(cycle=cycle)
    return set(rows.values_list('name', flat=True))


class CreateWithKindTests(APITestCase):
    def setUp(self):
        self.ceo = User.objects.create_user(
            matricule='EDUCEO2699', name='Founder', email='founder-kind@example.com',
            role='CEO', password='password123',
        )
        self.client.force_authenticate(self.ceo)

    def create(self, short, **extra):
        return self.client.post(
            SCHOOLS_URL, _payload(f'School {short}', short, f'{short.lower()}@example.com', **extra), format='json',
        )

    def test_nursery_school(self):
        response = self.create('NURA', basic_section='nursery')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['school_kind'], 'nursery')
        self.assertNotIn('basic_section', response.data)
        school = School.objects.get(id=response.data['id'])
        self.assertEqual(school.education_category, 'basic')
        self.assertEqual(school.settings.sections, ['nursery'])
        self.assertEqual(school_kind(school), 'nursery')

    def test_primary_school(self):
        response = self.create('PRIA', basic_section='primary')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['school_kind'], 'primary')
        self.assertEqual(School.objects.get(id=response.data['id']).settings.sections, ['primary'])

    def test_legacy_create_without_basic_section_keeps_both(self):
        response = self.create('LEGA')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['school_kind'], 'basic')
        school = School.objects.get(id=response.data['id'])
        self.assertEqual(school.settings.sections, [])
        self.assertEqual(_levels(school, 'nursery') and _levels(school, 'primary') and 'both', 'both')

    def test_invalid_value_is_rejected(self):
        for bad in ('secondary', 'both', 'Nursery ', ''):
            response = self.create('BADV', basic_section=bad)
            self.assertEqual(response.status_code, 400, (bad, response.data))
            self.assertIn('basic_section', response.data['errors'])
        self.assertFalse(School.objects.filter(short_name='BADV').exists())

    def test_non_basic_category_with_basic_section_is_rejected(self):
        for category in ('secondary', 'higher'):
            response = self.create('NOPE', education_category=category, basic_section='nursery')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('only for basic education', str(response.data['errors']['basic_section']))
        response = self.client.post(
            SCHOOLS_URL,
            {k: v for k, v in _payload('No Cat', 'NOCT', 'noct@example.com', basic_section='primary').items()
             if k != 'education_category'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(School.objects.filter(short_name='NOPE').exists())

    def test_secondary_school_has_no_kind(self):
        response = self.create('SECO', education_category='secondary')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data['school_kind'])

    def test_levels_are_seeded_by_kind_at_creation(self):
        nursery = School.objects.get(id=self.create('NSL', basic_section='nursery').data['id'])
        primary = School.objects.get(id=self.create('PSL', basic_section='primary').data['id'])
        legacy = School.objects.get(id=self.create('BSL').data['id'])
        self.assertEqual(_levels(nursery), {'Nursery 1', 'Nursery 2', 'Nursery 3'})
        self.assertEqual(_levels(primary), {f'Class {i}' for i in range(1, 7)})
        self.assertEqual(len(_levels(legacy)), 9)
        self.assertFalse(ClassLevel.objects.filter(school=nursery, cycle='primary').exists())
        self.assertFalse(ClassLevel.objects.filter(school=primary, cycle='nursery').exists())


class SchoolKindRuleTests(TestCase):
    def kind(self, category, sections):
        school = make_school(f'K{abs(hash((category, tuple(sections)))) % 10000}', category)
        SchoolSettings.objects.update_or_create(school=school, defaults={'sections': sections})
        return school

    def test_values(self):
        self.assertEqual(school_kind(self.kind('basic', ['nursery'])), 'nursery')
        self.assertEqual(school_kind(self.kind('basic', ['primary'])), 'primary')
        self.assertEqual(school_kind(self.kind('basic', [])), 'basic')
        self.assertEqual(school_kind(self.kind('basic', ['nursery', 'primary'])), 'basic')
        self.assertIsNone(school_kind(self.kind('secondary', [])))
        self.assertIsNone(school_kind(self.kind('higher', ['nursery'])))

    def test_basic_school_without_settings_row_is_legacy(self):
        school = make_school('KNOSET')
        SchoolSettings.objects.filter(school=school).delete()
        self.assertEqual(school_kind(school), 'basic')

    def test_exposed_on_list_detail_and_me_payload(self):
        school = self.kind('basic', ['nursery'])
        admin = make_user(school, 'SCHOOL_ADMIN', 'ADM')
        client = APIClient()
        client.force_authenticate(admin)
        listing = client.get(SCHOOLS_URL)
        rows = listing.data['results'] if isinstance(listing.data, dict) and 'results' in listing.data else listing.data
        rows = rows['data'] if isinstance(rows, dict) and 'data' in rows else rows
        self.assertEqual([r['school_kind'] for r in rows if r['id'] == school.id], ['nursery'])
        detail = client.get(f'{SCHOOLS_URL}{school.id}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['school_kind'], 'nursery')
        self.assertEqual(UserDetailSerializer(admin).data['school']['school_kind'], 'nursery')
        sec = make_school('KSEC', 'secondary')
        self.assertIsNone(UserDetailSerializer(make_user(sec, 'SCHOOL_ADMIN', 'ADM')).data['school']['school_kind'])

    def test_settings_api_still_tolerant(self):
        school = self.kind('basic', ['nursery'])
        school.refresh_from_db()
        client = APIClient()
        client.force_authenticate(make_user(school, 'SCHOOL_ADMIN', 'ADM'))
        for sections in (['nursery', 'primary'], ['primary'], []):
            SchoolSettings.objects.filter(school=school).update(sections=['nursery'])
            response = client.patch(f'{SCHOOLS_URL}{school.id}/settings/', {'sections': sections}, format='json')
            self.assertIn(response.status_code, (200, 202), response.data)
            self.assertEqual(SchoolSettings.objects.get(school=school).sections, sections)


class SeedingByKindTests(HubBase):
    def kind_school(self, sid, sections):
        school = make_school(sid)
        ClassLevel.objects.filter(school=school).delete()
        SchoolClass.objects.filter(school=school).delete()
        SchoolSettings.objects.update_or_create(school=school, defaults={'sections': sections})
        return school

    def test_auto_seeding(self):
        from . import class_levels

        nursery = self.kind_school('SK-N', ['nursery'])
        primary = self.kind_school('SK-P', ['primary'])
        legacy = self.kind_school('SK-L', [])
        for school in (nursery, primary, legacy):
            class_levels.ensure_levels_for_school(school)
        self.assertEqual(_levels(nursery), {'Nursery 1', 'Nursery 2', 'Nursery 3'})
        self.assertEqual(_levels(primary), {f'Class {i}' for i in range(1, 7)})
        self.assertEqual(len(_levels(legacy)), 9)

    def hub(self, school):
        client = APIClient()
        client.force_authenticate(make_user(school, 'SCHOOL_ADMIN', 'HUB'))
        return client

    def test_quick_setup_defaults_follow_kind_and_explicit_values_win(self):
        nursery = self.kind_school('SQ-N', ['nursery'])
        response = self.hub(nursery).post(f'{BASE}setup/quick/', {'languages': ['en']}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(set(response.data['classes_created']), {'Nursery 1', 'Nursery 2', 'Nursery 3'})
        self.assertFalse(ClassLevel.objects.filter(school=nursery, cycle='primary').exists())

        primary = self.kind_school('SQ-P', ['primary'])
        response = self.hub(primary).post(f'{BASE}setup/quick/', {'languages': ['en']}, format='json')
        self.assertEqual(set(response.data['classes_created']), {f'Class {i}' for i in range(1, 7)})

        explicit = self.kind_school('SQ-E', ['nursery'])
        response = self.hub(explicit).post(
            f'{BASE}setup/quick/', {'languages': ['en'], 'nursery': True, 'primary': True}, format='json',
        )
        self.assertEqual(len(response.data['classes_created']), 9)

        legacy = self.kind_school('SQ-L', [])
        response = self.hub(legacy).post(f'{BASE}setup/quick/', {'languages': ['en']}, format='json')
        self.assertEqual(len(response.data['classes_created']), 9)

    def test_level_seed_defaults_follow_kind(self):
        nursery = self.kind_school('SS-N', ['nursery'])
        response = self.hub(nursery).post(f'{BASE}levels/seed/', {'languages': ['en']}, format='json')
        self.assertIn(response.status_code, (200, 201), response.data)
        self.assertEqual(_levels(nursery), {'Nursery 1', 'Nursery 2', 'Nursery 3'})

    def test_nursery_school_does_not_require_subjects(self):
        nursery = self.kind_school('SC-N', ['nursery'])
        client = self.hub(nursery)
        client.post(f'{BASE}setup/quick/', {'languages': ['en']}, format='json')
        steps = {s['key']: s for s in client.get(f'{BASE}setup-summary/').data['steps']}
        self.assertTrue(steps['subjects']['done'])
        self.assertEqual(client.get(f'{BASE}setup-summary/').data['school_kind'], 'nursery')

        primary = self.kind_school('SC-P', ['primary'])
        client = self.hub(primary)
        client.post(f'{BASE}setup/quick/', {'languages': ['en']}, format='json')
        steps = {s['key']: s for s in client.get(f'{BASE}setup-summary/').data['steps']}
        self.assertFalse(steps['subjects']['done'])


class DirectoryLevelFilterTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.nursery = _school('DKN', 'Nursery Only School', education_category='basic')
        self.primary = _school('DKP', 'Primary Only School', education_category='basic')
        self.legacy = _school('DKL', 'Both School', education_category='basic')
        SchoolSettings.objects.update_or_create(school=self.nursery, defaults={'sections': ['nursery']})
        SchoolSettings.objects.update_or_create(school=self.primary, defaults={'sections': ['primary']})
        SchoolSettings.objects.update_or_create(school=self.legacy, defaults={'sections': []})
        for school in (self.nursery, self.primary, self.legacy):
            publish(school)

    def names(self, **params):
        response = self.client.get(DIRECTORY, {'scope': 'all', **params})
        self.assertEqual(response.status_code, 200)
        return {c['name'] for c in response.data}

    def test_nursery_filter(self):
        names = self.names(level='nursery')
        self.assertIn('Nursery Only School', names)
        self.assertNotIn('Primary Only School', names)
        self.assertIn('Both School', names)

    def test_primary_filter(self):
        names = self.names(level='primary')
        self.assertIn('Primary Only School', names)
        self.assertNotIn('Nursery Only School', names)
        self.assertIn('Both School', names)

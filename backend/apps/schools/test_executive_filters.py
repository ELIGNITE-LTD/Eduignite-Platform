"""Executive Schools tab: server-side filters and facet counts."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.schools.models import School, SchoolSettings

User = get_user_model()
LIST = '/api/v1/schools/schools/'
STATS = '/api/v1/schools/schools/stats/'


def _school(code, name, *, category='secondary', stype='general', subsystem='anglophone',
            status='Active', sections=None, **extra):
    school = School.objects.create(
        id=code, name=name, short_name=code, principal=f'{name} Head', location='Buea',
        email=f'{code.lower()}@example.org', phone='237650000000', school_type=stype,
        subsystem=subsystem, education_category=category, status=status, **extra,
    )
    if sections is not None:
        SchoolSettings.objects.update_or_create(school=school, defaults={'sections': sections})
    return school


def _user(matricule, role, school=None, **extra):
    return User.objects.create_user(
        matricule=matricule, name=f'{role} {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='Passw0rd!123', is_license_paid=True, **extra,
    )


class ExecutiveSchoolFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.nursery = _school('NUR1', 'Little Stars Nursery', category='basic', sections=['nursery'],
                              subsystem='anglophone')
        cls.primary = _school('PRI1', 'Bright Primary', category='basic', sections=['nursery', 'primary'],
                              subsystem='francophone', status='Suspended')
        cls.sec = _school('SEC1', 'Grand Lycee', category='secondary', subsystem='bilingual')
        cls.tech = _school('TEC1', 'Technical College', category='secondary', stype='technical',
                           subsystem='francophone', status='Pending')
        cls.uni = _school('UNI1', 'Buea Institute', category='higher', subsystem='anglophone')
        from django.utils import timezone
        cls.draft_pending = _school('LNK1', 'Linked Primary', category='basic', sections=['primary'],
                                    status='Pending', is_drafted=True, drafted_at=timezone.now(),
                                    draft_delete_after=None)
        cls.ceo = _user('CEO001', 'CEO')
        cls.admin = _user('ADM001', 'SCHOOL_ADMIN', school=cls.sec)

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.ceo)

    def ids(self, **params):
        response = self.client.get(LIST, params)
        self.assertEqual(response.status_code, 200, response.content)
        return {row['id'] for row in response.json()['results']}

    def test_no_filter_keeps_existing_behaviour(self):
        self.assertEqual(self.ids(), {'NUR1', 'PRI1', 'SEC1', 'TEC1', 'UNI1'})

    def test_education_category(self):
        self.assertEqual(self.ids(education_category='basic'), {'NUR1', 'PRI1'})
        self.assertEqual(self.ids(education_category='higher'), {'UNI1'})
        self.assertEqual(self.ids(education_category='basic,higher'), {'NUR1', 'PRI1', 'UNI1'})

    def test_school_type(self):
        self.assertEqual(self.ids(school_type='technical'), {'TEC1'})

    def test_level(self):
        self.assertEqual(self.ids(level='nursery'), {'NUR1', 'PRI1'})
        self.assertEqual(self.ids(level='primary'), {'PRI1'})
        self.assertEqual(self.ids(level='secondary'), {'SEC1', 'TEC1'})
        self.assertEqual(self.ids(level='higher'), {'UNI1'})

    def test_subsystem(self):
        self.assertEqual(self.ids(subsystem='bilingual'), {'SEC1'})
        self.assertEqual(self.ids(subsystem='francophone'), {'PRI1', 'TEC1'})

    def test_status(self):
        self.assertEqual(self.ids(status='suspended'), {'PRI1'})
        self.assertEqual(self.ids(status='active'), {'NUR1', 'SEC1', 'UNI1'})

    def test_pending_includes_schools_awaiting_activation(self):
        self.assertEqual(self.ids(status='pending'), {'TEC1', 'LNK1'})

    def test_text_search(self):
        self.assertEqual(self.ids(q='lycee'), {'SEC1'})
        self.assertEqual(self.ids(q='uni1'), {'UNI1'})

    def test_combined(self):
        self.assertEqual(self.ids(education_category='secondary', subsystem='francophone'), {'TEC1'})
        self.assertEqual(self.ids(education_category='basic', status='pending', level='primary'), {'LNK1'})
        self.assertEqual(self.ids(education_category='basic', q='nonexistent'), set())

    def test_unknown_values_are_ignored_not_errors(self):
        self.assertEqual(self.ids(status='bogus', education_category='x'), {'NUR1', 'PRI1', 'SEC1', 'TEC1', 'UNI1'})

    def test_facets_count_each_category(self):
        response = self.client.get(STATS)
        self.assertEqual(response.status_code, 200)
        facets = response.json()['facets']
        self.assertEqual(facets['education_category'], {'basic': 3, 'secondary': 2, 'higher': 1})
        self.assertEqual(facets['status']['pending'], 2)
        self.assertEqual(facets['level']['nursery'], 2)
        self.assertEqual(facets['level']['primary'], 2)
        self.assertEqual(facets['school_type']['technical'], 1)

    def test_facets_follow_other_filters(self):
        facets = self.client.get(STATS, {'education_category': 'basic'}).json()['facets']
        self.assertEqual(facets['total'], 3)
        self.assertEqual(facets['subsystem'], {'anglophone': 2, 'francophone': 1})
        self.assertEqual(facets['education_category']['secondary'], 2)  # its own chip ignores itself
        self.assertEqual(facets['subsystem'].get('bilingual', 0), 0)

    def test_non_executive_cannot_read_facets(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(STATS).status_code, 403)

    def test_school_admin_filters_do_not_widen_access(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(LIST, {'education_category': 'basic', 'status': 'pending'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual({r['id'] for r in response.json()['results']}, {'SEC1'})

    def test_anonymous_gets_401(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(STATS).status_code, (401, 403))


class UnsetSectionsLevelFilterTests(APITestCase):
    """A basic school that never set its sections offers both levels."""

    @classmethod
    def setUpTestData(cls):
        cls.unset = _school('UNS1', 'Unset Basic', category='basic', sections=[])
        cls.no_settings = _school('UNS2', 'No Settings Basic', category='basic')
        cls.only_nursery = _school('UNS3', 'Nursery Only', category='basic', sections=['nursery'])
        cls.secondary = _school('UNS4', 'Secondary', category='secondary', sections=[])
        cls.ceo = _user('UNS-CEO', 'CEO')

    def ids(self, **params):
        self.client.force_authenticate(self.ceo)
        response = self.client.get(LIST, params)
        self.assertEqual(response.status_code, 200)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['id'] for row in rows}

    def test_unset_sections_match_nursery_and_primary(self):
        self.assertTrue({'UNS1', 'UNS2'} <= self.ids(level='primary'))
        self.assertTrue({'UNS1', 'UNS2', 'UNS3'} <= self.ids(level='nursery'))

    def test_explicit_sections_still_exclude(self):
        self.assertNotIn('UNS3', self.ids(level='primary'))

    def test_secondary_never_matches_basic_levels(self):
        self.assertNotIn('UNS4', self.ids(level='primary'))

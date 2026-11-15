"""Higher-education filters and programme summary on the public directory (?scope=all)."""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.higher_ed.models import OrganizationalUnit, Programme

from .test_public_cards import CARD_KEYS
from .test_public_profile import _school

LIST = '/api/v1/schools/public/'


def _programme(school, name, award, active=True):
    dept, _ = OrganizationalUnit.objects.get_or_create(
        school=school, unit_type=OrganizationalUnit.DEPARTMENT, name='General')
    return Programme.objects.create(school=school, department=dept, name=name, award_level=award,
                                    is_active=active)


class HigherDirectoryFilterTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        he = dict(education_category='higher')
        self.a = _school('HEA', 'Alpha University', subsystem='anglophone', city_village='Buea',
                         region='South West', **he)
        self.b = _school('HEB', 'Beta Institut', subsystem='francophone', city_village='Douala',
                         region='Littoral', **he)
        self.c = _school('HEC', 'Gamma Polytechnic', subsystem='bilingual', city_village='Yaounde',
                         region='Centre', **he)
        self.sec = _school('SEC1', 'Delta Secondary', education_category='secondary', city_village='Buea')
        _programme(self.a, 'Law', 'licence')
        _programme(self.a, 'Law MSc', 'master')
        _programme(self.a, 'Old', 'doctorat', active=False)
        _programme(self.b, 'Gestion', 'licence')
        _programme(self.b, 'Compta', 'licence')
        _programme(self.c, 'Eng', 'hnd')

    def names(self, **params):
        response = self.client.get(LIST, {'scope': 'all', **params})
        self.assertEqual(response.status_code, 200)
        return [c['name'] for c in response.data]

    def test_award_filter_uses_active_programmes_and_higher_only(self):
        self.assertEqual(self.names(award='licence'), ['Alpha University', 'Beta Institut'])
        self.assertEqual(self.names(award='hnd'), ['Gamma Polytechnic'])
        self.assertEqual(self.names(award='doctorat'), [])  # inactive programme only
        self.assertEqual(self.names(award='bogus', level='higher'),
                         ['Alpha University', 'Beta Institut', 'Gamma Polytechnic'])

    def test_language_filter_includes_bilingual(self):
        self.assertEqual(self.names(level='higher', language='anglophone'),
                         ['Alpha University', 'Gamma Polytechnic'])
        self.assertEqual(self.names(level='higher', subsystem='francophone'),
                         ['Beta Institut', 'Gamma Polytechnic'])

    def test_city_filter_and_existing_params(self):
        self.assertEqual(self.names(level='higher', city='dou'), ['Beta Institut'])
        self.assertEqual(self.names(level='higher', town='buea'), ['Alpha University'])
        self.assertEqual(self.names(city='buea'), ['Alpha University', 'Delta Secondary'])
        self.assertEqual(self.names(level='higher', region='centre'), ['Gamma Polytechnic'])
        self.assertEqual(self.names(level='higher', q='beta'), ['Beta Institut'])

    def test_higher_cards_carry_programme_summary(self):
        cards = {c['name']: c for c in self.client.get(LIST, {'scope': 'all'}).data}
        self.assertEqual(cards['Alpha University']['programme_count'], 2)
        self.assertEqual(cards['Alpha University']['award_levels'], ['licence', 'master'])
        self.assertEqual(cards['Beta Institut']['programme_count'], 2)
        self.assertEqual(cards['Beta Institut']['award_levels'], ['licence'])
        self.assertEqual(set(cards['Delta Secondary']), CARD_KEYS)  # basic cards unchanged

    def test_query_count_does_not_grow_with_programmes(self):
        self.client.get(LIST, {'scope': 'all', 'level': 'higher'})
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as before:
            self.client.get(LIST, {'scope': 'all', 'level': 'higher'})
        _programme(self.c, 'Extra', 'bts')
        _programme(self.b, 'Extra2', 'master')
        with CaptureQueriesContext(connection) as after:
            self.client.get(LIST, {'scope': 'all', 'level': 'higher'})
        self.assertEqual(len(before), len(after))


class CardPlaceFallbackTests(TestCase):
    def test_card_shows_the_location_when_no_city_village_is_set(self):
        cache.clear()
        _school('HED', 'Delta Institute', education_category='higher', city_village='', location='Bamenda')
        cards = APIClient().get(LIST, {'scope': 'all'}).data
        self.assertEqual(next(c for c in cards if c['name'] == 'Delta Institute')['city_village'], 'Bamenda')

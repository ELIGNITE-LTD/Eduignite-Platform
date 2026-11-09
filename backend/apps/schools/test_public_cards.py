"""All-schools public directory cards (?scope=all) and the public logo endpoint."""

import base64

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.schools.models import PublicationStatus, School, SchoolPublicProfile, SchoolStatus
from apps.schools.public_profile import PublicSchoolLogoView, school_public_handle

from .test_public_profile import _school, publish

# 1x1 transparent PNG
PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
PNG_DATA_URL = 'data:image/png;base64,' + base64.b64encode(PNG).decode()
LIST = '/api/v1/schools/public/'

CARD_KEYS = {'handle', 'name', 'short_name', 'city_village', 'region', 'subsystem', 'levels',
             'logo_url', 'site_published'}
PUBLISHED_KEYS = CARD_KEYS | {'slug', 'site_url'}


class PublicSchoolCardsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.pub = _school('CARDA', 'Zeta Published College', city_village='Buea', region='South West',
                           logo=PNG_DATA_URL)
        publish(self.pub)
        self.unpub = _school('CARDB', 'Alpha Quiet School', city_village='Limbe', region='South West')
        self.pending = _school('CARDC', 'Pending Hill School', status=SchoolStatus.PENDING)
        self.suspended = _school('CARDD', 'Suspended Hill School', status=SchoolStatus.SUSPENDED)
        self.drafted = _school('CARDE', 'Drafted Lake School', is_drafted=True)

    def cards(self, **params):
        response = self.client.get(LIST, {'scope': 'all', **params})
        self.assertEqual(response.status_code, 200)
        return response

    def test_only_live_schools_listed_published_first_then_name(self):
        response = self.cards()
        self.assertEqual([c['name'] for c in response.data], ['Zeta Published College', 'Alpha Quiet School'])
        self.assertEqual(response['X-Total-Count'], '2')
        self.assertIn('max-age=60', response['Cache-Control'])

    def test_unpublished_has_no_slug_or_url_published_has_them(self):
        published, quiet = self.cards().data
        self.assertTrue(published['site_published'])
        self.assertEqual(published['slug'], self.pub.public_slug)
        self.assertEqual(published['site_url'], f'/schools/{self.pub.public_slug}')
        self.assertFalse(quiet['site_published'])
        self.assertNotIn('slug', quiet)
        self.assertNotIn('site_url', quiet)

    def test_exact_key_set_and_no_private_data(self):
        published, quiet = self.cards().data
        self.assertEqual(set(published), PUBLISHED_KEYS)
        self.assertEqual(set(quiet), CARD_KEYS)
        blob = str(self.cards().data)
        for secret in (self.pub.id, 'Dr. Principal', 'carda@example.com', '237650900900', 'data:image'):
            self.assertNotIn(secret, blob)
        self.assertNotEqual(published['handle'], self.pub.id)

    def test_logo_url_only_when_logo_and_points_to_endpoint(self):
        published, quiet = self.cards().data
        self.assertTrue(published['logo_url'].endswith(f"/api/v1/schools/public/logo/{published['handle']}/"))
        self.assertTrue(published['logo_url'].startswith('http'))
        self.assertIsNone(quiet['logo_url'])

    def test_kill_switched_and_unpublished_profiles_listed_but_unavailable(self):
        blocked = _school('CARDF', 'Blocked Site School', public_profile_enabled=False)
        publish(blocked)
        withdrawn = _school('CARDG', 'Withdrawn Site School')
        publish(withdrawn, publication_status=PublicationStatus.UNPUBLISHED)
        by_name = {c['name']: c for c in self.cards().data}
        for name in ('Blocked Site School', 'Withdrawn Site School'):
            self.assertFalse(by_name[name]['site_published'], name)
            self.assertNotIn('slug', by_name[name])

    def test_search_region_and_level_filters(self):
        _school('CARDH', 'Little Stars Primary', education_category='basic', region='Nord-Ouest',
                city_village='Bamenda')
        self.assertEqual([c['name'] for c in self.cards(q='bamenda').data], ['Little Stars Primary'])
        self.assertEqual([c['name'] for c in self.cards(q='quiet').data], ['Alpha Quiet School'])
        self.assertEqual([c['name'] for c in self.cards(region='nord-ouest').data], ['Little Stars Primary'])
        self.assertEqual([c['name'] for c in self.cards(level='primary').data], ['Little Stars Primary'])
        self.assertEqual(self.cards(level='primary')['X-Total-Count'], '1')
        self.assertEqual(self.cards(level='higher').data, [])

    def test_pagination_defaults_and_cap(self):
        for i in range(30):
            _school(f'CARDP{i:02d}', f'Bulk School {i:02d}')
        self.assertEqual(len(self.cards().data), 24)
        self.assertEqual(self.cards()['X-Total-Count'], '32')
        self.assertEqual(len(self.cards(limit=500).data), 32)
        page1 = [c['handle'] for c in self.cards(limit=10).data]
        page2 = [c['handle'] for c in self.cards(limit=10, offset=10).data]
        self.assertFalse(set(page1) & set(page2))
        everything = [c['name'] for c in self.cards(limit=60).data]
        self.assertEqual(everything[0], 'Zeta Published College')
        self.assertEqual(everything[1:], sorted(everything[1:]))

    def test_default_behaviour_unchanged_without_scope(self):
        rows = self.client.get(LIST).data
        self.assertEqual([r['slug'] for r in rows], [self.pub.public_slug])
        self.assertEqual(set(rows[0]), {'slug', 'updated_at'})
        detail = self.client.get(LIST, {'detail': 1}).data
        self.assertEqual([r['name'] for r in detail], ['Zeta Published College'])
        self.assertIn('logo', detail[0])

    def test_throttle_scope(self):
        self.assertEqual(PublicSchoolLogoView.throttle_scope, 'public_site')
        self.assertIn('public_site', settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'])


class PublicSchoolLogoTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def url(self, school):
        return f'{LIST}logo/{school_public_handle(school.id)}/'

    def test_data_url_logo_served_with_type_and_caching(self):
        school = _school('LOGA', 'Logo Data School', logo=PNG_DATA_URL)
        response = self.client.get(self.url(school))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertEqual(response.content, PNG)
        self.assertEqual(response['Cache-Control'], 'public, max-age=86400')
        etag = response['ETag']
        self.assertTrue(etag)
        again = self.client.get(self.url(school), HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(again.status_code, 304)

    def test_raw_base64_is_sniffed(self):
        school = _school('LOGB', 'Logo Raw School', logo=base64.b64encode(PNG).decode())
        response = self.client.get(self.url(school))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/png')

    def test_http_logo_redirects(self):
        school = _school('LOGC', 'Logo Http School', logo='https://cdn.example.com/logo.png')
        response = self.client.get(self.url(school))
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], 'https://cdn.example.com/logo.png')
        self.assertIn('max-age=86400', response['Cache-Control'])

    def test_missing_unknown_and_non_live_are_404(self):
        none = _school('LOGD', 'No Logo School')
        pending = _school('LOGE', 'Pending Logo School', logo=PNG_DATA_URL, status=SchoolStatus.PENDING)
        drafted = _school('LOGF', 'Drafted Logo School', logo=PNG_DATA_URL, is_drafted=True)
        for school in (none, pending, drafted):
            self.assertEqual(self.client.get(self.url(school)).status_code, 404, school.name)
        self.assertEqual(self.client.get(f'{LIST}logo/{"0" * 24}/').status_code, 404)
        self.assertEqual(self.client.get(f'{LIST}logo/short/').status_code, 404)

    def test_matricule_is_not_a_handle(self):
        school = _school('LOGG', 'Matricule Probe School', logo=PNG_DATA_URL)
        self.assertEqual(self.client.get(f'{LIST}logo/{school.id}/').status_code, 404)
        self.assertNotIn(school.id, school_public_handle(school.id))
        self.assertEqual(school_public_handle(school.id), school_public_handle(school.id))

    def test_oversized_and_garbage_logos_are_404(self):
        big = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'0' * (3 * 1024 * 1024)).decode()
        junk = _school('LOGH', 'Garbage Logo School', logo='not an image at all!!')
        huge = _school('LOGI', 'Huge Logo School', logo=big)
        html = _school('LOGJ', 'Html Logo School',
                       logo='data:text/html;base64,' + base64.b64encode(b'<script>1</script>').decode())
        for school in (junk, huge, html):
            self.assertEqual(self.client.get(self.url(school)).status_code, 404, school.name)

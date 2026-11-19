"""Founders and executives write a short bio and professional links for their public card."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.users.models import FounderProfile
from apps.users.public_profile import MAX_BIO_LENGTH, clean_url

User = get_user_model()
URL = '/api/v1/users/founder-public-profile/'
PUBLIC = '/api/v1/platform/public-founders/'


def make_user(matricule, role, name=None):
    return User.objects.create_user(
        matricule=matricule, name=name or f'Person {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, password='password123', is_license_paid=True)


class FounderPublicProfileApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.coo = make_user('COO7', 'COO', 'Grace Tabi')
        FounderProfile.objects.create(user=self.coo, founder_title='Chief Operating Officer')
        self.cto = make_user('CTO7', 'CTO', 'Ndimih Boclair')
        FounderProfile.objects.create(user=self.cto, founder_title='CTO')
        self.teacher = make_user('TCH7', 'TEACHER')

    def test_anonymous_and_non_executives_are_refused(self):
        self.assertEqual(self.client.get(URL).status_code, 401)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.client.patch(URL, {'bio': 'x'}, format='json').status_code, 403)

    def test_a_new_profile_starts_empty(self):
        self.client.force_authenticate(self.coo)
        r = self.client.get(URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['bio'], '')
        self.assertEqual(r.data['links'], [])

    def test_an_executive_saves_a_bio_and_links_and_the_public_page_shows_them_at_once(self):
        self.client.get(PUBLIC)  # warm the public cache so we can prove it is refreshed
        self.client.force_authenticate(self.coo)
        r = self.client.patch(URL, {
            'bio': '  Operations   leader focused on\nschool\tdigitisation.  ',
            'links': [{'type': 'linkedin', 'url': 'linkedin.com/in/grace-tabi'},
                      {'type': 'website', 'url': 'https://gracetabi.com/about'}],
        }, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['bio'], 'Operations leader focused on school digitisation.')
        self.assertEqual(r.data['links'][0], {'type': 'linkedin', 'url': 'https://linkedin.com/in/grace-tabi'})

        self.client.force_authenticate(None)
        people = {p['name']: p for p in self.client.get(PUBLIC).data}
        card = people['Grace Tabi']
        self.assertEqual(card['bio'], 'Operations leader focused on school digitisation.')
        self.assertEqual([l['type'] for l in card['links']], ['linkedin', 'website'])

    def test_people_can_only_edit_their_own_card(self):
        self.client.force_authenticate(self.coo)
        self.client.patch(URL, {'bio': 'Mine'}, format='json')
        self.assertEqual(FounderProfile.objects.get(user=self.cto).public_bio, '')
        # a user id in the request changes nothing: there is no way to name another person
        self.client.patch(URL, {'bio': 'Still mine', 'user': self.cto.pk}, format='json')
        self.assertEqual(FounderProfile.objects.get(user=self.cto).public_bio, '')

    def test_other_fields_cannot_be_changed_through_this_endpoint(self):
        self.client.force_authenticate(self.coo)
        self.client.patch(URL, {'bio': 'Hi', 'founder_title': 'Chief Everything',
                                'primary_share_percentage': '99.00'}, format='json')
        profile = FounderProfile.objects.get(user=self.coo)
        self.assertEqual(profile.founder_title, 'Chief Operating Officer')
        self.assertEqual(str(profile.primary_share_percentage), '0.00')

    def test_bio_is_limited(self):
        self.client.force_authenticate(self.coo)
        r = self.client.patch(URL, {'bio': 'x' * (MAX_BIO_LENGTH + 1)}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.patch(URL, {'bio': 'x' * MAX_BIO_LENGTH}, format='json').status_code, 200)

    def test_unsafe_or_wrong_links_are_refused(self):
        self.client.force_authenticate(self.coo)
        bad = [
            {'type': 'website', 'url': 'javascript:alert(1)'},
            {'type': 'website', 'url': 'data:text/html;base64,AAAA'},
            {'type': 'website', 'url': 'ftp://example.com/file'},
            {'type': 'website', 'url': 'https://user:pass@example.com'},
            {'type': 'website', 'url': 'https://127.0.0.1/admin'},
            {'type': 'website', 'url': 'https://localhost/'},
            {'type': 'website', 'url': 'https://intranet/'},
            {'type': 'linkedin', 'url': 'https://evil.com/linkedin.com/in/x'},
            {'type': 'linkedin', 'url': 'https://linkedin.com.evil.com/in/x'},
            {'type': 'github', 'url': 'https://linkedin.com/in/x'},
            {'type': 'myspace', 'url': 'https://example.com'},
            {'type': 'website', 'url': ''},
        ]
        for link in bad:
            r = self.client.patch(URL, {'links': [link]}, format='json')
            self.assertEqual(r.status_code, 400, link)
        self.assertEqual(FounderProfile.objects.get(user=self.coo).public_links, [])

    def test_link_limits(self):
        self.client.force_authenticate(self.coo)
        dup = [{'type': 'linkedin', 'url': 'https://linkedin.com/in/a'}, {'type': 'linkedin', 'url': 'https://linkedin.com/in/b'}]
        self.assertEqual(self.client.patch(URL, {'links': dup}, format='json').status_code, 400)
        many = [{'type': 'website', 'url': f'https://site{i}.com'} for i in range(7)]
        self.assertEqual(self.client.patch(URL, {'links': many}, format='json').status_code, 400)

    def test_http_is_upgraded_and_fragments_dropped(self):
        self.assertEqual(clean_url('website', 'http://example.com/me#top'), 'https://example.com/me')
        self.assertEqual(clean_url('x', 'https://www.twitter.com/grace'), 'https://www.twitter.com/grace')

    def test_a_bad_value_already_in_the_database_never_reaches_the_public_page(self):
        FounderProfile.objects.filter(user=self.coo).update(
            public_links=[{'type': 'website', 'url': 'javascript:alert(1)'},
                          {'type': 'github', 'url': 'https://github.com/grace'}])
        links = {p['name']: p['links'] for p in self.client.get(PUBLIC).data}['Grace Tabi']
        self.assertEqual(links, [{'type': 'github', 'url': 'https://github.com/grace'}])

    def test_public_cards_with_nothing_added_stay_clean(self):
        card = {p['name']: p for p in self.client.get(PUBLIC).data}['Ndimih Boclair']
        self.assertEqual(card['bio'], '')
        self.assertEqual(card['links'], [])

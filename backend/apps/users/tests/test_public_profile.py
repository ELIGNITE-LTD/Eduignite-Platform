"""Founders and executives write their own public bio and links; the public site shows only what is safe."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.users.models import FounderProfile

User = get_user_model()
URL = '/api/v1/users/public-profile/'
PUBLIC = '/api/v1/platform/public-founders/'


def make_user(matricule, role, name):
    return User.objects.create_user(matricule=matricule, name=name, email=f'{matricule.lower()}@example.org', role=role, password='password123')


class PublicProfileTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.ceo = make_user('CEO-PB1', 'CEO', 'Rene Founder')
        FounderProfile.objects.create(user=self.ceo, founder_title='Chief Executive Officer')
        self.exec = make_user('COO-PB1', 'COO', 'Ops Lead')
        FounderProfile.objects.create(user=self.exec, founder_title='Head of Operations')
        self.teacher = make_user('TCH-PB1', 'TEACHER', 'A Teacher')

    def put(self, user, body):
        self.client.force_authenticate(user)
        return self.client.put(URL, body, format='json')

    def test_owner_saves_a_bio_and_links_and_the_public_card_shows_them_at_once(self):
        self.client.get(PUBLIC)   # warm the cache: saving must refresh it
        r = self.put(self.ceo, {'bio': 'I build education software for African schools.', 'links': [
            {'kind': 'linkedin', 'url': 'https://www.linkedin.com/in/rene-founder'}, {'kind': 'website', 'url': 'https://rene.example.org/about'}]})
        self.assertEqual(r.status_code, 200, r.data)
        self.client.force_authenticate(None)
        card = next(f for f in self.client.get(PUBLIC).data if f['name'] == 'Rene Founder')
        self.assertEqual(card['bio'], 'I build education software for African schools.')
        self.assertEqual([(l['kind'], l['label']) for l in card['links']], [('linkedin', 'LinkedIn'), ('website', 'Website')])

    def test_links_must_be_https_and_really_on_that_network(self):
        bad = [
            {'kind': 'linkedin', 'url': 'http://www.linkedin.com/in/x'},          # not https
            {'kind': 'linkedin', 'url': 'https://evil.example.com/linkedin.com'},   # wrong host
            {'kind': 'github', 'url': 'https://github.com.evil.io/x'},              # lookalike host
            {'kind': 'website', 'url': 'javascript:alert(1)'},
            {'kind': 'website', 'url': 'https://user:pass@rene.example.org'},
            {'kind': 'tiktok', 'url': 'https://tiktok.com/@x'},                     # not an allowed type
        ]
        for link in bad:
            self.assertEqual(self.put(self.ceo, {'links': [link]}).status_code, 400, link)
        self.assertEqual(self.put(self.ceo, {'links': [{'kind': 'website', 'url': 'https://a.org'}, {'kind': 'website', 'url': 'https://b.org'}]}).status_code, 400)
        self.assertEqual(self.put(self.ceo, {'links': [{'kind': 'x', 'url': 'https://x.com/rene'}]}).status_code, 200)

    def test_bio_is_plain_text_and_limited(self):
        r = self.put(self.ceo, {'bio': 'Hello <script>alert(1)</script> world'})
        self.assertEqual(r.data['bio'], 'Hello alert(1) world')
        self.assertEqual(self.put(self.ceo, {'bio': 'x' * 501}).status_code, 400)

    def test_only_board_members_have_a_profile_and_each_edits_only_their_own(self):
        self.assertEqual(self.put(self.teacher, {'bio': 'hi'}).status_code, 403)
        self.put(self.exec, {'bio': 'Operations.'})
        self.assertEqual(FounderProfile.objects.get(user=self.ceo).public_bio, '')
        self.client.force_authenticate(None)
        self.assertEqual(self.client.put(URL, {'bio': 'x'}, format='json').status_code, 401)

    def test_stored_bad_links_never_reach_the_public_site(self):
        FounderProfile.objects.filter(user=self.ceo).update(social_links=[{'kind': 'website', 'url': 'javascript:x'}, {'kind': 'github', 'url': 'https://github.com/rene'}])
        cache.clear()
        card = next(f for f in self.client.get(PUBLIC).data if f['name'] == 'Rene Founder')
        self.assertEqual([l['kind'] for l in card['links']], ['github'])

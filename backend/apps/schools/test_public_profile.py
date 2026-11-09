"""Public school profiles: explicit opt-in publication, reachable without signing in, nothing private."""

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.schools.models import PublicationStatus, School, SchoolPublicProfile, SchoolStatus

PRIVATE_FIELDS = {
    'id', 'matricule', 'status', 'subscription_status', 'subscription_amount', 'subscription_expires_on',
    'student_count', 'teacher_count', 'principal_user', 'is_drafted', 'settings', 'public_profile_enabled',
    'preview_token', 'locked_by_founder', 'updated_by',
}


def publish(school, **profile_fields):
    """Explicitly publish a school (publication is opt-in)."""
    profile, _ = SchoolPublicProfile.objects.get_or_create(school=school)
    profile.publication_status = PublicationStatus.PUBLISHED
    for key, value in profile_fields.items():
        setattr(profile, key, value)
    profile.save()
    return profile


def _school(school_id, name, **extra):
    fields = dict(
        id=school_id, name=name, short_name=school_id[:4], principal='Dr. Principal', location='Limbe',
        email=f'{school_id.lower()}@example.com', phone='237650900900', school_type='mixed',
        subsystem='bilingual', status=SchoolStatus.ACTIVE, description='A bilingual secondary school.',
    )
    fields.update(extra)
    return School.objects.create(**fields)


class PublicSchoolProfileTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.school = _school('PUBA', 'Saint Mary Bilingual College', motto='Knowledge and Service')
        self.profile = publish(self.school)
        self.url = f'/api/v1/schools/public/{self.school.public_slug}/'

    def test_profile_loads_without_login(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['name'], 'Saint Mary Bilingual College')
        self.assertEqual(response.data['motto'], 'Knowledge and Service')
        self.assertEqual(response.data['slug'], 'saint-mary-bilingual-college')

    def test_profile_exposes_no_private_or_account_fields(self):
        data = self.client.get(self.url).data
        self.assertEqual(PRIVATE_FIELDS & set(data), set())
        self.assertNotIn(self.school.matricule, str(data))

    def test_not_live_schools_are_not_found(self):
        pending = _school('PUBP', 'Pending Hill School', status=SchoolStatus.PENDING)
        hidden = _school('PUBH', 'Hidden Valley School', public_profile_enabled=False)
        drafted = _school('PUBD', 'Drafted Lake School', is_drafted=True)
        for school in (pending, hidden, drafted):
            publish(school)
            response = self.client.get(f'/api/v1/schools/public/{school.public_slug}/')
            self.assertEqual(response.status_code, 404, school.name)

    def test_never_published_school_is_404_everywhere(self):
        no_row = _school('PUBX', 'No Profile School')
        draft = _school('PUBY', 'Explicit Draft School')
        SchoolPublicProfile.objects.create(school=draft)
        for school in (no_row, draft):
            for path in ('', 'staff/'):
                response = self.client.get(f'/api/v1/schools/public/{school.public_slug}/{path}')
                self.assertEqual(response.status_code, 404, (school.name, path))

    def test_unpublished_is_404_including_staff(self):
        self.profile.publication_status = PublicationStatus.UNPUBLISHED
        self.profile.save()
        for path in ('', 'staff/'):
            self.assertEqual(self.client.get(self.url + path).status_code, 404)

    def test_suspended_school_is_404_even_if_published(self):
        self.school.status = SchoolStatus.SUSPENDED
        self.school.save()
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_directory_lists_only_published_live_profiles(self):
        _school('PUBP2', 'Pending Two School', status=SchoolStatus.PENDING)
        _school('PUBN', 'Never Published School')
        publish(_school('PUBU', 'Unpublished School'), publication_status=PublicationStatus.UNPUBLISHED)
        response = self.client.get('/api/v1/schools/public/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['slug'] for row in response.data], [self.school.public_slug])

    def test_directory_is_limited_and_reports_total(self):
        for i in range(3):
            publish(_school(f'PUBL{i}', f'Listed School {i}'))
        response = self.client.get('/api/v1/schools/public/', {'limit': 2})
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response['X-Total-Count'], '4')
        rest = self.client.get('/api/v1/schools/public/', {'limit': 2, 'offset': 2})
        self.assertEqual(len(rest.data), 2)
        self.assertEqual(len(self.client.get('/api/v1/schools/public/').data), 4)

    def test_profile_exposes_levels(self):
        self.assertEqual(self.client.get(self.url).data['levels'], ['secondary'])

    def test_directory_detail_lists_card_fields_and_filters(self):
        publish(_school('PUBP', 'Little Stars Nursery and Primary', education_category='basic',
                        region='Nord-Ouest', city_village='Bamenda'))
        publish(_school('PUBH', 'Hidden Draft'), publication_status=PublicationStatus.UNPUBLISHED)
        rows = self.client.get('/api/v1/schools/public/', {'detail': 1}).data
        self.assertEqual(len(rows), 2)
        row = next(r for r in rows if r['name'].startswith('Little Stars'))
        self.assertEqual(row['levels'], ['nursery', 'primary'])
        self.assertEqual(row['city_village'], 'Bamenda')
        for private in ('email', 'phone', 'principal', 'matricule'):
            self.assertNotIn(private, row)
        primary = self.client.get('/api/v1/schools/public/', {'detail': 1, 'level': 'primary'})
        self.assertEqual([r['name'] for r in primary.data], ['Little Stars Nursery and Primary'])
        self.assertEqual(primary['X-Total-Count'], '1')
        region = self.client.get('/api/v1/schools/public/', {'detail': 1, 'region': 'nord-ouest'})
        self.assertEqual(len(region.data), 1)
        found = self.client.get('/api/v1/schools/public/', {'detail': 1, 'q': 'bamenda'})
        self.assertEqual(len(found.data), 1)

    def test_contact_fields_hidden_by_default_and_shown_on_opt_in(self):
        data = self.client.get(self.url).data
        for field in ('principal', 'email', 'phone'):
            self.assertNotIn(field, data)
        self.assertNotIn('Dr. Principal', str(data))
        self.assertNotIn('puba@example.com', str(data))
        self.profile.show_email = True
        self.profile.show_phone = True
        self.profile.show_principal = True
        self.profile.save()
        data = self.client.get(self.url).data
        self.assertEqual(data['email'], 'puba@example.com')
        self.assertEqual(data['phone'], '237650900900')
        self.assertEqual(data['principal'], 'Dr. Principal')

    def test_each_toggle_is_independent(self):
        self.profile.show_phone = True
        self.profile.save()
        data = self.client.get(self.url).data
        self.assertIn('phone', data)
        self.assertNotIn('email', data)
        self.assertNotIn('principal', data)

    def test_bilingual_text_and_lang_resolution(self):
        self.profile.vision_en = 'Excellence'
        self.profile.vision_fr = 'Excellence en francais'
        self.profile.mission_en = 'Only English'
        self.profile.save()
        fr = self.client.get(self.url, {'lang': 'fr'}).data
        self.assertEqual(fr['text']['vision'], 'Excellence en francais')
        self.assertEqual(fr['text']['mission'], 'Only English')  # falls back to the other language
        self.assertEqual(fr['vision_en'], 'Excellence')
        self.assertEqual(self.client.get(self.url).data['text']['vision'], 'Excellence')

    def test_preview_token_shows_draft_with_noindex_and_no_store(self):
        draft = _school('PUBZ', 'Preview Draft School')
        profile = SchoolPublicProfile.objects.create(school=draft, preview_token='tok-123', vision_en='Draft vision')
        url = f'/api/v1/schools/public/{draft.public_slug}/'
        ok = self.client.get(url, {'preview': 'tok-123'})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data['vision_en'], 'Draft vision')
        self.assertTrue(ok.data['noindex'])
        self.assertEqual(ok['Cache-Control'], 'no-store')
        self.assertIn('noindex', ok['X-Robots-Tag'])
        self.assertEqual(self.client.get(url, {'preview': 'wrong'}).status_code, 404)
        self.assertEqual(self.client.get(url).status_code, 404)
        # a school with no token set never matches, not even an empty value
        profile.preview_token = ''
        profile.save()
        self.assertEqual(self.client.get(url, {'preview': ''}).status_code, 404)
        self.assertEqual(self.client.get(url, {'preview': 'tok-123'}).status_code, 404)
        # another school's token does not open this one
        SchoolPublicProfile.objects.filter(school=self.school).update(preview_token='other-tok')
        self.assertEqual(self.client.get(url, {'preview': 'other-tok'}).status_code, 404)

    def test_published_response_is_publicly_cacheable_briefly(self):
        response = self.client.get(self.url)
        self.assertTrue(response['Cache-Control'].startswith('public'))
        self.assertIn('max-age=60', response['Cache-Control'])

    def test_public_throttle_scope_configured(self):
        from apps.schools.public_profile import (
            PublicSchoolDirectoryView, PublicSchoolProfileView, PublicStaffDirectoryView)
        self.assertIn('public_site', settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'])
        for view in (PublicSchoolProfileView, PublicStaffDirectoryView, PublicSchoolDirectoryView):
            self.assertEqual(view.throttle_scope, 'public_site')

    def test_similar_names_get_distinct_addresses(self):
        other = _school('PUBB', "Saint Mary's Bilingual College")
        self.assertNotEqual(other.public_slug, self.school.public_slug)
        self.assertTrue(other.public_slug.startswith('saint-mary'))

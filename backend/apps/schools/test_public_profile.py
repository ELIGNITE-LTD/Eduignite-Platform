"""Public school profiles: reachable without signing in, and nothing private."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.schools.models import School, SchoolStatus

PRIVATE_FIELDS = {
    'id', 'matricule', 'status', 'subscription_status', 'subscription_amount', 'subscription_expires_on',
    'student_count', 'teacher_count', 'principal_user', 'is_drafted', 'settings', 'public_profile_enabled',
}


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
        self.client = APIClient()
        self.school = _school('PUBA', 'Saint Mary Bilingual College', motto='Knowledge and Service')

    def test_profile_loads_without_login(self):
        response = self.client.get(f'/api/v1/schools/public/{self.school.public_slug}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['name'], 'Saint Mary Bilingual College')
        self.assertEqual(response.data['motto'], 'Knowledge and Service')
        self.assertEqual(response.data['slug'], 'saint-mary-bilingual-college')

    def test_profile_exposes_no_private_or_account_fields(self):
        data = self.client.get(f'/api/v1/schools/public/{self.school.public_slug}/').data
        self.assertEqual(PRIVATE_FIELDS & set(data), set())
        self.assertNotIn(self.school.matricule, str(data))

    def test_unpublished_schools_are_not_found(self):
        pending = _school('PUBP', 'Pending Hill School', status=SchoolStatus.PENDING)
        hidden = _school('PUBH', 'Hidden Valley School', public_profile_enabled=False)
        drafted = _school('PUBD', 'Drafted Lake School', is_drafted=True)
        for school in (pending, hidden, drafted):
            response = self.client.get(f'/api/v1/schools/public/{school.public_slug}/')
            self.assertEqual(response.status_code, 404, school.name)

    def test_directory_lists_only_live_profiles(self):
        _school('PUBP2', 'Pending Two School', status=SchoolStatus.PENDING)
        response = self.client.get('/api/v1/schools/public/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['slug'] for row in response.data], [self.school.public_slug])

    def test_similar_names_get_distinct_addresses(self):
        other = _school('PUBB', "Saint Mary's Bilingual College")
        self.assertNotEqual(other.public_slug, self.school.public_slug)
        self.assertTrue(other.public_slug.startswith('saint-mary'))

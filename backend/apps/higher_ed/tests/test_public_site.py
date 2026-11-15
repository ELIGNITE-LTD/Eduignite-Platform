"""Public programmes/departments of a published higher-education site."""

from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.higher_ed.models import OrganizationalUnit, Programme
from apps.schools.models import PublicationStatus, School, SchoolPublicProfile, SchoolStatus


def make_school(sid, category='higher', published=True):
    school = School.objects.create(
        id=sid, name=f'Institution {sid}', short_name=sid, principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000', school_type='general',
        subsystem='anglophone', description='An institution.', status=SchoolStatus.ACTIVE,
        education_category=category)
    SchoolPublicProfile.objects.update_or_create(
        school=school,
        defaults={'publication_status': PublicationStatus.PUBLISHED if published else PublicationStatus.DRAFT})
    return school


def structure(school):
    faculty = OrganizationalUnit.objects.create(school=school, unit_type='faculty', name='Science')
    dept = OrganizationalUnit.objects.create(school=school, unit_type='department', name='Computer Science',
                                             parent=faculty)
    return faculty, dept


class PublicProgrammesTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.school = make_school('HEINST1')
        _, self.dept = structure(self.school)
        self.url = f'/api/v1/schools/public/{self.school.public_slug}/programmes/'

    def test_lists_active_programmes_only_with_no_sign_in(self):
        Programme.objects.create(school=self.school, department=self.dept, name='BSc Computer Science',
                                 award_level='licence', description='Three years.')
        Programme.objects.create(school=self.school, department=self.dept, name='Hidden', is_active=False)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual([r['name'] for r in res.json()], ['BSc Computer Science'])
        row = res.json()[0]
        self.assertEqual(row['department_name'], 'Computer Science')
        self.assertEqual(row['award_level_label'], 'Licence / Bachelor')
        self.assertEqual(row['description'], 'Three years.')
        self.assertNotIn('school', row)

    def test_departments_carry_their_faculty_and_skip_empty_ones(self):
        Programme.objects.create(school=self.school, department=self.dept, name='BSc CS')
        OrganizationalUnit.objects.create(school=self.school, unit_type='department', name='Empty Dept')
        res = self.client.get(f'/api/v1/schools/public/{self.school.public_slug}/departments/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), [{'id': str(self.dept.id), 'name': 'Computer Science', 'parent_name': 'Science'}])

    def test_unpublished_school_is_404(self):
        school = make_school('HEINST2', published=False)
        self.assertEqual(self.client.get(f'/api/v1/schools/public/{school.public_slug or "x"}/programmes/').status_code, 404)

    def test_non_higher_school_is_404(self):
        school = make_school('SECSCH1', category='secondary')
        self.assertEqual(self.client.get(f'/api/v1/schools/public/{school.public_slug or "x"}/programmes/').status_code, 404)

    def test_another_schools_programmes_never_leak(self):
        other = make_school('HEINST3')
        _, odept = structure(other)
        Programme.objects.create(school=other, department=odept, name='Other Programme')
        Programme.objects.create(school=self.school, department=self.dept, name='Mine')
        names = [r['name'] for r in self.client.get(self.url).json()]
        self.assertEqual(names, ['Mine'])

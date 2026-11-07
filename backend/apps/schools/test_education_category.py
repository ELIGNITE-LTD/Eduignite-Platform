"""Education category (basic / secondary / higher) on schools, plus basic-school sections."""

import re

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.config.cameroon_data import CLASS_LEVELS, EDUCATION_CATEGORIES
from apps.users.matricules import generate_school_user_matricule
from .models import School, SchoolClass, SchoolSettings

User = get_user_model()

SCHOOLS_URL = '/api/v1/schools/schools/'


def _school(school_id, name, **extra):
    fields = dict(
        id=school_id, name=name, short_name=school_id[:4], principal='Principal',
        location='Douala', email=f'{school_id.lower()}@example.com', phone='237650700700',
        school_type='general', subsystem='anglophone',
    )
    fields.update(extra)
    return School.objects.create(**fields)


def _payload(name, short_name, email, **extra):
    data = {
        'name': name, 'short_name': short_name, 'principal': 'Mme Principal',
        'location': 'Douala', 'email': email, 'phone': '237650800800',
        'school_type': 'general', 'subsystem': 'francophone',
    }
    data.update(extra)
    return data


class EducationCategoryModelTests(APITestCase):
    def test_all_three_categories_persist(self):
        for index, value in enumerate(['basic', 'secondary', 'higher']):
            school = _school(f'EC{index}', f'Category School {index}', education_category=value)
            school.refresh_from_db()
            self.assertEqual(school.education_category, value)

    def test_labels(self):
        self.assertEqual(
            dict(School.EDUCATION_CATEGORY_CHOICES),
            {'basic': 'Basic Education', 'secondary': 'Secondary Education', 'higher': 'Higher Education'},
        )

    def test_default_is_secondary_and_school_type_untouched(self):
        school = _school('ECDEF', 'Default Category School', school_type='technical')
        school.refresh_from_db()
        self.assertEqual(school.education_category, 'secondary')
        self.assertEqual(school.school_type, 'technical')

    def test_school_class_accepts_nursery_and_primary_cycles(self):
        school = _school('ECCYC', 'Cycle School', education_category='basic')
        for cycle in ('first', 'second', 'nursery', 'primary'):
            klass = SchoolClass.objects.create(school=school, name=f'Class {cycle}', cycle=cycle)
            klass.full_clean()
        self.assertEqual(SchoolClass.objects.create(school=school, name='Default').cycle, 'first')


class EducationCategoryApiTests(APITestCase):
    def setUp(self):
        self.ceo = User.objects.create_user(
            matricule='EDUCEO2601', name='Founder', email='founder@example.com',
            role='CEO', password='password123',
        )
        self.client.force_authenticate(self.ceo)

    def test_executive_creates_school_in_each_category(self):
        for index, value in enumerate(['basic', 'secondary', 'higher']):
            response = self.client.post(
                SCHOOLS_URL,
                _payload(f'Created {value} School', f'CR{value[:2].upper()}', f'created-{value}@example.com',
                         education_category=value),
                format='json',
            )
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(response.data['education_category'], value)
            self.assertEqual(School.objects.get(id=response.data['id']).education_category, value)

    def test_creating_without_category_defaults_to_secondary(self):
        response = self.client.post(
            SCHOOLS_URL, _payload('Legacy Style School', 'LEGS', 'legacy@example.com'), format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['education_category'], 'secondary')
        self.assertEqual(School.objects.get(id=response.data['id']).education_category, 'secondary')

    def test_invalid_category_rejected(self):
        response = self.client.post(
            SCHOOLS_URL,
            _payload('Bad Category School', 'BADC', 'bad@example.com', education_category='university'),
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('education_category', response.data['errors'])

    def test_list_and_detail_expose_category(self):
        school = _school('ECREAD', 'Readable School', education_category='basic')
        detail = self.client.get(f'{SCHOOLS_URL}{school.id}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['education_category'], 'basic')
        listing = self.client.get(SCHOOLS_URL)
        rows = listing.data.get('results', listing.data)
        self.assertEqual({r['id']: r['education_category'] for r in rows}[school.id], 'basic')

    def test_executive_can_change_category_school_admin_cannot(self):
        school = _school('ECUPD', 'Updatable School')
        admin = User.objects.create_user(
            matricule='ECUPD-ADMIN', name='Admin', email='ecupd-admin@example.com',
            role='SCHOOL_ADMIN', school=school, password='password123',
        )

        self.client.force_authenticate(admin)
        denied = self.client.patch(f'{SCHOOLS_URL}{school.id}/', {'education_category': 'basic'}, format='json')
        self.assertEqual(denied.status_code, 400, denied.data)
        self.assertIn('education_category', denied.data['errors'])
        school.refresh_from_db()
        self.assertEqual(school.education_category, 'secondary')

        # Re-sending the unchanged value, or editing other fields, is still fine for the admin.
        same = self.client.patch(f'{SCHOOLS_URL}{school.id}/', {'education_category': 'secondary'}, format='json')
        self.assertEqual(same.status_code, 200, same.data)
        other = self.client.patch(f'{SCHOOLS_URL}{school.id}/', {'motto': 'Onward'}, format='json')
        self.assertEqual(other.status_code, 200, other.data)

        self.client.force_authenticate(self.ceo)
        allowed = self.client.patch(f'{SCHOOLS_URL}{school.id}/', {'education_category': 'basic'}, format='json')
        self.assertEqual(allowed.status_code, 200, allowed.data)
        school.refresh_from_db()
        self.assertEqual(school.education_category, 'basic')

    def test_cameroon_config_serves_categories_and_basic_levels(self):
        self.client.force_authenticate(None)
        response = self.client.get('/api/v1/config/cameroon/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [c['value'] for c in response.data['education_categories']], ['basic', 'secondary', 'higher'],
        )
        self.assertEqual(response.data['education_categories'], EDUCATION_CATEGORIES)
        levels = response.data['class_levels']
        self.assertEqual([l['value'] for l in levels['anglophone_nursery']], ['nursery1', 'nursery2', 'nursery3'])
        self.assertEqual([l['value'] for l in levels['francophone_nursery']], ['ps', 'ms', 'gs'])
        self.assertEqual([l['value'] for l in levels['anglophone_primary']], [f'class{i}' for i in range(1, 7)])
        self.assertEqual(
            [l['value'] for l in levels['francophone_primary']], ['sil', 'cp', 'ce1', 'ce2', 'cm1', 'cm2'],
        )
        # Existing keys are untouched.
        self.assertEqual(len(CLASS_LEVELS['francophone_general']), 7)
        self.assertEqual(len(CLASS_LEVELS['anglophone_general']), 7)


class BasicSchoolSectionsTests(APITestCase):
    def setUp(self):
        self.ceo = User.objects.create_user(
            matricule='EDUCEO2602', name='Founder', email='founder2@example.com',
            role='CEO', password='password123',
        )
        self.client.force_authenticate(self.ceo)
        self.basic = _school('BSEC', 'Basic Sections School', education_category='basic')
        self.secondary = _school('SSEC', 'Secondary Sections School')

    def _patch(self, school, sections):
        return self.client.patch(
            f'/api/v1/schools/settings/{school.id}/', {'sections': sections}, format='json',
        )

    def test_basic_school_accepts_nursery_and_primary(self):
        for sections in (['nursery'], ['primary'], ['nursery', 'primary'], []):
            response = self._patch(self.basic, sections)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(SchoolSettings.objects.get(school=self.basic).sections, sections)

    def test_basic_school_rejects_other_sections(self):
        response = self._patch(self.basic, ['nursery', 'English'])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('sections', response.data['errors'])
        self.assertEqual(SchoolSettings.objects.get(school=self.basic).sections, [])

    def test_basic_school_rejects_non_list_sections(self):
        response = self._patch(self.basic, 'nursery')
        self.assertEqual(response.status_code, 400, response.data)

    def test_basic_school_deduplicates_sections(self):
        response = self._patch(self.basic, ['primary', 'primary', 'nursery'])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(SchoolSettings.objects.get(school=self.basic).sections, ['primary', 'nursery'])

    def test_secondary_school_sections_unchanged(self):
        response = self._patch(self.secondary, ['English', 'French', 'Bilingual'])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            SchoolSettings.objects.get(school=self.secondary).sections, ['English', 'French', 'Bilingual'],
        )


class BasicSchoolMatriculeTests(APITestCase):
    """Basic schools use the one authoritative matricule generator, unchanged."""

    def test_basic_school_admin_and_pupil_matricules_use_existing_formats(self):
        yy = timezone.now().strftime('%y')
        ceo = User.objects.create_user(
            matricule='EDUCEO2603', name='Founder', email='founder3@example.com',
            role='CEO', password='password123',
        )
        self.client.force_authenticate(ceo)
        response = self.client.post(
            SCHOOLS_URL,
            _payload('Little Stars Nursery and Primary School', 'LSNP', 'lsnp@example.com',
                     education_category='basic'),
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        school = School.objects.get(id=response.data['id'])

        self.assertRegex(school.matricule, rf'^[A-Z0-9]+\d{{2}}{yy}$')
        self.assertTrue(school.matricule.startswith('LSNP'))
        self.assertEqual(school.matricule, f'LSNP01{yy}')

        admin = school.principal_user
        self.assertEqual(admin.role, 'SCHOOL_ADMIN')
        self.assertEqual(admin.matricule, school.matricule)

        student_matricule = generate_school_user_matricule(school, 'STUDENT')
        self.assertEqual(student_matricule, f'{school.matricule}ST0001')
        pupil = User.objects.create_user(
            matricule=student_matricule, name='Pupil One', email='pupil.one@example.com',
            role='STUDENT', school=school, password='password123',
        )
        self.assertEqual(pupil.matricule, f'{school.matricule}ST0001')
        self.assertEqual(generate_school_user_matricule(school, 'STUDENT'), f'{school.matricule}ST0002')
        self.assertEqual(generate_school_user_matricule(school, 'TEACHER'), f'{school.matricule}TE001')

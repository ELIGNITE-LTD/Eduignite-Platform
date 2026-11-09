"""Sections (sub-schools) of a nursery/primary school: rename + guarded delete."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.schools.models import School, SchoolClass, SubSchool

User = get_user_model()
SUB_SCHOOLS = '/api/v1/schools/hierarchy/sub-schools/'


def make_school(sid, category):
    return School.objects.create(
        id=sid, name=f'School {sid}', short_name=sid, principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone', education_category=category,
    )


class BasicSectionsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.basic = make_school('SEC-B', 'basic')
        cls.secondary = make_school('SEC-S', 'secondary')
        cls.admin = User.objects.create_user(
            matricule='ADM-SEC-B', name='Head', email='head-b@example.org', role='SCHOOL_ADMIN',
            school=cls.basic, password='password123', is_license_paid=True,
        )
        cls.sec_admin = User.objects.create_user(
            matricule='ADM-SEC-S', name='Head S', email='head-s@example.org', role='SCHOOL_ADMIN',
            school=cls.secondary, password='password123', is_license_paid=True,
        )

    def test_create_rename_keeps_vice_principal_and_unique_name(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(SUB_SCHOOLS, {'name': 'Nursery Section'}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        sid = created.data['id']
        dup = self.client.post(SUB_SCHOOLS, {'name': 'nursery section'}, format='json')
        self.assertEqual(dup.status_code, 400)
        renamed = self.client.patch(f'{SUB_SCHOOLS}{sid}/', {'name': 'Anglophone Section'}, format='json')
        self.assertEqual(renamed.status_code, 200, renamed.data)
        self.assertEqual(renamed.data['name'], 'Anglophone Section')

    def test_vice_principal_untouched_when_only_renaming(self):
        self.client.force_authenticate(self.admin)
        teacher = User.objects.create_user(
            matricule='TCH-SEC-B', name='Teacher', email='t-b@example.org', role='TEACHER',
            school=self.basic, password='password123',
        )
        sub = SubSchool.objects.create(school=self.basic, name='French Section', vice_principal=teacher)
        response = self.client.patch(f'{SUB_SCHOOLS}{sub.id}/', {'name': 'Section Francophone'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        sub.refresh_from_db()
        self.assertEqual(sub.vice_principal_id, teacher.id)
        self.assertEqual(sub.name, 'Section Francophone')

    def test_delete_blocked_while_section_has_classes(self):
        self.client.force_authenticate(self.admin)
        sub = SubSchool.objects.create(school=self.basic, name='French Section')
        klass = SchoolClass.objects.create(school=self.basic, name='Class 1 F', sub_school=sub)
        blocked = self.client.delete(f'{SUB_SCHOOLS}{sub.id}/')
        self.assertEqual(blocked.status_code, 400)
        self.assertTrue(SubSchool.objects.filter(id=sub.id).exists())
        klass.delete()
        ok = self.client.delete(f'{SUB_SCHOOLS}{sub.id}/')
        self.assertEqual(ok.status_code, 204)

    def test_secondary_school_rename_is_ignored(self):
        self.client.force_authenticate(self.sec_admin)
        sub = SubSchool.objects.create(school=self.secondary, name='Lower Sixth')
        response = self.client.patch(f'{SUB_SCHOOLS}{sub.id}/', {'name': 'Renamed'}, format='json')
        self.assertEqual(response.status_code, 200)
        sub.refresh_from_db()
        self.assertEqual(sub.name, 'Lower Sixth')

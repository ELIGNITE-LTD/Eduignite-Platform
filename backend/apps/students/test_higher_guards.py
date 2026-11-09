"""Promotion, class ladder and section auto-sync must not run for higher-education institutions."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.schools.models import School, SubSchool, sync_sub_schools_for_school

User = get_user_model()
STUDENTS = '/api/v1/students/students/'
SECONDARY_SUMMARY = '/api/v1/schools/hierarchy/secondary-setup-summary/'
SECONDARY_QUICK = '/api/v1/schools/hierarchy/secondary/quick-setup/'


def make_school(sid, category, school_type='mixed', subsystem='bilingual'):
    return School.objects.create(
        id=sid, name=f'Guard {sid}', short_name=sid[:4], principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type=school_type, subsystem=subsystem, education_category=category,
    )


def admin_of(school):
    return User.objects.create_user(
        matricule=f'{school.id}-ADM', name='Admin', email=f'adm-{school.id.lower()}@example.org',
        role='SCHOOL_ADMIN', school=school, password='password123')


class PromotionGuardTests(APITestCase):
    def setUp(self):
        self.higher = make_school('GD-HIGH', 'higher')
        self.secondary = make_school('GD-SEC', 'secondary')

    def test_promotion_endpoints_refuse_higher(self):
        self.client.force_authenticate(admin_of(self.higher))
        for method, path in [
            ('get', 'promotions/'),
            ('post', 'recalculate-promotions/'),
            ('post', 'bulk-move/'),
            ('post', 'bulk-promote-selected/'),
            ('post', 'bulk-repeat-selected/'),
            ('get', 'basic-promotion/preview/'),
        ]:
            response = getattr(self.client, method)(STUDENTS + path, {}, format='json')
            self.assertEqual(response.status_code, 403, path)

    def test_basic_promotion_confirm_is_refused_for_higher(self):
        # Already refused by the basic-only check (400); it must never apply to a higher school.
        self.client.force_authenticate(admin_of(self.higher))
        response = self.client.post(STUDENTS + 'basic-promotion/confirm/', {}, format='json')
        self.assertIn(response.status_code, (400, 403))

    def test_secondary_promotions_still_work(self):
        self.client.force_authenticate(admin_of(self.secondary))
        response = self.client.get(STUDENTS + 'promotions/')
        self.assertEqual(response.status_code, 200)


class LadderAndSectionGuardTests(APITestCase):
    def test_secondary_ladder_refused_for_higher_but_open_for_secondary(self):
        higher = make_school('GD-H2', 'higher')
        self.client.force_authenticate(admin_of(higher))
        self.assertEqual(self.client.get(SECONDARY_SUMMARY).status_code, 403)
        self.assertEqual(self.client.post(SECONDARY_QUICK, {}, format='json').status_code, 403)
        secondary = make_school('GD-S2', 'secondary')
        self.client.force_authenticate(admin_of(secondary))
        self.assertEqual(self.client.get(SECONDARY_SUMMARY).status_code, 200)

    def test_section_auto_sync_skips_higher_and_still_runs_for_secondary(self):
        higher = make_school('GD-H3', 'higher')
        self.assertEqual(SubSchool.objects.filter(school=higher).count(), 0)
        sync_sub_schools_for_school(higher)
        self.assertEqual(SubSchool.objects.filter(school=higher).count(), 0)
        secondary = make_school('GD-S3', 'secondary')
        self.assertEqual(SubSchool.objects.filter(school=secondary, is_system_managed=True).count(), 4)

    def test_higher_manual_sections_are_not_deleted_by_sync(self):
        higher = make_school('GD-H4', 'higher', school_type='general', subsystem='anglophone')
        SubSchool.objects.create(school=higher, name='Legacy', is_system_managed=True)
        sync_sub_schools_for_school(higher)
        self.assertTrue(SubSchool.objects.filter(school=higher, name='Legacy').exists())

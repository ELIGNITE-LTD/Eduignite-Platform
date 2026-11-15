"""WhatsApp, Mobile Money and MINESUP accreditation on the public school profile."""

from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.schools.models import PublicationStatus, PublicSiteAuditLog, SchoolPublicProfile
from apps.schools.test_public_site_management import make_school, make_user

BASE = '/api/v1/schools/public-site/'


class ProfileExtrasTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = make_school('PXA')
        cls.b = make_school('PXB')
        cls.admin_a = make_user('ADM-PXA', 'SCHOOL_ADMIN', cls.a)
        cls.admin_b = make_user('ADM-PXB', 'SCHOOL_ADMIN', cls.b)
        cls.ceo = make_user('CEO-PX', 'CEO')

    def setUp(self):
        cache.clear()

    def patch(self, user, body):
        self.client.force_authenticate(user)
        return self.client.patch(BASE + 'profile/', body, format='json')

    def publish(self, school):
        SchoolPublicProfile.objects.update_or_create(
            school=school, defaults={'publication_status': PublicationStatus.PUBLISHED})

    def public(self, slug):
        self.client.force_authenticate(None)
        return self.client.get(f'/api/v1/schools/public/{slug}/')

    def founder_post(self, action, school='PXA'):
        self.client.force_authenticate(self.ceo)
        return self.client.post(f'{BASE}schools/{school}/accreditation/{action}/')

    def test_numbers_are_normalised_to_digits(self):
        r = self.patch(self.admin_a, {'whatsapp_number': '+237 6 70 00 00 00', 'momo_number': '670000001',
                                      'orange_money_number': '00237 69 000 0002'})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['whatsapp_number'], '237670000000')
        self.assertEqual(r.data['momo_number'], '237670000001')
        self.assertEqual(r.data['orange_money_number'], '237690000002')

    def test_bad_number_rejected(self):
        self.assertEqual(self.patch(self.admin_a, {'whatsapp_number': '12'}).status_code, 400)
        self.assertEqual(self.patch(self.admin_a, {'momo_number': '2376700'}).status_code, 400)

    def test_public_exposure(self):
        self.patch(self.admin_a, {'whatsapp_number': '237670000000', 'momo_number': '237670000001',
                                  'payment_note': 'Use your name as reference',
                                  'accreditation_level': 'approved', 'accreditation_reference': 'Arrete 123',
                                  'accreditation_date': '2020-05-01'})
        self.publish(self.a)
        data = self.public(self.a.public_slug).data
        self.assertEqual(data['whatsapp_number'], '237670000000')
        self.assertEqual(data['momo_number'], '237670000001')
        self.assertEqual(data['payment_note'], 'Use your name as reference')
        self.assertEqual(data['accreditation'], {'level': 'approved', 'reference': 'Arrete 123',
                                                 'date': '2020-05-01', 'verified': False})

    def test_admin_cannot_set_verified(self):
        r = self.patch(self.admin_a, {'accreditation_verified': True})
        self.assertEqual(r.status_code, 400)

    def test_change_resets_verification(self):
        self.patch(self.admin_a, {'accreditation_level': 'approved', 'accreditation_reference': 'R1'})
        self.assertEqual(self.founder_post('verify').status_code, 200)
        p = SchoolPublicProfile.objects.get(school=self.a)
        self.assertTrue(p.accreditation_verified)
        self.assertEqual(p.accreditation_verified_by, self.ceo)
        # Unrelated edit keeps it; accreditation edit resets it.
        self.patch(self.admin_a, {'vision_en': 'x'})
        p.refresh_from_db()
        self.assertTrue(p.accreditation_verified)
        self.patch(self.admin_a, {'accreditation_reference': 'R2'})
        p.refresh_from_db()
        self.assertFalse(p.accreditation_verified)
        self.assertIsNone(p.accreditation_verified_by)
        self.assertIsNone(p.accreditation_verified_at)

    def test_public_verified_only_when_flag_set(self):
        self.patch(self.admin_a, {'accreditation_level': 'homologated', 'accreditation_reference': 'R1'})
        self.publish(self.a)
        self.assertFalse(self.public(self.a.public_slug).data['accreditation']['verified'])
        self.founder_post('verify')
        self.assertTrue(self.public(self.a.public_slug).data['accreditation']['verified'])
        self.founder_post('unverify')
        self.assertFalse(self.public(self.a.public_slug).data['accreditation']['verified'])

    def test_non_founder_forbidden(self):
        self.patch(self.admin_a, {'accreditation_level': 'approved', 'accreditation_reference': 'R1'})
        for user in (self.admin_a, self.admin_b):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(f'{BASE}schools/PXA/accreditation/verify/').status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(f'{BASE}schools/PXA/accreditation/verify/').status_code, (401, 403))
        self.assertFalse(SchoolPublicProfile.objects.get(school=self.a).accreditation_verified)

    def test_cannot_verify_undeclared(self):
        self.assertEqual(self.founder_post('verify').status_code, 400)

    def test_isolation_between_schools(self):
        self.patch(self.admin_a, {'whatsapp_number': '237670000000', 'accreditation_level': 'approved',
                                  'accreditation_reference': 'R1'})
        self.founder_post('verify')
        self.publish(self.b)
        data = self.public(self.b.public_slug).data
        self.assertEqual(data['whatsapp_number'], '')
        self.assertEqual(data['accreditation']['level'], 'none')
        self.assertFalse(data['accreditation']['verified'])
        # School B's admin cannot touch school A's settings.
        r = self.patch(self.admin_b, {'school': 'PXA', 'whatsapp_number': '237670000009'})
        self.assertEqual(r.status_code, 403)

    def test_audit_log(self):
        self.patch(self.admin_a, {'accreditation_level': 'approved', 'accreditation_reference': 'R1'})
        self.founder_post('verify')
        self.patch(self.admin_a, {'accreditation_reference': 'R2'})
        self.founder_post('verify')
        self.founder_post('unverify')
        rows = PublicSiteAuditLog.objects.filter(school=self.a).order_by('created_at')
        self.assertEqual([r.action for r in rows], [
            'profile_updated', 'accreditation_verified', 'profile_updated',
            'accreditation_verified', 'accreditation_unverified'])
        self.assertEqual(rows[1].actor, self.ceo)
        self.assertEqual(rows[2].changes['accreditation_verified']['after'], 'False')

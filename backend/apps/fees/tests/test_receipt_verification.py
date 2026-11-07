"""QR verification of printed fee receipts."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.fees.models import Payment
from apps.fees.serializers import PaymentDetailSerializer
from apps.fees.utils import receipt_verify_token
from apps.schools.models import School

User = get_user_model()


class ReceiptVerificationTests(APITestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='RCP', name='Receipt College', short_name='RC', principal='P', location='Yde',
            email='rc@example.com', phone='237651000113', school_type='general', subsystem='anglophone',
        )
        self.payer = User.objects.create_user(
            matricule='RCPST0001', name='Secret Pupil', email='secret@example.com',
            role='STUDENT', school=self.school, password='password123',
        )
        self.payment = Payment.objects.create(
            school=self.school, payer=self.payer, amount=65000, payment_method='cash',
            status='confirmed', payment_date=date(2026, 11, 7), receipt_number='REC-20261107-00001',
        )

    def _url(self, token):
        return f'/api/v1/fees/verify-receipt/{token}/'

    def test_genuine_receipt_verifies_without_login_and_hides_payer(self):
        r = self.client.get(self._url(receipt_verify_token(self.payment)))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.data['valid'])
        self.assertEqual(r.data['receipt_number'], 'REC-20261107-00001')
        self.assertEqual(r.data['amount'], 65000.0)
        self.assertEqual(r.data['school_name'], 'Receipt College')
        body = r.content.decode()
        for secret in ('Secret Pupil', 'RCPST0001', 'secret@example.com', self.payment.reference_number, 'cash'):
            self.assertNotIn(secret, body)

    def test_forged_or_tampered_token_is_rejected(self):
        good = receipt_verify_token(self.payment)
        self.assertEqual(self.client.get(self._url(good[:-2] + 'xx')).status_code, 404)
        self.assertEqual(self.client.get(self._url('REC-20261107-00001')).status_code, 404)

    def test_refunded_receipt_is_not_valid(self):
        Payment.objects.filter(pk=self.payment.pk).update(status='refunded')
        r = self.client.get(self._url(receipt_verify_token(self.payment)))
        self.assertFalse(r.data['valid'])

    def test_serializer_exposes_qr_only_for_confirmed_receipts(self):
        data = PaymentDetailSerializer(self.payment).data
        self.assertTrue(data['verify_url'].startswith('http') and '/verify/receipt/' in data['verify_url'])
        self.assertTrue(data['qr_code'].startswith('data:image/png;base64,'))
        Payment.objects.filter(pk=self.payment.pk).update(status='pending')
        self.payment.refresh_from_db()
        self.assertEqual(PaymentDetailSerializer(self.payment).data['verify_url'], '')

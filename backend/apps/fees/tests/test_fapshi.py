"""The ways a payment gateway loses or invents money, and why none of them work here.

Each test is one of the three failures the integration exists to prevent: a
fake payment, an incomplete one, and a double one. Fapshi is never actually
called - it is patched - because what is being proved is our behaviour given
each answer Fapshi can give, not Fapshi's own correctness.
"""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.fees import fapshi
from apps.fees.fapshi_views import sync_transaction
from apps.fees.models import GatewayTransaction, Payment
from apps.schools.models import School

User = get_user_model()

SECRET = 'a-webhook-secret-for-tests'

WEBHOOK_URL = '/api/v1/fees/fapshi/webhook/'


def fapshi_says(status, amount=5000, **extra):
    """A Fapshi transaction object, as payment-status returns it."""
    return {
        'transId': 'FAPSHI-TXN-1',
        'status': status,
        'amount': amount,
        'medium': 'mobile money',
        'externalId': 'EI-TEST',
        'financialTransId': 'OPERATOR-REF-9',
        **extra,
    }


@override_settings(
    FAPSHI_API_USER='test-user',
    FAPSHI_API_KEY='test-key',
    FAPSHI_WEBHOOK_SECRET=SECRET,
    FAPSHI_BASE_URL='https://sandbox.fapshi.com',
)
class FapshiPaymentSafetyTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(
            id='GHS-TEST',
            name='Government High School',
            short_name='GHS',
            principal='The Principal',
            location='Bamenda',
            email='ghs-fapshi@example.com',
        )
        self.payer = User.objects.create_user(
            matricule='STU-900',
            name='A Student',
            email='payer@example.com',
            role='STUDENT',
            password='not-a-real-password',
        )
        self.payer.school = self.school
        self.payer.save(update_fields=['school'])

        self.txn = GatewayTransaction.objects.create(
            provider=GatewayTransaction.PROVIDER_FAPSHI,
            purpose=GatewayTransaction.PURPOSE_PLATFORM,
            school=self.school,
            initiated_by=self.payer,
            beneficiary=self.payer,
            amount=Decimal('5000.00'),
            currency='XAF',
            phone_number='670000000',
            transaction_id='EI-TEST',
            provider_transaction_id='FAPSHI-TXN-1',
            status=GatewayTransaction.STATUS_PENDING,
        )
        self.api = APIClient()

    # ---- A fake payment ---------------------------------------------------

    def test_a_webhook_without_the_secret_is_refused(self):
        response = self.api.post(WEBHOOK_URL, data=fapshi_says('SUCCESSFUL'), format='json')

        self.assertEqual(response.status_code, 401)
        self.txn.refresh_from_db()
        self.assertFalse(self.txn.processed)
        self.assertEqual(Payment.objects.count(), 0)

    def test_a_webhook_with_the_wrong_secret_is_refused(self):
        response = self.api.post(
            WEBHOOK_URL,
            data=fapshi_says('SUCCESSFUL'),
            format='json',
            headers={'x-wh-secret': 'not-the-secret'},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(Payment.objects.count(), 0)

    @patch('apps.fees.fapshi.payment_status')
    def test_a_webhook_claiming_success_is_not_believed(self, payment_status):
        """The body is not evidence: Fapshi is asked, and Fapshi says pending."""
        payment_status.return_value = fapshi_says('PENDING')

        response = self.api.post(
            WEBHOOK_URL,
            data=fapshi_says('SUCCESSFUL'),
            format='json',
            headers={'x-wh-secret': SECRET},
        )

        self.assertEqual(response.status_code, 200)
        payment_status.assert_called_once_with('FAPSHI-TXN-1')
        self.txn.refresh_from_db()
        self.assertFalse(self.txn.processed)
        self.assertEqual(Payment.objects.count(), 0)

    @override_settings(FAPSHI_WEBHOOK_SECRET='')
    def test_webhooks_are_refused_when_no_secret_is_configured(self):
        """An open endpoint on the public internet is not trusted by default."""
        response = self.api.post(WEBHOOK_URL, data=fapshi_says('SUCCESSFUL'), format='json')

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Payment.objects.count(), 0)

    # ---- An incomplete payment -------------------------------------------

    @patch('apps.fees.fapshi.payment_status')
    def test_a_short_payment_is_never_credited(self, payment_status):
        payment_status.return_value = fapshi_says('SUCCESSFUL', amount=1000)

        sync_transaction(self.txn)

        self.txn.refresh_from_db()
        self.assertFalse(self.txn.processed)
        self.assertEqual(Payment.objects.count(), 0)
        self.assertIn('1000', self.txn.status_reason)

    @patch('apps.fees.fapshi.payment_status')
    def test_an_unreadable_amount_is_never_credited(self, payment_status):
        payment_status.return_value = fapshi_says('SUCCESSFUL', amount=None)

        sync_transaction(self.txn)

        self.txn.refresh_from_db()
        self.assertFalse(self.txn.processed)
        self.assertEqual(Payment.objects.count(), 0)

    @patch('apps.fees.fapshi.payment_status')
    def test_paying_more_than_asked_still_settles(self, payment_status):
        """An overpayment is the payer's money, not a reason to withhold what they bought."""
        payment_status.return_value = fapshi_says('SUCCESSFUL', amount=6000)

        sync_transaction(self.txn)

        self.txn.refresh_from_db()
        self.assertTrue(self.txn.processed)

    # ---- A double payment -------------------------------------------------

    @patch('apps.fees.fapshi.payment_status')
    def test_the_same_webhook_twice_creates_one_payment(self, payment_status):
        payment_status.return_value = fapshi_says('SUCCESSFUL')

        for _ in range(2):
            self.api.post(
                WEBHOOK_URL,
                data=fapshi_says('SUCCESSFUL'),
                format='json',
                headers={'x-wh-secret': SECRET},
            )

        self.txn.refresh_from_db()
        self.assertTrue(self.txn.processed)
        self.assertEqual(Payment.objects.count(), 1)

    @patch('apps.fees.fapshi.payment_status')
    def test_a_webhook_and_a_reconciliation_together_create_one_payment(self, payment_status):
        """The realistic race: the safety net runs while the webhook arrives."""
        payment_status.return_value = fapshi_says('SUCCESSFUL')

        self.api.post(
            WEBHOOK_URL,
            data=fapshi_says('SUCCESSFUL'),
            format='json',
            headers={'x-wh-secret': SECRET},
        )
        sync_transaction(GatewayTransaction.objects.get(pk=self.txn.pk))

        self.assertEqual(Payment.objects.count(), 1)

    # ---- States that are not a payment ------------------------------------

    @patch('apps.fees.fapshi.payment_status')
    def test_a_failed_payment_credits_nothing(self, payment_status):
        payment_status.return_value = fapshi_says('FAILED', reason='Insufficient funds')

        sync_transaction(self.txn)

        self.txn.refresh_from_db()
        self.assertEqual(self.txn.status, GatewayTransaction.STATUS_FAILED)
        self.assertEqual(Payment.objects.count(), 0)

    @patch('apps.fees.fapshi.payment_status')
    def test_an_expired_link_is_cancelled_not_failed(self, payment_status):
        """Nothing went wrong; the payer just never finished."""
        payment_status.return_value = fapshi_says('EXPIRED')

        sync_transaction(self.txn)

        self.txn.refresh_from_db()
        self.assertEqual(self.txn.status, GatewayTransaction.STATUS_CANCELLED)
        self.assertEqual(Payment.objects.count(), 0)

    @patch('apps.fees.fapshi.payment_status')
    def test_an_unknown_status_is_treated_as_pending(self, payment_status):
        """Never success, never written off: leave it for the next check."""
        payment_status.return_value = fapshi_says('SOMETHING-NEW')

        sync_transaction(self.txn)

        self.txn.refresh_from_db()
        self.assertEqual(self.txn.status, GatewayTransaction.STATUS_PENDING)
        self.assertEqual(Payment.objects.count(), 0)

    @patch('apps.fees.fapshi.payment_status')
    def test_an_unreachable_gateway_leaves_the_payment_pending(self, payment_status):
        """A network failure is not a decision about someone's money."""
        payment_status.side_effect = fapshi.FapshiError('connection reset')

        with self.assertRaises(fapshi.FapshiError):
            sync_transaction(self.txn)

        self.txn.refresh_from_db()
        self.assertEqual(self.txn.status, GatewayTransaction.STATUS_PENDING)
        self.assertEqual(Payment.objects.count(), 0)


class FapshiStatusMappingTests(TestCase):
    def test_every_fapshi_state_maps_somewhere_sensible(self):
        self.assertEqual(fapshi.normalize_status({'status': 'CREATED'}), 'PENDING')
        self.assertEqual(fapshi.normalize_status({'status': 'PENDING'}), 'PENDING')
        self.assertEqual(fapshi.normalize_status({'status': 'SUCCESSFUL'}), 'SUCCESS')
        self.assertEqual(fapshi.normalize_status({'status': 'FAILED'}), 'FAILED')
        self.assertEqual(fapshi.normalize_status({'status': 'EXPIRED'}), 'CANCELLED')

    def test_nonsense_is_pending_rather_than_paid(self):
        self.assertEqual(fapshi.normalize_status({}), 'PENDING')
        self.assertEqual(fapshi.normalize_status(None), 'PENDING')
        self.assertEqual(fapshi.normalize_status({'status': ''}), 'PENDING')

    def test_the_operator_is_named_as_fapshi_names_it(self):
        self.assertEqual(fapshi.resolve_medium('MTN'), fapshi.MEDIUM_MTN)
        self.assertEqual(fapshi.resolve_medium('orange'), fapshi.MEDIUM_ORANGE)
        # Unknown is left to Fapshi to work out from the number.
        self.assertIsNone(fapshi.resolve_medium('carrier-pigeon'))

@override_settings(
    FAPSHI_API_USER='test-user',
    FAPSHI_API_KEY='test-key',
    FAPSHI_WEBHOOK_SECRET=SECRET,
)
class PayingForSomeoneElseTests(TestCase):
    """Who may pay for whom.

    A payment credited to the wrong account is money chased back by hand, so
    the rules are the same ones the gateway has always used rather than
    something looser.
    """

    def setUp(self):
        self.school = School.objects.create(
            id='GHS-PAY',
            name='Government High School',
            short_name='GHS',
            principal='The Principal',
            location='Bamenda',
            email='ghs-pay@example.com',
        )
        self.other_school = School.objects.create(
            id='OTHER-SCH',
            name='Another School',
            short_name='ASC',
            principal='Someone Else',
            location='Buea',
            email='other@example.com',
        )
        self.student = User.objects.create_user(
            matricule='STU-901', name='A Student', email='s901@example.com',
            role='STUDENT', password='not-a-real-password',
        )
        self.student.school = self.other_school
        self.student.save(update_fields=['school'])

        self.bursar = User.objects.create_user(
            matricule='BUR-901', name='A Bursar', email='b901@example.com',
            role='BURSAR', password='not-a-real-password',
        )
        self.bursar.school = self.school
        self.bursar.save(update_fields=['school'])

        self.api = APIClient()

    def test_staff_cannot_pay_for_a_student_of_another_school(self):
        self.api.force_authenticate(user=self.bursar)

        response = self.api.post(
            '/api/v1/fees/fapshi/collect/',
            data={'phone': '670000000', 'student_id': str(self.student.id)},
            format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(GatewayTransaction.objects.count(), 0)

    def test_a_student_cannot_pay_for_another_student(self):
        stranger = User.objects.create_user(
            matricule='STU-902', name='Another Student', email='s902@example.com',
            role='STUDENT', password='not-a-real-password',
        )
        self.api.force_authenticate(user=stranger)

        response = self.api.post(
            '/api/v1/fees/fapshi/collect/',
            data={'phone': '670000000', 'student_id': str(self.student.id)},
            format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(GatewayTransaction.objects.count(), 0)

    def test_a_price_named_by_the_client_is_ignored(self):
        """A subscription cannot be bought for one franc."""
        self.api.force_authenticate(user=self.student)

        with patch('apps.fees.fapshi.direct_pay') as direct_pay:
            direct_pay.return_value = {'transId': 'FAPSHI-TXN-9'}
            self.api.post(
                '/api/v1/fees/fapshi/collect/',
                data={'phone': '670000000', 'amount': 1},
                format='json',
            )

        txn = GatewayTransaction.objects.first()
        if txn is not None:
            # Whatever was charged, it was not the one franc the client asked for.
            self.assertNotEqual(int(txn.amount), 1)

"""A recorded payment has to reach the student's ledger.

The Fee Records tab reads the ledger, not the payments. Before this, a bursar
could take money, record it and print a receipt while the ledger went on saying
the student had paid nothing, because the two were never connected.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.fees.ledger import credit_payment_to_school_fees
from apps.fees.models import (
    FeeStructure,
    Payment,
    SchoolFeeAssignment,
    StudentSchoolFeeRecord,
)
from apps.registry import api as registry_api
from apps.schools.models import School, SchoolClass
from apps.students.models import Student

User = get_user_model()


class FeeFixtures:
    """The school, student, bursar and fee every test here needs."""

    def setUp(self):
        self.school = School.objects.create(
            # A school's id is its own code, supplied not generated.
            id='GHS-BDA',
            name='Government High School',
            short_name='GHS',
            principal='The Principal',
            location='Bamenda',
            email='ghs@example.com',
        )
        self.school_class = SchoolClass.objects.create(school=self.school, name='Form 5')

        self.student_user = User.objects.create_user(
            matricule='STU-001',
            name='A Student',
            email='student@example.com',
            role='STUDENT',
            password='not-a-real-password',
        )
        self.student = Student.objects.create(
            user=self.student_user,
            school=self.school,
            student_class='Form 5',
            admission_number='ADM-001',
        )
        self.bursar = User.objects.create_user(
            matricule='BUR-001',
            name='A Bursar',
            email='bursar2@example.com',
            role='BURSAR',
            password='not-a-real-password',
        )

        self.fee = FeeStructure.objects.create(
            school=self.school,
            name='Tuition',
            amount=Decimal('50000.00'),
            academic_year='2025-2026',
        )

    def _assignment(self, academic_year, amount):
        return SchoolFeeAssignment.objects.create(
            school=self.school,
            school_class=self.school_class,
            academic_year=academic_year,
            amount=Decimal(amount),
        )

    def _record(self, assignment):
        return StudentSchoolFeeRecord.objects.create(
            school=self.school,
            fee_assignment=assignment,
            student=self.student,
            total_amount=assignment.amount,
        )

    def _payment(self, amount, fee_structure=None):
        return Payment.objects.create(
            school=self.school,
            payer=self.student_user,
            fee_structure=self.fee if fee_structure is None else fee_structure,
            amount=Decimal(amount),
            payment_method='cash',
            payment_date=date.today(),
        )

class CreditPaymentToLedgerTests(FeeFixtures, TestCase):
    """The arithmetic of putting a payment onto the ledger."""

    def test_a_part_payment_shows_on_the_ledger(self):
        record = self._record(self._assignment('2025-2026', '50000.00'))
        self.assertEqual(record.status, StudentSchoolFeeRecord.STATUS_UNPAID)

        credit_payment_to_school_fees(self._payment('20000.00'), actor=self.bursar)

        record.refresh_from_db()
        self.assertEqual(record.amount_paid, Decimal('20000.00'))
        self.assertEqual(record.balance, Decimal('30000.00'))
        self.assertEqual(record.status, StudentSchoolFeeRecord.STATUS_INCOMPLETE)
        self.assertEqual(record.updated_by, self.bursar)

    def test_paying_the_rest_settles_it(self):
        record = self._record(self._assignment('2025-2026', '50000.00'))

        credit_payment_to_school_fees(self._payment('20000.00'), actor=self.bursar)
        credit_payment_to_school_fees(self._payment('30000.00'), actor=self.bursar)

        record.refresh_from_db()
        self.assertEqual(record.amount_paid, Decimal('50000.00'))
        self.assertEqual(record.balance, Decimal('0.00'))
        self.assertEqual(record.status, StudentSchoolFeeRecord.STATUS_PAID)

    def test_last_years_balance_is_cleared_first(self):
        old = self._record(self._assignment('2024-2025', '10000.00'))
        current = self._record(self._assignment('2025-2026', '50000.00'))

        credit_payment_to_school_fees(self._payment('25000.00'), actor=self.bursar)

        old.refresh_from_db()
        current.refresh_from_db()
        self.assertEqual(old.amount_paid, Decimal('10000.00'))
        self.assertEqual(old.status, StudentSchoolFeeRecord.STATUS_PAID)
        self.assertEqual(current.amount_paid, Decimal('15000.00'))
        self.assertEqual(current.status, StudentSchoolFeeRecord.STATUS_INCOMPLETE)

    def test_more_than_is_owed_never_overfills_a_record(self):
        record = self._record(self._assignment('2025-2026', '50000.00'))

        credit_payment_to_school_fees(self._payment('80000.00'), actor=self.bursar)

        record.refresh_from_db()
        # The overpayment stays on the payment, which is the record of what was
        # actually handed over. The ledger only ever shows what was owed.
        self.assertEqual(record.amount_paid, Decimal('50000.00'))
        self.assertEqual(record.balance, Decimal('0.00'))
        self.assertEqual(record.status, StudentSchoolFeeRecord.STATUS_PAID)

    def test_a_platform_subscription_is_not_a_school_fee(self):
        record = self._record(self._assignment('2025-2026', '50000.00'))

        payment = Payment.objects.create(
            school=self.school,
            payer=self.student_user,
            fee_structure=None,
            amount=Decimal('5000.00'),
            payment_method='cash',
            payment_date=date.today(),
        )
        credited = credit_payment_to_school_fees(payment, actor=self.bursar)

        record.refresh_from_db()
        self.assertEqual(credited, [])
        self.assertEqual(record.amount_paid, Decimal('0.00'))
        self.assertEqual(record.status, StudentSchoolFeeRecord.STATUS_UNPAID)

class RecordingAFeeOnlyOnceTests(FeeFixtures, TestCase):
    """A fee is recorded once.

    Hiding a settled fee in the dropdown is presentation. This is the rule
    that actually holds: against a stale screen, a double tap, two bursars
    working at once, and an offline payment arriving late.
    """

    def setUp(self):
        super().setUp()
        self.student_user.is_license_paid = True
        self.student_user.save(update_fields=['is_license_paid'])
        registry_api.install(self.school, 'fees')
        self.bursar.school = self.school
        self.bursar.save(update_fields=['school'])
        self.api = APIClient()
        self.api.force_authenticate(user=self.bursar)

    def _post_payment(self, amount):
        return self.api.post(
            '/api/v1/fees/payments/',
            data={
                'payer': str(self.student_user.id),
                'fee_structure': str(self.fee.id),
                'amount': amount,
                'payment_method': 'cash',
                'payment_date': str(date.today()),
            },
            format='json',
        )

    def test_the_same_fee_cannot_be_recorded_twice(self):
        first = self._post_payment('50000.00')
        self.assertEqual(first.status_code, 201, first.content[:300])

        second = self._post_payment('50000.00')
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data.get('code'), 'fee_already_paid')
        self.assertEqual(Payment.objects.filter(fee_structure=self.fee).count(), 1)

    def test_an_unconfirmed_payment_still_blocks_a_second_one(self):
        """The money was taken; waiting on confirmation is not an opening."""
        self._post_payment('50000.00')
        self.assertEqual(Payment.objects.get(fee_structure=self.fee).status, 'pending')

        second = self._post_payment('50000.00')
        self.assertEqual(second.status_code, 400)

    def test_a_fee_can_still_be_paid_in_parts(self):
        """Schools collect in instalments; what is refused is paying twice over."""
        self.assertEqual(self._post_payment('20000.00').status_code, 201)
        self.assertEqual(self._post_payment('30000.00').status_code, 201)

        blocked = self._post_payment('1000.00')
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.data.get('code'), 'fee_already_paid')

    def test_more_than_is_left_is_refused(self):
        self._post_payment('40000.00')

        too_much = self._post_payment('20000.00')
        self.assertEqual(too_much.status_code, 400)
        self.assertEqual(too_much.data.get('code'), 'amount_exceeds_outstanding')

    def test_the_screen_can_see_what_is_left(self):
        self._post_payment('20000.00')

        response = self.api.get(
            '/api/v1/fees/payments/student-fee-status/',
            {'student': str(self.student_user.id)},
        )
        self.assertEqual(response.status_code, 200, response.content[:300])

        row = next(r for r in response.data['results'] if r['fee_structure'] == str(self.fee.id))
        self.assertEqual(Decimal(row['paid']), Decimal('20000.00'))
        self.assertEqual(Decimal(row['outstanding']), Decimal('30000.00'))
        self.assertEqual(row['status'], 'incomplete')

    def test_a_settled_fee_reads_as_settled(self):
        self._post_payment('50000.00')

        response = self.api.get(
            '/api/v1/fees/payments/student-fee-status/',
            {'student': str(self.student_user.id)},
        )
        row = next(r for r in response.data['results'] if r['fee_structure'] == str(self.fee.id))
        self.assertEqual(Decimal(row['outstanding']), Decimal('0.00'))
        self.assertEqual(row['status'], 'paid')


class ConfirmPaymentEndpointTests(FeeFixtures, TestCase):
    """The same thing, but through the endpoint a bursar actually hits.

    The tests above prove the arithmetic. This one proves the wiring: that
    confirming a payment the way the app does it really does reach the
    ledger, which is what was broken.
    """

    def test_confirming_a_payment_puts_it_on_the_ledger(self):
        record = self._record(self._assignment('2025-2026', '50000.00'))
        payment = self._payment('20000.00')

        # The student must be clear of platform charges to be confirmable.
        self.student_user.is_license_paid = True
        self.student_user.save(update_fields=['is_license_paid'])

        # Fees is a licensed app, so the school has to hold it, and the
        # bursar has to belong to that school for the licence to apply.
        registry_api.install(self.school, 'fees')
        self.bursar.school = self.school
        self.bursar.save(update_fields=['school'])

        api = APIClient()
        api.force_authenticate(user=self.bursar)
        response = api.post(
            f'/api/v1/fees/payments/{payment.id}/confirm/',
            data={},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.content[:400])

        payment.refresh_from_db()
        record.refresh_from_db()
        self.assertEqual(payment.status, 'confirmed')
        self.assertTrue(payment.receipt_number)
        # The point of the whole fix: the ledger moved.
        self.assertEqual(record.amount_paid, Decimal('20000.00'))
        self.assertEqual(record.balance, Decimal('30000.00'))
        self.assertEqual(record.status, StudentSchoolFeeRecord.STATUS_INCOMPLETE)

class SchoolLedgerTests(FeeFixtures, TestCase):
    """What the Fee Records tab reads.

    It used to read StudentSchoolFeeRecord, which exists only where a school
    created class fee allocations. A school that bills by fee type had none,
    so the tab was empty however many fees had been recorded. These tests
    pin the replacement: a row per learner per fee, built from the fees the
    school actually charges.
    """

    def setUp(self):
        super().setUp()
        self.student_user.is_license_paid = True
        self.student_user.save(update_fields=['is_license_paid'])
        registry_api.install(self.school, 'fees')
        self.bursar.school = self.school
        self.bursar.save(update_fields=['school'])
        self.api = APIClient()
        self.api.force_authenticate(user=self.bursar)

    def _ledger(self):
        response = self.api.get('/api/v1/fees/fee-structures/school-ledger/')
        self.assertEqual(response.status_code, 200, response.content[:300])
        return response.data

    def test_a_school_with_no_class_allocations_still_sees_its_fees(self):
        """The whole point: no SchoolFeeAssignment exists in this test at all."""
        self.assertEqual(StudentSchoolFeeRecord.objects.count(), 0)

        data = self._ledger()

        self.assertEqual(data['count'], 1)
        row = data['results'][0]
        self.assertEqual(row['student_name'], self.student_user.get_full_name())
        self.assertEqual(row['fee_name'], 'Tuition')
        self.assertEqual(Decimal(row['total_amount']), Decimal('50000.00'))
        self.assertEqual(Decimal(row['amount_paid']), Decimal('0.00'))
        self.assertEqual(row['status'], 'unpaid')

    def test_a_recorded_payment_shows_on_the_row(self):
        self.api.post(
            '/api/v1/fees/payments/',
            data={
                'payer': str(self.student_user.id),
                'fee_structure': str(self.fee.id),
                'amount': '20000.00',
                'payment_method': 'cash',
                'payment_date': str(date.today()),
            },
            format='json',
        )

        row = self._ledger()['results'][0]
        self.assertEqual(Decimal(row['amount_paid']), Decimal('20000.00'))
        self.assertEqual(Decimal(row['balance']), Decimal('30000.00'))
        self.assertEqual(row['status'], 'incomplete')

    def test_a_fee_for_one_class_does_not_appear_against_another(self):
        other_class = SchoolClass.objects.create(school=self.school, name='Form 1')
        FeeStructure.objects.create(
            school=self.school,
            name='Form 1 levy',
            amount=Decimal('5000.00'),
            academic_year='2025-2026',
            school_class=other_class,
        )

        data = self._ledger()

        # The student is in Form 5, so only the school-wide fee applies.
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['results'][0]['fee_name'], 'Tuition')

    def test_only_school_staff_can_read_it(self):
        outsider = APIClient()
        outsider.force_authenticate(user=self.student_user)

        response = outsider.get('/api/v1/fees/fee-structures/school-ledger/')
        self.assertEqual(response.status_code, 403)

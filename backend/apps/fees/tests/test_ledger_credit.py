"""A recorded payment has to reach the student's ledger.

The Fee Records tab reads the ledger, not the payments. Before this, a bursar
could take money, record it and print a receipt while the ledger went on saying
the student had paid nothing, because the two were never connected.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.fees.ledger import credit_payment_to_school_fees
from apps.fees.models import (
    FeeStructure,
    Payment,
    SchoolFeeAssignment,
    StudentSchoolFeeRecord,
)
from apps.schools.models import School, SchoolClass
from apps.students.models import Student

User = get_user_model()


class CreditPaymentToLedgerTests(TestCase):
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

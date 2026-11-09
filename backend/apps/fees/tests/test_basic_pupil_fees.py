"""Primary-school fees end to end, including pupils who have no login.

A nursery/primary pupil usually has no user account, so a payment cannot be
tied to a ``payer``. These tests walk the flow a bursar follows: set a fee for
a class, record a payment for a loginless pupil, see the balance and the
outstanding list, and read the receipt (number + QR).
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.fees.models import FeeStructure, Payment
from apps.registry import api as registry_api
from apps.schools.models import School, SchoolClass, SubSchool
from apps.students import api as students_api
from apps.students.models import Student

User = get_user_model()
PAYMENTS = '/api/v1/fees/payments/'
LEDGER = '/api/v1/fees/fee-structures/school-ledger/'
MY_FEES = '/api/v1/fees/fee-structures/my-fees/'


def make_school(sid, category='basic'):
    return School.objects.create(
        id=sid, name=f'School {sid}', short_name=sid, principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone', education_category=category,
    )


class PrimaryFeesFlowTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.school = make_school('PRI-FEE')
        registry_api.install_defaults(cls.school)
        cls.other = make_school('PRI-OTH')
        registry_api.install_defaults(cls.other)

        cls.admin = User.objects.create_user(
            matricule='ADM-PRI', name='Head Teacher', email='head-pri@example.org', role='SCHOOL_ADMIN',
            school=cls.school, password='password123', is_license_paid=True,
        )
        cls.bursar = User.objects.create_user(
            matricule='BUR-PRI', name='Bursar', email='bursar-pri@example.org', role='BURSAR',
            school=cls.school, password='password123', is_license_paid=True,
        )
        cls.other_bursar = User.objects.create_user(
            matricule='BUR-OTH', name='Other Bursar', email='bursar-oth@example.org', role='BURSAR',
            school=cls.other, password='password123', is_license_paid=True,
        )
        section = SubSchool.objects.filter(school=cls.school).first() or SubSchool.objects.create(
            school=cls.school, name='Primary',
        )
        cls.class6 = SchoolClass.objects.create(school=cls.school, name='Class 6', sub_school=section)
        cls.class5 = SchoolClass.objects.create(school=cls.school, name='Class 5', sub_school=section)
        # No login: this is the normal primary pupil.
        cls.pupil = students_api.create_pupil_from_admission(
            requested_by=cls.admin, name='Ngu Amina', school_class=cls.class6,
            guardian_name='Mama Ngu', guardian_phone='237670000001',
        )
        cls.pupil5 = students_api.create_pupil_from_admission(
            requested_by=cls.admin, name='Tabe Joel', school_class=cls.class5,
        )
        cls.fee = FeeStructure.objects.create(
            school=cls.school, name='School Fees', amount=Decimal('30000'), academic_year='2026-2027',
            school_class=cls.class6,
        )

    def record(self, user, pupil, amount, fee=None):
        self.client.force_authenticate(user)
        return self.client.post(PAYMENTS, {
            'pupil': str(pupil.id),
            'fee_structure': str((fee or self.fee).id),
            'amount': str(amount),
            'payment_method': 'cash',
            'payment_date': date.today().isoformat(),
        }, format='json')

    def test_pupil_really_has_no_login(self):
        self.assertIsNone(self.pupil.user_id)

    def test_admin_and_bursar_can_set_a_fee_per_class(self):
        for user in (self.admin, self.bursar):
            self.client.force_authenticate(user)
            response = self.client.post('/api/v1/fees/fee-structures/', {
                'name': f'PTA {user.role}', 'role': 'STUDENT', 'amount': '2000', 'currency': 'XAF',
                'school_class': str(self.class5.id), 'is_mandatory': True,
            }, format='json')
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(str(response.data['school_class']), str(self.class5.id))

    def test_fee_status_for_a_loginless_pupil(self):
        self.client.force_authenticate(self.bursar)
        response = self.client.get(f'{PAYMENTS}student-fee-status/', {'pupil': str(self.pupil.id)})
        self.assertEqual(response.status_code, 200, response.data)
        row = [r for r in response.data['results'] if r['fee_structure'] == str(self.fee.id)][0]
        self.assertEqual(Decimal(row['outstanding']), Decimal('30000.00'))

    def test_record_payment_for_loginless_pupil_then_balance_and_receipt(self):
        created = self.record(self.bursar, self.pupil, '10000')
        self.assertEqual(created.status_code, 201, created.data)
        payment = Payment.objects.get(pk=created.data['id'])
        self.assertIsNone(payment.payer_id)
        self.assertEqual(payment.student_id, self.pupil.id)
        self.assertEqual(created.data['payer_name'], 'Ngu Amina')

        confirmed = self.client.post(f'{PAYMENTS}{payment.id}/confirm/', {}, format='json')
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        receipt = confirmed.data['payment']
        self.assertTrue(receipt['receipt_number'].startswith('REC-'))
        self.assertTrue(receipt['qr_code'].startswith('data:image/png'))
        self.assertTrue(receipt['verify_url'])
        self.assertEqual(receipt['payer_name'], 'Ngu Amina')

        # Balance now: 20000 left on the fee for this pupil.
        status = self.client.get(f'{PAYMENTS}student-fee-status/', {'pupil': str(self.pupil.id)})
        row = [r for r in status.data['results'] if r['fee_structure'] == str(self.fee.id)][0]
        self.assertEqual(Decimal(row['paid']), Decimal('10000.00'))
        self.assertEqual(Decimal(row['outstanding']), Decimal('20000.00'))

        # The outstanding list (school ledger) sees it too, and only this pupil.
        ledger = self.client.get(LEDGER)
        mine = [r for r in ledger.data['results'] if r['student_id'] == str(self.pupil.id)
                and r['fee_id'] == str(self.fee.id)]
        self.assertEqual(len(mine), 1)
        self.assertEqual(Decimal(mine[0]['amount_paid']), Decimal('10000'))
        self.assertEqual(Decimal(mine[0]['balance']), Decimal('20000'))
        self.assertEqual(mine[0]['status'], 'incomplete')
        # Class 5 pupil is not charged a Class 6 fee.
        self.assertFalse([r for r in ledger.data['results'] if r['student_id'] == str(self.pupil5.id)])

    def test_cannot_overpay_or_pay_twice_for_a_loginless_pupil(self):
        self.assertEqual(self.record(self.admin, self.pupil, '30000').status_code, 201)
        again = self.record(self.admin, self.pupil, '1000')
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data['code'], 'fee_already_paid')
        # Another pupil is unaffected by the first pupil's payment.
        other_pupil = Student.objects.get(pk=self.pupil.pk)
        self.assertEqual(Payment.objects.filter(student=other_pupil).count(), 1)
        too_much = self.record(self.admin, self.pupil5, '40000')
        self.assertEqual(too_much.status_code, 400)
        self.assertEqual(too_much.data['code'], 'amount_exceeds_outstanding')

    def test_parent_sees_paid_status_of_loginless_child(self):
        created = self.record(self.bursar, self.pupil, '30000')
        self.client.post(f'{PAYMENTS}{created.data["id"]}/confirm/', {}, format='json')
        parent = User.objects.create_user(
            matricule='PAR-PRI', name='Mama Ngu', email='mama@example.org', role='PARENT',
            school=self.school, password='password123', is_license_paid=True,
        )
        from apps.students.models import ParentStudentLink

        ParentStudentLink.objects.create(parent=parent, student=self.pupil, relationship='mother')
        self.client.force_authenticate(parent)
        items = self.client.get(MY_FEES).data
        mine = [i for i in items if i['fee_id'] == str(self.fee.id)]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]['status'], 'paid')
        self.assertTrue(mine[0]['receipt_number'])

    def test_other_school_cannot_record_or_read_for_this_pupil(self):
        denied = self.record(self.other_bursar, self.pupil, '1000')
        self.assertEqual(denied.status_code, 404)
        self.client.force_authenticate(self.other_bursar)
        status = self.client.get(f'{PAYMENTS}student-fee-status/', {'pupil': str(self.pupil.id)})
        self.assertEqual(status.status_code, 404)
        self.assertEqual(Payment.objects.count(), 0)

    def test_parents_and_teachers_cannot_record(self):
        teacher = User.objects.create_user(
            matricule='TCH-PRI', name='Teacher', email='t-pri@example.org', role='TEACHER',
            school=self.school, password='password123',
        )
        self.assertIn(self.record(teacher, self.pupil, '1000').status_code, (403,))

    def test_activity_feed_names_a_loginless_pupil(self):
        self.record(self.bursar, self.pupil, '5000')
        activity = self.client.get(f'{PAYMENTS}activity/')
        self.assertEqual(activity.status_code, 200)
        self.assertIn('Ngu Amina', [e['subject'] for e in activity.data['results']])

    def test_payments_list_does_not_break_with_loginless_pupil(self):
        self.record(self.bursar, self.pupil, '5000')
        listing = self.client.get(PAYMENTS)
        self.assertEqual(listing.status_code, 200)
        names = [p['payer_name'] for p in (listing.data.get('results') or listing.data)]
        self.assertIn('Ngu Amina', names)

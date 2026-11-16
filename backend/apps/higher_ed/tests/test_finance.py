"""Higher-ed finance: fees per programme level, payments, receipts, balances, roles."""

from datetime import date, timedelta

from django.utils import timezone

from apps.higher_ed.models import FeePayment, TuitionFee
from apps.higher_ed.tests.test_results import ResultsBase

FEES = '/api/v1/higher-ed/fees/'
FIN = '/api/v1/higher-ed/finance/'


class FinanceBase(ResultsBase):
    def setUp(self):
        super().setUp()
        from apps.higher_ed.tests.test_higher_ed import make_user
        self.bursar = make_user('BUR-F1', 'BURSAR', self.school)
        self.level1 = self.years[0]
        self.enrol_ada = self.ada.he_enrolments.get()
        self.enrol_paul = self.paul.he_enrolments.get()

    def set_fee(self, user, amount, name='Tuition'):
        self.client.force_authenticate(user)
        return self.client.post(FEES, {'programme_year': str(self.level1.id), 'academic_year': str(self.ay.id),
                                       'name': name, 'amount': amount}, format='json')

    def pay(self, user, enrolment, amount, method='cash', **extra):
        self.client.force_authenticate(user)
        body = {'enrolment': str(enrolment.id), 'amount': amount, 'method': method,
                'paid_on': timezone.localdate().isoformat(), **extra}
        return self.client.post(FIN + 'payments/', body, format='json')

    def balances(self, user, **params):
        self.client.force_authenticate(user)
        return self.client.get(FIN + 'balances/', params)


class FeeTests(FinanceBase):
    def test_bursar_sets_fees_and_updating_the_same_line_changes_the_amount(self):
        self.assertEqual(self.set_fee(self.bursar, 350000).status_code, 201)
        r = self.set_fee(self.bursar, 400000)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(TuitionFee.objects.count(), 1)
        self.assertEqual(TuitionFee.objects.get().amount, 400000)

    def test_lecturers_and_students_cannot_set_or_list_fees(self):
        self.assertEqual(self.set_fee(self.lect, 1000).status_code, 403)
        self.client.force_authenticate(self.lect)
        self.assertEqual(self.client.get(FEES).status_code, 403)

    def test_amount_must_be_a_positive_whole_number(self):
        self.assertEqual(self.set_fee(self.bursar, 0).status_code, 400)
        self.assertEqual(self.set_fee(self.bursar, 'abc').status_code, 400)

    def test_fee_for_another_institutions_level_is_refused(self):
        from apps.higher_ed.tests.test_higher_ed import make_user
        other_admin = make_user('ADM-OTH', 'SCHOOL_ADMIN', self.other)
        r = self.set_fee(other_admin, 1000)
        self.assertEqual(r.status_code, 404)


class PaymentTests(FinanceBase):
    def test_balance_follows_fees_and_payments(self):
        self.set_fee(self.bursar, 300000)
        self.set_fee(self.bursar, 50000, 'Registration')
        r = self.pay(self.bursar, self.enrol_ada, 200000)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data['receipt_number'].startswith('REC-'))
        rows = {x['student_name']: x for x in self.balances(self.bursar).data['rows']}
        self.assertEqual((rows['Ada Nkeng']['billed'], rows['Ada Nkeng']['paid'], rows['Ada Nkeng']['balance'],
                          rows['Ada Nkeng']['status']), (350000, 200000, 150000, 'partial'))
        self.assertEqual(rows['Paul Tabe']['status'], 'unpaid')
        summary = self.balances(self.bursar).data['summary']
        self.assertEqual((summary['billed'], summary['collected'], summary['outstanding'], summary['defaulters']),
                         (700000, 200000, 500000, 2))

    def test_paying_in_full_settles_and_receipts_are_sequential(self):
        self.set_fee(self.bursar, 100000)
        a = self.pay(self.bursar, self.enrol_ada, 60000).data['receipt_number']
        b = self.pay(self.bursar, self.enrol_ada, 40000).data['receipt_number']
        self.assertNotEqual(a, b)
        self.assertEqual(int(b.rsplit('-', 1)[1]), int(a.rsplit('-', 1)[1]) + 1)
        row = next(x for x in self.balances(self.bursar).data['rows'] if x['student_name'] == 'Ada Nkeng')
        self.assertEqual((row['balance'], row['status']), (0, 'paid'))
        self.assertEqual(self.balances(self.bursar, status='paid').data['summary']['students'], 1)

    def test_mobile_money_and_bank_need_a_reference_cash_does_not(self):
        self.set_fee(self.bursar, 100000)
        self.assertEqual(self.pay(self.bursar, self.enrol_ada, 1000, 'mtn_momo').status_code, 400)
        self.assertEqual(self.pay(self.bursar, self.enrol_ada, 1000, 'orange_money', reference='OM123').status_code, 201)
        self.assertEqual(self.pay(self.bursar, self.enrol_ada, 1000, 'cash').status_code, 201)
        self.assertEqual(self.pay(self.bursar, self.enrol_ada, 1000, 'cheque').status_code, 400)

    def test_zero_negative_and_future_dated_payments_are_refused(self):
        self.assertEqual(self.pay(self.bursar, self.enrol_ada, 0).status_code, 400)
        self.assertEqual(self.pay(self.bursar, self.enrol_ada, -5).status_code, 400)
        future = (date.today() + timedelta(days=3)).isoformat()
        self.assertEqual(self.pay(self.bursar, self.enrol_ada, 1000, paid_on=future).status_code, 400)

    def test_voiding_removes_it_from_the_balance_but_keeps_the_record(self):
        self.set_fee(self.bursar, 100000)
        payment = self.pay(self.bursar, self.enrol_ada, 100000).data
        self.client.force_authenticate(self.bursar)
        self.assertEqual(self.client.post(FIN + f"payments/{payment['id']}/void/", {}, format='json').status_code, 400)
        r = self.client.post(FIN + f"payments/{payment['id']}/void/", {'reason': 'Wrong student'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(FeePayment.objects.get(pk=payment['id']).is_void)
        row = next(x for x in self.balances(self.bursar).data['rows'] if x['student_name'] == 'Ada Nkeng')
        self.assertEqual(row['balance'], 100000)
        self.assertEqual(self.client.post(FIN + f"payments/{payment['id']}/void/", {'reason': 'x'}, format='json').status_code, 400)

    def test_withdrawn_students_are_not_billed_and_search_filters(self):
        self.set_fee(self.bursar, 100000)
        self.enrol_paul.status = 'withdrawn'
        self.enrol_paul.save()
        rows = self.balances(self.bursar).data['rows']
        self.assertEqual([x['student_name'] for x in rows], ['Ada Nkeng'])
        self.assertEqual(self.balances(self.bursar, q='zzz').data['rows'], [])

    def test_staff_only_and_institution_isolation(self):
        self.set_fee(self.bursar, 100000)
        self.assertEqual(self.pay(self.lect, self.enrol_ada, 1000).status_code, 403)
        from apps.higher_ed.tests.test_higher_ed import make_user
        other_bursar = make_user('BUR-OTH', 'BURSAR', self.other)
        self.assertEqual(self.pay(other_bursar, self.enrol_ada, 1000).status_code, 400)
        self.assertEqual(self.balances(self.lect).status_code, 403)


class StudentStatementTests(FinanceBase):
    def test_a_student_sees_only_their_own_statement(self):
        self.set_fee(self.bursar, 100000)
        self.pay(self.bursar, self.enrol_ada, 25000)
        self.client.force_authenticate(self.ada.user)
        r = self.client.get(FIN + 'mine/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual((r.data[0]['billed'], r.data[0]['paid'], r.data[0]['balance']), (100000, 25000, 75000))
        self.assertEqual(len(r.data[0]['payments']), 1)
        self.assertEqual(self.client.get(FIN + 'balances/').status_code, 403)

    def test_staff_cannot_use_the_student_statement(self):
        self.client.force_authenticate(self.bursar)
        self.assertEqual(self.client.get(FIN + 'mine/').status_code, 403)


class OverviewTests(FinanceBase):
    def test_admin_and_bursar_see_the_numbers_others_do_not(self):
        self.set_fee(self.bursar, 100000)
        self.pay(self.bursar, self.enrol_ada, 40000)
        self.client.force_authenticate(self.admin)
        r = self.client.get('/api/v1/higher-ed/overview/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['students'], r.data['programmes'], r.data['lecturers']), (2, 1, 2))
        self.assertEqual(r.data['students_by_programme'], [{'name': 'BSc CS', 'count': 2}])
        self.assertEqual((r.data['finance']['collected'], r.data['finance']['outstanding']), (40000, 160000))
        self.client.force_authenticate(self.bursar)
        self.assertEqual(self.client.get('/api/v1/higher-ed/overview/').status_code, 200)
        self.client.force_authenticate(self.lect)
        self.assertEqual(self.client.get('/api/v1/higher-ed/overview/').status_code, 403)


class MyCoursesTests(FinanceBase):
    def test_student_sees_their_level_courses_with_lecturer_and_published_grade(self):
        self.client.force_authenticate(self.ada.user)
        r = self.client.get('/api/v1/higher-ed/my-courses/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['enrolment']['programme'], 'BSc CS')
        self.assertEqual([c['code'] for c in r.data['courses']], ['CSC101', 'CSC102'])
        self.assertEqual(r.data['courses'][0]['lecturers'], ['TCH-R1'])
        self.assertEqual(r.data['courses'][0]['grade'], '')

    def test_staff_cannot_use_it(self):
        self.client.force_authenticate(self.bursar)
        self.assertEqual(self.client.get('/api/v1/higher-ed/my-courses/').status_code, 403)

"""Platform fee per student: configuration, bill math, payment, access lock.

Students are created through the students API/HTTP endpoint (never by importing
``apps.students.models``), so loginless pupils are exercised for real.
"""

from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.fees.models import GatewayTransaction
from apps.platform import billing
from apps.platform.access import school_subscription_state, user_school_access_blocked
from apps.platform.models import PlatformBillingChange, PlatformSettings, SchoolPlatformBill
from apps.schools.models import School, SchoolClass

User = get_user_model()

STUDENTS = '/api/v1/students/students/'
SETTINGS = '/api/v1/platform/settings/'
MY_BILL = '/api/v1/platform/billing/my-bill/'
HISTORY = '/api/v1/platform/billing/history/'
OVERVIEW = '/api/v1/platform/billing/schools/'
PAY = '/api/v1/fees/fapshi/school-subscription/'


def make_school(sid, name, short, category='basic'):
    return School.objects.create(
        id=sid, name=name, short_name=short, principal='P', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000',
        school_type='general', subsystem='anglophone', education_category=category,
    )


def user(matricule, role, school=None, **extra):
    return User.objects.create_user(
        matricule=matricule, name=matricule, email=f'{matricule.lower()}@example.org', role=role,
        school=school, password='password123', is_license_paid=True, **extra,
    )


class BillingBase(APITestCase):
    def setUp(self):
        self.school = make_school('PB-ONE', 'Bill Primary', 'BP')
        self.other = make_school('PB-TWO', 'Other Primary', 'OP')
        self.klass = SchoolClass.objects.create(school=self.school, name='Class 1')
        self.other_klass = SchoolClass.objects.create(school=self.other, name='Class A')
        self.admin = user('PB-ADM1', 'SCHOOL_ADMIN', self.school)
        self.sub = user('PB-SUB1', 'SUB_ADMIN', self.school)
        self.teacher = user('PB-TCH1', 'TEACHER', self.school)
        self.other_admin = user('PB-ADM2', 'SCHOOL_ADMIN', self.other)
        self.ceo = user('PB-CEO', 'CEO')
        self.coo = user('PB-COO', 'COO', allowed_modules=[])

    def add_pupil(self, admin, klass, login=False, name='Pupil'):
        self.client.force_authenticate(admin)
        response = self.client.post(STUDENTS, {
            'name': name, 'school_class': str(klass.id), 'student_class': klass.name,
            'gender': 'female', 'create_login': login,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def configure(self, rate='500', deadline=None, **extra):
        settings = PlatformSettings.load()
        settings.per_student_fee = Decimal(rate)
        settings.payment_deadline = deadline or (timezone.localdate() + timedelta(days=30))
        for key, value in extra.items():
            setattr(settings, key, value)
        settings.save()
        return settings

    def bill(self, who=None):
        self.client.force_authenticate(who or self.admin)
        response = self.client.get(MY_BILL)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data


class ConfigPermissionTests(BillingBase):
    def test_ceo_sets_rate_and_deadline_and_audit_is_written(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.patch(SETTINGS, {
            'per_student_fee': '300',
            'per_student_fee_by_category': {'basic': '200'},
            'payment_deadline': '2027-01-31',
            'payment_deadline_by_category': {'basic': '2027-02-28'},
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        settings = PlatformSettings.load()
        self.assertEqual(settings.per_student_fee, Decimal('300'))
        self.assertEqual(settings.per_student_fee_by_category, {'basic': '200'})
        change = PlatformBillingChange.objects.get()
        self.assertEqual(change.changed_by_id, self.ceo.id)
        self.assertIn('per_student_fee', change.changes)
        self.assertEqual(change.changes['payment_deadline']['new'], '2027-01-31')

    def test_school_admin_cannot_change_rate(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(SETTINGS, {'per_student_fee': '1'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(PlatformSettings.load().per_student_fee, 0)
        self.assertFalse(PlatformBillingChange.objects.exists())

    def test_executive_without_module_cannot_change_rate(self):
        self.client.force_authenticate(self.coo)
        response = self.client.patch(SETTINGS, {'per_student_fee': '1'}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_validation_rejects_negative_unknown_category_and_bad_date(self):
        self.client.force_authenticate(self.ceo)
        for payload in (
            {'per_student_fee': '-5'},
            {'per_student_fee_by_category': {'kindergarten': '5'}},
            {'per_student_fee_by_category': {'basic': '-1'}},
            {'payment_deadline_by_category': {'basic': 'not-a-date'}},
        ):
            self.assertEqual(self.client.patch(SETTINGS, payload, format='json').status_code, 400, payload)

    def test_overview_and_changes_are_executive_only(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(OVERVIEW).status_code, 403)
        self.assertEqual(self.client.get('/api/v1/platform/billing/changes/').status_code, 403)
        self.client.force_authenticate(self.ceo)
        self.assertEqual(self.client.get(OVERVIEW).status_code, 200)
        self.assertEqual(self.client.get('/api/v1/platform/billing/changes/').status_code, 200)


class BillMathTests(BillingBase):
    def test_unconfigured_means_no_bill(self):
        data = self.bill()
        self.assertFalse(data['configured'])
        self.assertEqual(data['status'], 'not_configured')
        self.assertEqual(data['total'], 0)

    def test_pupils_times_rate_counts_loginless_and_ignores_unassigned_and_other_schools(self):
        self.add_pupil(self.admin, self.klass, login=False, name='NoLogin One')
        self.add_pupil(self.admin, self.klass, login=False, name='NoLogin Two')
        self.add_pupil(self.admin, self.klass, login=True, name='With Login')
        self.add_pupil(self.other_admin, self.other_klass, login=False, name='Elsewhere')
        self.configure('500')
        data = self.bill()
        self.assertEqual(data['pupil_count'], 3)
        self.assertEqual(data['rate'], 500)
        self.assertEqual(data['total'], 1500)
        self.assertEqual(data['balance'], 1500)
        self.assertEqual(data['status'], 'due')
        self.assertTrue(data['can_pay'])

    def test_drafted_login_not_counted(self):
        created = self.add_pupil(self.admin, self.klass, login=True, name='Soon Gone')
        self.add_pupil(self.admin, self.klass, login=False, name='Stays')
        self.configure('100')
        self.assertEqual(self.bill()['pupil_count'], 2)
        User.objects.filter(student_profile__id=created['id']).update(is_drafted=True)
        self.assertEqual(self.bill()['pupil_count'], 1)

    def test_category_rate_overrides_default_and_other_category_uses_default(self):
        self.add_pupil(self.admin, self.klass)
        secondary = make_school('PB-SEC', 'Sec School', 'SS', category='secondary')
        sec_class = SchoolClass.objects.create(school=secondary, name='Form 1')
        sec_admin = user('PB-ADM3', 'SCHOOL_ADMIN', secondary)
        self.add_pupil(sec_admin, sec_class)
        self.configure('1000', per_student_fee_by_category={'basic': '250'})
        self.assertEqual(self.bill()['rate'], 250)
        self.assertEqual(self.bill(sec_admin)['rate'], 1000)

    def test_category_deadline_overrides_global(self):
        soon = timezone.localdate() + timedelta(days=5)
        self.configure('100', payment_deadline_by_category={'basic': soon.isoformat()})
        self.assertEqual(self.bill()['deadline'], soon.isoformat())

    def test_school_isolation_and_roles(self):
        self.configure('100')
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(MY_BILL).status_code, 403)
        self.assertEqual(self.client.get(HISTORY).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(MY_BILL).status_code, (401, 403))
        self.add_pupil(self.other_admin, self.other_klass)
        self.assertEqual(self.bill(self.admin)['pupil_count'], 0)
        self.assertEqual(self.bill(self.other_admin)['pupil_count'], 1)

    def test_sub_admin_can_view_but_not_pay(self):
        self.configure('100')
        self.add_pupil(self.admin, self.klass)
        self.assertFalse(self.bill(self.sub)['can_pay'])
        self.client.force_authenticate(self.sub)
        with mock.patch('apps.fees.fapshi.is_configured', return_value=True):
            response = self.client.post(PAY, {'phone': '670000000'}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_overdue_status(self):
        self.add_pupil(self.admin, self.klass)
        self.configure('100', deadline=timezone.localdate() - timedelta(days=1))
        self.assertEqual(self.bill()['status'], 'overdue')


def blocked(u):
    # re-read so the school is not a stale cached instance
    return user_school_access_blocked(User.objects.get(pk=u.pk))



class PaymentTests(BillingBase):
    def setUp(self):
        super().setUp()
        for i in range(4):
            self.add_pupil(self.admin, self.klass, name=f'P{i}')
        self.configure('500')  # 4 x 500 = 2000
        patches = [
            mock.patch('apps.fees.fapshi.current_environment', return_value='live'),
            mock.patch('apps.fees.fapshi.is_configured', return_value=True),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self._n = 0

    def pay(self, who=None, **body):
        self.client.force_authenticate(who or self.admin)
        self._n += 1
        with mock.patch('apps.fees.fapshi.direct_pay', return_value={'transId': f'T{self._n}'}) as direct:
            response = self.client.post(PAY, {'phone': '670000000', **body}, format='json')
        return response, direct

    def confirm(self, transaction_id, paid):
        txn = GatewayTransaction.objects.get(transaction_id=transaction_id)
        with mock.patch('apps.fees.fapshi.payment_status',
                        return_value={'status': 'SUCCESSFUL', 'amount': paid}):
            self.client.force_authenticate(self.admin)
            return self.client.get(f'/api/v1/fees/fapshi/status/{txn.transaction_id}/')

    def test_amount_comes_from_server_and_client_cannot_overpay(self):
        response, direct = self.pay(amount=1)  # tiny amount below minimum -> rejected
        self.assertEqual(response.status_code, 400)
        response, _ = self.pay(amount=999999)
        self.assertEqual(response.status_code, 400)
        response, direct = self.pay()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(direct.call_args.kwargs['amount'], 2000)
        txn = GatewayTransaction.objects.get()
        self.assertEqual(txn.amount, Decimal('2000'))
        self.assertEqual(txn.platform_bill.school_id, self.school.id)

    def test_full_payment_settles_bill_flips_school_and_is_idempotent(self):
        school = School.objects.get(id=self.school.id)
        school.subscription_status = 'unpaid'
        school.save(update_fields=['subscription_status'])
        self.assertTrue(blocked(self.teacher))

        response, _ = self.pay()
        tid = response.data['transaction_id']
        first = self.confirm(tid, 2000)
        self.assertEqual(first.data['status'], 'SUCCESS', first.data)
        # webhook-style retries and repeated status polls must not credit again
        for _ in range(3):
            self.confirm(tid, 2000)
        self.assertEqual(GatewayTransaction.objects.filter(processed=True).count(), 1)

        data = self.bill()
        self.assertEqual(data['status'], 'paid')
        self.assertEqual(data['paid'], 2000)
        self.assertEqual(data['balance'], 0)
        school.refresh_from_db()
        self.assertEqual(school.subscription_status, 'paid')
        self.assertFalse(blocked(self.teacher))

        history = self.client.get(HISTORY).data['results']
        self.assertEqual(len(history), 1)
        self.assertEqual(len(history[0]['payments']), 1)
        self.assertTrue(history[0]['payments'][0]['receipt_number'])
        # nothing left to pay
        again, _ = self.pay()
        self.assertEqual(again.status_code, 400)

    def test_partial_payments_do_not_flip_until_cleared(self):
        school = School.objects.get(id=self.school.id)
        school.subscription_status = 'unpaid'
        school.save(update_fields=['subscription_status'])

        response, _ = self.pay(amount=500)
        self.assertEqual(response.status_code, 201, response.data)
        self.confirm(response.data['transaction_id'], 500)
        data = self.bill()
        self.assertEqual((data['paid'], data['balance'], data['status']), (500, 1500, 'due'))
        school.refresh_from_db()
        self.assertEqual(school.subscription_status, 'unpaid')

        response, direct = self.pay()  # defaults to the remaining balance
        self.assertEqual(direct.call_args.kwargs['amount'], 1500)
        self.confirm(response.data['transaction_id'], 1500)
        self.assertEqual(self.bill()['status'], 'paid')
        school.refresh_from_db()
        self.assertEqual(school.subscription_status, 'paid')

    def test_short_payment_from_gateway_is_not_credited(self):
        response, _ = self.pay()
        result = self.confirm(response.data['transaction_id'], 1000)
        self.assertEqual(result.data['status'], 'PENDING')
        data = self.bill()
        self.assertEqual(data['paid'], 0)
        self.assertEqual(data['balance'], 2000)

    def test_second_prompt_blocked_while_one_is_pending(self):
        first, _ = self.pay()
        self.assertEqual(first.status_code, 201)
        second, direct = self.pay()
        self.assertEqual(second.status_code, 409)
        direct.assert_not_called()
        self.assertEqual(second.data['transaction_id'], first.data['transaction_id'])
        self.assertEqual(GatewayTransaction.objects.count(), 1)

    def test_other_school_payment_does_not_touch_this_bill(self):
        self.add_pupil(self.other_admin, self.other_klass)
        other_response, _ = self.pay(who=self.other_admin)
        self.assertEqual(other_response.status_code, 201, other_response.data)
        self.assertEqual(GatewayTransaction.objects.get().school_id, self.other.id)
        self.assertEqual(self.bill()['paid'], 0)

    def test_legacy_flat_amount_still_works_when_no_rate(self):
        settings = PlatformSettings.load()
        settings.per_student_fee = Decimal('0')
        settings.save()
        school = School.objects.get(id=self.school.id)
        school.subscription_amount = Decimal('3000')
        school.save(update_fields=['subscription_amount'])
        response, direct = self.pay()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(direct.call_args.kwargs['amount'], 3000)
        txn = GatewayTransaction.objects.get()
        self.assertIsNone(txn.platform_bill_id)
        # the legacy flat-amount path also settles the school (and records a payer)
        self.confirm(response.data['transaction_id'], 3000)
        school.refresh_from_db()
        self.assertEqual(school.subscription_status, 'paid')


class OverdueAccessTests(BillingBase):
    def setUp(self):
        super().setUp()
        self.add_pupil(self.admin, self.klass)

    def test_before_deadline_nobody_is_locked(self):
        self.configure('500', deadline=timezone.localdate() + timedelta(days=2))
        self.assertEqual(school_subscription_state(self.school), 'free')
        self.assertFalse(blocked(self.teacher))

    def test_after_deadline_unpaid_school_locks_staff_but_not_admins(self):
        self.configure('500', deadline=timezone.localdate() - timedelta(days=1))
        school = School.objects.get(id=self.school.id)
        self.assertEqual(school_subscription_state(school), 'unpaid')
        self.assertTrue(blocked(self.teacher))
        self.assertFalse(blocked(self.admin))
        self.assertFalse(blocked(self.sub))

    def test_founder_free_period_is_a_grace(self):
        self.configure('500', deadline=timezone.localdate() - timedelta(days=1))
        school = School.objects.get(id=self.school.id)
        school.subscription_free_until = timezone.localdate() + timedelta(days=10)
        school.save(update_fields=['subscription_free_until'])
        self.assertFalse(blocked(self.teacher))

    def test_not_configured_never_locks(self):
        settings = PlatformSettings.load()
        settings.payment_deadline = timezone.localdate() - timedelta(days=30)
        settings.save()
        self.assertFalse(blocked(self.teacher))

    def test_empty_school_is_not_locked(self):
        self.configure('500', deadline=timezone.localdate() - timedelta(days=1))
        self.assertFalse(user_school_access_blocked(user('PB-T2', 'TEACHER', self.other)))

    def test_founder_overview_lists_overdue(self):
        self.configure('500', deadline=timezone.localdate() - timedelta(days=1))
        self.client.force_authenticate(self.ceo)
        data = self.client.get(OVERVIEW, {'status': 'overdue'}).data
        self.assertEqual([r['school_id'] for r in data['results']], [str(self.school.id)])
        self.assertEqual(data['summary'], {'overdue': 1})

    def test_bill_row_is_unique_per_cycle(self):
        self.configure('500')
        self.bill()
        self.bill()
        self.assertEqual(SchoolPlatformBill.objects.filter(school=self.school).count(), 1)
        self.assertEqual(billing.public_bill(self.school)['bill_id'], SchoolPlatformBill.objects.get().id)

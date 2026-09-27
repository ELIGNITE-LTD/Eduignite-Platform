"""Inviting a school, from the link to the count.

The link is only worth anything if a school arriving through it is actually
credited to the person who sent them, so that is what these check: the code a
person gets, the request that carries it, and the figures they see afterwards.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.orders.models import Order

User = get_user_model()

REQUEST = {
    'full_name': 'A Principal',
    'occupation': 'Principal',
    'school_name': 'Presbyterian Secondary School',
    'whatsapp_number': '+237600000000',
    'email': 'principal@example.com',
    'region': 'North West',
    'division': 'Mezam',
    'sub_division': 'Bamenda I',
    'message': 'We would like EduIgnite.',
}


class ReferralLinkTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            matricule='TCH-001',
            name='A Teacher',
            email='teacher@example.com',
            role='TEACHER',
            password='not-a-real-password',
        )
        self.api = APIClient()

    def _my_referral(self, user):
        self.api.force_authenticate(user=user)
        return self.api.get('/api/v1/orders/orders/my-referral/')

    def test_any_account_can_get_a_link(self):
        """Inviting a school is not an executive privilege."""
        response = self._my_referral(self.teacher)

        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assertTrue(response.data['code'])
        self.assertIn(response.data['code'], response.data['link'])
        self.assertIn('/school-account-request?ref=', response.data['link'])

    def test_the_code_is_never_the_matricule(self):
        """The matricule is half of a sign-in; it must not be in a shared link."""
        response = self._my_referral(self.teacher)

        self.assertNotEqual(response.data['code'], self.teacher.matricule)
        self.assertNotIn(self.teacher.matricule, response.data['link'])

    def test_the_same_person_keeps_the_same_link(self):
        first = self._my_referral(self.teacher).data['code']
        second = self._my_referral(self.teacher).data['code']

        self.assertEqual(first, second)

    def test_two_people_get_different_links(self):
        other = User.objects.create_user(
            matricule='TCH-002',
            name='Another Teacher',
            email='teacher2@example.com',
            role='TEACHER',
            password='not-a-real-password',
        )

        self.assertNotEqual(
            self._my_referral(self.teacher).data['code'],
            self._my_referral(other).data['code'],
        )

    def test_a_school_arriving_by_the_link_is_credited(self):
        code = self._my_referral(self.teacher).data['code']

        public = APIClient()
        response = public.post(
            '/api/v1/orders/orders/',
            data={**REQUEST, 'referral_code': code},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.content[:300])

        order = Order.objects.get(email=REQUEST['email'])
        self.assertEqual(order.referred_by, self.teacher)
        self.assertEqual(order.referral_code, code)

        figures = self._my_referral(self.teacher).data
        self.assertEqual(figures['total'], 1)
        self.assertEqual(figures['pending'], 1)
        self.assertEqual(figures['processed'], 0)

    def test_the_code_survives_being_typed_in_lower_case(self):
        code = self._my_referral(self.teacher).data['code']

        APIClient().post(
            '/api/v1/orders/orders/',
            data={**REQUEST, 'referral_code': code.lower()},
            format='json',
        )

        self.assertEqual(Order.objects.get(email=REQUEST['email']).referred_by, self.teacher)

    def test_a_code_belonging_to_nobody_still_records_the_school(self):
        """A mistyped link is not a reason to lose a school that wants us."""
        response = APIClient().post(
            '/api/v1/orders/orders/',
            data={**REQUEST, 'referral_code': 'NOTACODE'},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(email=REQUEST['email'])
        self.assertIsNone(order.referred_by)
        self.assertEqual(order.referral_code, 'NOTACODE')

    def test_a_request_with_no_code_still_works(self):
        """The form is public and must keep working for anyone who just finds it."""
        response = APIClient().post('/api/v1/orders/orders/', data=REQUEST, format='json')

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(email=REQUEST['email'])
        self.assertIsNone(order.referred_by)
        self.assertEqual(order.referral_code, '')

    def test_someone_elses_referrals_are_not_counted_as_mine(self):
        mine = self._my_referral(self.teacher).data['code']
        other = User.objects.create_user(
            matricule='TCH-003',
            name='Third Teacher',
            email='teacher3@example.com',
            role='TEACHER',
            password='not-a-real-password',
        )

        APIClient().post(
            '/api/v1/orders/orders/',
            data={**REQUEST, 'referral_code': mine},
            format='json',
        )

        self.assertEqual(self._my_referral(other).data['total'], 0)
        self.assertEqual(self._my_referral(self.teacher).data['total'], 1)

class ReferralEarningsTests(TestCase):
    """What a referral is worth, and who may earn it."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            matricule='TCH-700', name='A Teacher', email='t700@example.com',
            role='TEACHER', password='not-a-real-password',
        )
        self.api = APIClient()

    def _referral(self, user=None):
        self.api.force_authenticate(user=user or self.teacher)
        return self.api.get('/api/v1/orders/orders/my-referral/')

    def _refer_school(self, code, email, status_value):
        APIClient().post(
            '/api/v1/orders/orders/',
            data={**REQUEST, 'email': email, 'referral_code': code},
            format='json',
        )
        order = Order.objects.get(email=email)
        order.status = status_value
        order.save(update_fields=['status'])
        return order

    def test_a_school_only_earns_once_it_is_set_up(self):
        """A submitted form is not money: anyone can type a school name."""
        code = self._referral().data['code']
        self._refer_school(code, 'pending@example.com', 'pending')

        data = self._referral().data
        self.assertEqual(data['total'], 1)
        self.assertEqual(data['qualifying'], 0)
        self.assertEqual(data['earned'], 0)
        self.assertEqual(data['in_progress'], 1)
        self.assertEqual(data['in_progress_value'], 20000)

    def test_a_school_that_is_set_up_earns_twenty_thousand(self):
        code = self._referral().data['code']
        self._refer_school(code, 'setup@example.com', 'processed')

        data = self._referral().data
        self.assertEqual(data['qualifying'], 1)
        self.assertEqual(data['earned'], 20000)
        self.assertEqual(data['reward_per_school'], 20000)
        self.assertEqual(data['currency'], 'XAF')

    def test_earnings_add_up_across_schools(self):
        code = self._referral().data['code']
        self._refer_school(code, 'a@example.com', 'processed')
        self._refer_school(code, 'b@example.com', 'processed')
        self._refer_school(code, 'c@example.com', 'contacted')

        data = self._referral().data
        self.assertEqual(data['earned'], 40000)
        self.assertEqual(data['in_progress'], 1)

    def test_a_rejected_school_is_worth_nothing_and_is_not_counted_as_pending(self):
        code = self._referral().data['code']
        self._refer_school(code, 'no@example.com', 'rejected')

        data = self._referral().data
        self.assertEqual(data['earned'], 0)
        self.assertEqual(data['in_progress'], 0)

    def test_the_payout_year_is_stated(self):
        data = self._referral().data
        self.assertEqual(data['paid_after'], f"{data['year']}-12-31")

    def test_students_are_not_part_of_the_programme(self):
        student = User.objects.create_user(
            matricule='STU-700', name='A Student', email='s700@example.com',
            role='STUDENT', password='not-a-real-password',
        )

        self.assertEqual(self._referral(student).status_code, 403)

    def test_a_parent_may_still_take_part(self):
        parent = User.objects.create_user(
            matricule='PAR-700', name='A Parent', email='p700@example.com',
            role='PARENT', password='not-a-real-password',
        )

        self.assertEqual(self._referral(parent).status_code, 200)

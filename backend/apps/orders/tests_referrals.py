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

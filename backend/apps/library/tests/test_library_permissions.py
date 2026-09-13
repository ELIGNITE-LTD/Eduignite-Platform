"""Regression test for the same bug class fixed in apps.announcements:
check_permissions() touching request.user.role before super().check_permissions()
had a chance to reject an unauthenticated request via IsAuthenticated.
Django's AnonymousUser has no .role attribute, so every one of
BookCategoryViewSet/BookViewSet/BookLoanViewSet's create/update/destroy
actions crashed with an unhandled 500 for any unauthenticated caller,
instead of a clean 401. One representative viewset is enough to prove the
shared pattern -- all three use identical logic.
"""

from django.test import TestCase
from rest_framework.test import APIClient


class LibraryUnauthenticatedRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_unauthenticated_create_returns_401_not_500(self):
        response = self.client.post('/api/v1/library/categories/', {'name': 'Fiction'}, format='json')
        self.assertEqual(response.status_code, 401, response.data)

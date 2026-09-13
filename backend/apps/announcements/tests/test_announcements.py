"""Tests for the Announcements API.

Follows the same conventions used elsewhere in this backend (see
``apps/academy/tests/test_academy.py``): plain ``django.test.TestCase`` +
DRF's ``APIClient`` with ``force_authenticate``, no factory_boy fixtures.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.announcements.models import Announcement

User = get_user_model()


def _make_user(matricule, role='TEACHER', name=None, email=None):
    return User.objects.create_user(
        matricule=matricule,
        name=name or matricule,
        email=email or f'{matricule.lower()}@example.com',
        role=role,
        password='pass12345',
    )


class AnnouncementListPermissionTests(TestCase):
    """Live-reported bug: an unauthenticated GET crashed with an unhandled
    500 (AttributeError: 'AnonymousUser' object has no attribute 'role')
    instead of a clean 401 -- AnnouncementViewSet.check_permissions()
    touched request.user.role before super().check_permissions() had a
    chance to reject the request via IsAuthenticated. See views.py."""

    def setUp(self):
        self.client = APIClient()
        self.ceo = _make_user('EDU-CEO-0001', role='CEO')
        Announcement.objects.create(
            sender=self.ceo, title='Platform-wide notice', content='Hello',
            target='ALL', school=None,
        )

    def test_unauthenticated_list_returns_401_not_500(self):
        response = self.client.get('/api/v1/announcements/announcements/')
        self.assertEqual(response.status_code, 401, response.data)

    def test_authenticated_executive_can_list_platform_wide_announcements(self):
        # Regression guard: the fix must not disturb the authenticated path.
        # CEO/CTO always pass RequiresApp() (platform executives), so no
        # registry install is needed here.
        self.client.force_authenticate(self.ceo)
        response = self.client.get('/api/v1/announcements/announcements/')
        self.assertEqual(response.status_code, 200, response.data)
        titles = [row['title'] for row in response.data['results']]
        self.assertIn('Platform-wide notice', titles)

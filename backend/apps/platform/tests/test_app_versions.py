"""Tests for the app-update-check endpoints.

Follows the same conventions used elsewhere in this backend (see
``apps/app_store/tests/test_app_store.py`` and
``apps/offline_licensing/tests/test_offline_licensing.py``): plain
``django.test.TestCase`` + DRF's ``APIClient``, ``@override_settings`` to
pin a throwaway ``CI_VERSION_UPDATE_TOKEN`` so these tests never depend on
env/`.env` configuration.
"""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.platform.models import AppVersion

TEST_TOKEN = 'test-ci-token-not-a-real-secret'


@override_settings(SECURE_SSL_REDIRECT=False, CI_VERSION_UPDATE_TOKEN=TEST_TOKEN)
class AppVersionListViewTests(TestCase):
    """GET /api/v1/platform/app-versions/"""

    def setUp(self):
        self.client = APIClient()
        AppVersion.objects.create(
            app_key='mobile',
            latest_version='1.2.3',
            min_supported_version='1.0.0',
            download_url='https://downloads.eduignite.com/eduignite-mobile.apk',
            release_notes='Bug fixes.',
        )
        AppVersion.objects.create(
            app_key='desktop',
            latest_version='2.0.0',
            download_url='https://downloads.eduignite.com/eduignite-desktop-setup.exe',
        )

    def test_get_requires_no_auth_and_returns_correct_data(self):
        # No credentials set on self.client at all — genuinely anonymous.
        response = self.client.get('/api/v1/platform/app-versions/')
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn('mobile', data)
        self.assertIn('desktop', data)
        self.assertNotIn('offline_desktop', data)  # no row created for it

        mobile = data['mobile']
        self.assertEqual(mobile['latestVersion'], '1.2.3')
        self.assertEqual(mobile['minSupportedVersion'], '1.0.0')
        self.assertEqual(mobile['downloadUrl'], 'https://downloads.eduignite.com/eduignite-mobile.apk')
        self.assertEqual(mobile['releaseNotes'], 'Bug fixes.')
        self.assertIn('updatedAt', mobile)

        # desktop row had no explicit min_supported_version -> defaults to latest_version
        desktop = data['desktop']
        self.assertEqual(desktop['minSupportedVersion'], '2.0.0')


@override_settings(SECURE_SSL_REDIRECT=False, CI_VERSION_UPDATE_TOKEN=TEST_TOKEN)
class AppVersionUpdateViewTests(TestCase):
    """POST /api/v1/platform/app-versions/{app_key}/"""

    def setUp(self):
        self.client = APIClient()
        self.app_version = AppVersion.objects.create(
            app_key='offline_desktop',
            latest_version='1.0.0',
            min_supported_version='0.9.0',
            download_url='https://downloads.eduignite.com/eduignite-offline-setup.exe',
            release_notes='Initial release.',
        )

    def _post(self, app_key, body, token=None):
        headers = {}
        if token is not None:
            headers['HTTP_AUTHORIZATION'] = f'Bearer {token}'
        return self.client.post(
            f'/api/v1/platform/app-versions/{app_key}/', body, format='json', **headers
        )

    def test_post_without_token_is_rejected(self):
        response = self._post('offline_desktop', {'latestVersion': '1.1.0'})
        self.assertIn(response.status_code, (401, 403))
        self.app_version.refresh_from_db()
        self.assertEqual(self.app_version.latest_version, '1.0.0')

    def test_post_with_wrong_token_is_rejected(self):
        response = self._post('offline_desktop', {'latestVersion': '1.1.0'}, token='not-the-real-token')
        self.assertIn(response.status_code, (401, 403))
        self.app_version.refresh_from_db()
        self.assertEqual(self.app_version.latest_version, '1.0.0')

    def test_post_with_correct_token_updates_allowed_fields_only(self):
        response = self._post(
            'offline_desktop',
            {
                'latestVersion': '1.1.0',
                'downloadUrl': 'https://downloads.eduignite.com/eduignite-offline-setup-v2.exe',
                'releaseNotes': 'New: dark mode.',
            },
            token=TEST_TOKEN,
        )
        self.assertEqual(response.status_code, 200)

        self.app_version.refresh_from_db()
        self.assertEqual(self.app_version.latest_version, '1.1.0')
        self.assertEqual(
            self.app_version.download_url,
            'https://downloads.eduignite.com/eduignite-offline-setup-v2.exe',
        )
        self.assertEqual(self.app_version.release_notes, 'New: dark mode.')
        # min_supported_version must NEVER move via this endpoint.
        self.assertEqual(self.app_version.min_supported_version, '0.9.0')

    def test_post_with_invalid_app_key_is_rejected_cleanly(self):
        response = self._post('not_a_real_app', {'latestVersion': '9.9.9'}, token=TEST_TOKEN)
        self.assertIn(response.status_code, (400, 404))
        self.assertEqual(AppVersion.objects.filter(app_key='not_a_real_app').count(), 0)

    def test_post_creates_row_for_valid_but_unseeded_app_key(self):
        response = self._post(
            'offline_companion',
            {
                'latestVersion': '1.0.0',
                'downloadUrl': 'https://downloads.eduignite.com/eduignite-companion.apk',
                'releaseNotes': 'First release.',
            },
            token=TEST_TOKEN,
        )
        self.assertEqual(response.status_code, 200)
        row = AppVersion.objects.get(app_key='offline_companion')
        self.assertEqual(row.latest_version, '1.0.0')
        # Brand-new row: min_supported_version defaults to latest_version.
        self.assertEqual(row.min_supported_version, '1.0.0')

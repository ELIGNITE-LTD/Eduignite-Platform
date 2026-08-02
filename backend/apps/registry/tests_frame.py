"""Tests for the client bridge boundary.

These assert the properties the whole client-side security story rests on, so
they are written to fail loudly if someone loosens the sandbox or the policy
without meaning to.
"""

from django.test import SimpleTestCase

from apps.registry.frame_views import FRAME_CSP, BRIDGE_SHIM, _safe_member
from django.http import Http404


class ContentPolicyTests(SimpleTestCase):
    def test_the_frame_cannot_reach_the_network(self):
        """The single most important line in the policy.

        With connect-src 'none', app UI cannot fetch, XHR or open a socket, so
        it has no way to reach the API directly and no way to send what it sees
        anywhere. Everything must go through the host.
        """
        self.assertIn("connect-src 'none'", FRAME_CSP)

    def test_nothing_loads_by_default(self):
        self.assertTrue(FRAME_CSP.startswith("default-src 'none'"))

    def test_the_frame_cannot_submit_forms_anywhere(self):
        self.assertIn("form-action 'none'", FRAME_CSP)

    def test_the_frame_cannot_be_embedded_off_site(self):
        self.assertIn("frame-ancestors 'self'", FRAME_CSP)

    def test_the_frame_cannot_rewrite_its_own_base_url(self):
        self.assertIn("base-uri 'none'", FRAME_CSP)


class BridgeShimTests(SimpleTestCase):
    def test_the_shim_never_handles_a_token(self):
        """App UI has no session and must never be handed one."""
        lowered = BRIDGE_SHIM.lower()
        for secret in ('token', 'authorization', 'cookie', 'localstorage', 'sessionstorage'):
            self.assertNotIn(secret, lowered, f'bridge shim mentions {secret}')

    def test_the_shim_does_not_fetch(self):
        lowered = BRIDGE_SHIM.lower()
        for network in ('fetch(', 'xmlhttprequest', 'websocket', 'eventsource'):
            self.assertNotIn(network, lowered, f'bridge shim uses {network}')

    def test_the_shim_exposes_only_the_documented_surface(self):
        for member in ('data', 'core', 'call', 'ui', 'context', 'theme'):
            self.assertIn(member, BRIDGE_SHIM)


class AssetPathTests(SimpleTestCase):
    def test_only_web_and_assets_are_reachable(self):
        self.assertEqual(_safe_member('web/register.js'), 'web/register.js')
        self.assertEqual(_safe_member('assets/logo.png'), 'assets/logo.png')

    def test_server_code_is_never_served(self):
        """Serving an app's Python over HTTP would leak its logic wholesale."""
        with self.assertRaises(Http404):
            _safe_member('server/handlers.py')

    def test_the_manifest_is_not_served(self):
        with self.assertRaises(Http404):
            _safe_member('manifest.json')

    def test_traversal_is_refused(self):
        for path in ('../secret', 'web/../../etc/passwd', '/etc/passwd', 'web\\..\\x'):
            with self.assertRaises(Http404):
                _safe_member(path)

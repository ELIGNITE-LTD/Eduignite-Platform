"""The browser must be told about every header the apps send.

A custom header the server has not listed makes the browser block the request
before it leaves the machine. The app cannot tell that apart from the network
being down, so it says "network error" - which is what signing in from the web
did after the offline work started sending an idempotency key on every write,
while browsing carried on working because reads send no custom headers.

This test fails if a header is ever added to a request without being allowed
here, so that never happens quietly again.
"""

from django.conf import settings
from django.test import TestCase

# Every custom header the apps put on a request. Keep this in step with
# apps/*/src/lib/api/client.ts and src/lib/offline.ts.
HEADERS_THE_APPS_SEND = [
    'authorization',
    'content-type',
    # Added by the offline layer: the key that stops a replayed write being
    # recorded twice, when it was recorded, and whether this is a replay.
    'idempotency-key',
    'x-offline-recorded-at',
    'x-eduignite-replay',
]


class CorsAllowedHeadersTests(TestCase):
    def test_every_header_the_apps_send_is_allowed(self):
        allowed = {header.lower() for header in settings.CORS_ALLOW_HEADERS}

        missing = [h for h in HEADERS_THE_APPS_SEND if h not in allowed]

        self.assertEqual(
            missing,
            [],
            'These headers are sent by the apps but not allowed by CORS, so the '
            'browser will block every request carrying them and the app will '
            f'report a network error: {missing}',
        )

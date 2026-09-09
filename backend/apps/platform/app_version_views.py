"""App-update-check endpoints for every shipped EduIgnite client.

Kept in its own module (not ``public_site_views.py``, which is scoped to the
public marketing website) because the audience and write-path are different:
this is read by installed *apps* (mobile/desktop/offline-desktop/offline
-companion), and it has a second, CI-only write endpoint that never applies
to that file's "anonymous, uncredentialed, read-only" scope.

Why this exists at all: ``Eduignite-Platform`` is a PRIVATE repo, so a
shipped consumer app (APK/EXE in someone's hands) can never safely call
GitHub's API to check ``releases/latest`` directly — there is no token that
can be embedded in a client without handing out real repo access to every
installer. Version-checking instead goes through this small, genuinely
public, non-sensitive endpoint on the platform's own backend.

Two endpoints:

* ``GET  /api/v1/platform/app-versions/`` — public, no auth, no caching
  (this is called on every app startup and the data must never be stale by
  more than the write itself; the row count is 4, so there is no load
  concern that would justify caching like ``public_site_views.py`` does for
  marketing content).
* ``POST /api/v1/platform/app-versions/{app_key}/`` — called ONLY by CI at
  the end of a successful release workflow. Authenticated with a shared
  -secret bearer token (``settings.CI_VERSION_UPDATE_TOKEN``), not Django
  user auth — CI has no logged-in user context.
"""

import hmac

from django.conf import settings
from drf_spectacular.utils import extend_schema, OpenApiExample
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AppKey, AppVersion


def _serialize(app_version):
    """One AppVersion row -> the camelCase shape every client consumes."""
    return {
        'latestVersion': app_version.latest_version,
        'minSupportedVersion': app_version.min_supported_version,
        'downloadUrl': app_version.download_url,
        'releaseNotes': app_version.release_notes,
        'size': app_version.size,
        'updatedAt': app_version.updated_at.isoformat(),
    }


class AppVersionListView(APIView):
    """
    GET /api/v1/platform/app-versions/

    PUBLIC. No auth, no permissions beyond AllowAny — this is just version
    numbers and a download URL, nothing sensitive, and every shipped client
    (including ones with no logged-in user yet) must be able to read it.

    Response shape — a flat JSON object keyed by app_key, NOT a list, so
    clients never need to search an array:

        {
          "mobile": {
            "latestVersion": "1.2.3",
            "minSupportedVersion": "1.0.0",
            "downloadUrl": "https://.../eduignite-mobile.apk",
            "releaseNotes": "...",
            "size": "79.4 MB",
            "updatedAt": "2026-09-06T12:00:00.000000+00:00"
          },
          "desktop": { ... },
          "offline_desktop": { ... },
          "offline_companion": { ... }
        }

    An app_key with no row yet is simply absent from the object — clients
    must treat a missing key the same as "no update info available" and
    skip any update UI, never treat it as an error.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(
        tags=['Platform'],
        description='Public, unauthenticated version info for every shipped EduIgnite app.',
        examples=[
            OpenApiExample(
                'App versions',
                value={
                    'mobile': {
                        'latestVersion': '1.2.3',
                        'minSupportedVersion': '1.0.0',
                        'downloadUrl': 'https://downloads.eduignite.com/eduignite-mobile.apk',
                        'releaseNotes': 'Bug fixes and performance improvements.',
                        'size': '79.4 MB',
                        'updatedAt': '2026-09-06T12:00:00Z',
                    },
                },
            ),
        ],
    )
    def get(self, request):
        rows = AppVersion.objects.all()
        data = {row.app_key: _serialize(row) for row in rows}
        return Response(data)


class AppVersionUpdateSerializer(serializers.Serializer):
    """Body for the CI-only update endpoint.

    Deliberately has NO field for ``minSupportedVersion`` — that floor is a
    manual human decision made in Django admin, never something CI can move.
    """

    latestVersion = serializers.CharField(max_length=32, required=False)
    downloadUrl = serializers.URLField(required=False)
    releaseNotes = serializers.CharField(required=False, allow_blank=True)
    size = serializers.CharField(max_length=32, required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                'Provide at least one of latestVersion, downloadUrl, releaseNotes.'
            )
        return attrs


class AppVersionUpdateView(APIView):
    """
    POST /api/v1/platform/app-versions/{app_key}/

    Called ONLY by CI at the end of a successful release workflow, never by
    end users and never by a logged-in dashboard user — so this does not use
    Django user auth at all. Instead it checks a shared-secret bearer token
    (``Authorization: Bearer <token>``) against ``settings.CI_VERSION_UPDATE_TOKEN``
    using a constant-time comparison (``hmac.compare_digest``) so the check
    itself cannot leak the token via a timing side-channel.

    Body: ``{"latestVersion": "...", "downloadUrl": "...", "releaseNotes": "...", "size": "..."}``.
    ``size`` is optional (human-readable, e.g. "79.4 MB") — older callers that
    don't send it simply leave the row's existing value untouched.
    Updates ONLY those three fields. ``min_supported_version`` is never
    touched here under any circumstances — see the model docstring and
    ``admin.py``.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @staticmethod
    def _token_is_valid(request):
        expected = getattr(settings, 'CI_VERSION_UPDATE_TOKEN', '') or ''
        if not expected:
            # Misconfigured (no token set) must never fall open — reject
            # everything rather than let an empty token match an empty header.
            return False
        header = request.META.get('HTTP_AUTHORIZATION', '') or ''
        prefix = 'Bearer '
        if not header.startswith(prefix):
            return False
        provided = header[len(prefix):].strip()
        return hmac.compare_digest(provided, expected)

    @extend_schema(
        tags=['Platform'],
        description='CI-only: publish a new latest_version/download_url/release_notes for one app.',
    )
    def post(self, request, app_key):
        if not self._token_is_valid(request):
            return Response(
                {'detail': 'Missing or invalid CI update token.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if app_key not in AppKey.values:
            return Response(
                {'detail': f'Unknown app_key "{app_key}". Must be one of: {", ".join(AppKey.values)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AppVersionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        app_version, _created = AppVersion.objects.get_or_create(
            app_key=app_key,
            defaults={
                'latest_version': payload.get('latestVersion', '0.0.0'),
                'download_url': payload.get('downloadUrl', ''),
                'release_notes': payload.get('releaseNotes', ''),
                'size': payload.get('size', ''),
            },
        )

        if not _created:
            if 'latestVersion' in payload:
                app_version.latest_version = payload['latestVersion']
            if 'downloadUrl' in payload:
                app_version.download_url = payload['downloadUrl']
            if 'releaseNotes' in payload:
                app_version.release_notes = payload['releaseNotes']
            if 'size' in payload:
                app_version.size = payload['size']
            # min_supported_version is intentionally never assigned here.
            app_version.save(update_fields=['latest_version', 'download_url', 'release_notes', 'size', 'updated_at'])

        return Response(_serialize(app_version), status=status.HTTP_200_OK)

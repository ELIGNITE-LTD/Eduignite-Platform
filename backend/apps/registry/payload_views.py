"""Everything a client needs to render one screen, in a single response.

Stage 4 served the frame as an HTML document from this origin. That cannot work
offline: the frame is a network load, and a service worker registered on the
client's own origin cannot intercept requests for a cross-origin iframe.

So the client fetches this payload once, caches it against the app version, and
composes the frame document itself with ``srcdoc``. The sandbox is unchanged —
``srcdoc`` plus ``sandbox="allow-scripts"`` still gives an opaque origin with no
session — but the whole screen now works from cache with no network at all.

The shim still lives on the server rather than in the client, so there is one
copy of the app-facing contract, and a client on an old release cannot pair a
stale shim with a new app.
"""

import zipfile

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import api as registry_api
from .build_models import AppPackage
from .frame_views import BRIDGE_SHIM, FRAME_CSP, _safe_member
from .storage import PackageUnavailable, local_package_path

#: A bundle is inlined into the frame document, so it has to stay small enough
#: to hold in memory and ship over a slow connection.
MAX_BUNDLE_BYTES = 2 * 1024 * 1024


class AppScreenPayloadView(APIView):
    """
    GET /registry/apps/<app_key>/screen/<screen_id>/payload/
    The shim, the bundle and the policy for one screen.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['App Registry'],
        description='Everything needed to render one app screen, cacheable by version.',
    )
    def get(self, request, app_key, screen_id):
        user = request.user
        school_id = getattr(user, 'school_id', None)

        if not registry_api.is_installed_for_user(user, app_key):
            return Response(
                {'detail': 'This app is not available for your account.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        package = (
            AppPackage.objects.select_related('live_build').filter(key=app_key).first()
        )
        if package is None:
            return Response({'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND)

        installation = registry_api.get_installation(school_id, app_key)
        build = (installation.pinned_build if installation else None) or package.live_build
        if build is None or not build.is_runnable:
            return Response(
                {'detail': 'This app is not available right now.'},
                status=status.HTTP_409_CONFLICT,
            )

        manifest = build.manifest or {}
        screen = next(
            (
                s for s in manifest.get('screens') or []
                if isinstance(s, dict) and s.get('id') == screen_id
            ),
            None,
        )
        if screen is None:
            return Response(
                {'detail': 'No such screen.'}, status=status.HTTP_404_NOT_FOUND
            )

        role = str(getattr(user, 'role', '') or '').upper()
        allowed = list(screen.get('roles') or []) or list(manifest.get('roles') or [])
        if allowed and role not in allowed:
            return Response(
                {'detail': 'Your role cannot open this screen.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        entry = screen.get('entry') or ''
        try:
            member = _safe_member(entry)
        except Exception:
            return Response(
                {'detail': 'This screen has no valid bundle.'},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            # A local copy: zipfile seeks constantly, and seeking an S3 file
            # object re-fetches. Builds are immutable so the copy cannot go
            # stale.
            path = local_package_path(build)
            with open(path, 'rb') as archive_file:
                with zipfile.ZipFile(archive_file) as archive:
                    info = archive.getinfo(member)
                    if info.file_size > MAX_BUNDLE_BYTES:
                        return Response(
                            {'detail': 'This screen’s bundle is too large to load.'},
                            status=status.HTTP_409_CONFLICT,
                        )
                    bundle = archive.read(member).decode('utf-8')
        except PackageUnavailable:
            return Response(
                {'detail': 'This app could not be loaded.'},
                status=status.HTTP_409_CONFLICT,
            )
        except KeyError:
            return Response(
                {'detail': 'This screen’s bundle is missing from the package.'},
                status=status.HTTP_409_CONFLICT,
            )
        except (OSError, UnicodeDecodeError, zipfile.BadZipFile):
            return Response(
                {'detail': 'This app could not be read.'},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                # Version is the cache key on the client. A school on a pinned
                # build keeps getting that build's payload, so taking an update
                # is the only thing that changes what it runs.
                'version': build.version,
                'app_key': app_key,
                'screen_id': screen_id,
                'title': screen.get('title') or screen_id,
                'shim': BRIDGE_SHIM,
                'bundle': bundle,
                'csp': FRAME_CSP,
            }
        )

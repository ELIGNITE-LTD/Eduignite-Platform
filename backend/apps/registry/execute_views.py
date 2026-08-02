"""Calling an app's server handler.

The only route by which app code ever runs for a request. Everything is checked
before the runner is touched, in this order:

1. the caller is signed in;
2. the app exists and is uploaded (built-in apps have no handlers to call);
3. the caller's school actually has the app installed and in date;
4. the handler is one the manifest declares;
5. the caller's role is allowed to reach it.

Only then does anything execute, in a child process, with limits.
"""

import logging

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import api as registry_api
from .build_models import AppPackage
from .runner import run_handler
from .storage import PackageUnavailable, local_package_path

logger = logging.getLogger(__name__)


def _declared_handlers(manifest: dict) -> dict:
    """Handler name -> (target, roles allowed to call it).

    A handler the manifest never declares does not exist as far as this
    endpoint is concerned, so an app cannot ship a private back door and reach
    it from its own UI. The caller names the *handler*; only the manifest says
    which function that runs, so a request cannot choose arbitrary code.

    Jobs are deliberately absent: they are callable by the scheduler only.
    """
    handlers = {}
    for entry in manifest.get('handlers') or []:
        if isinstance(entry, dict) and entry.get('name') and entry.get('target'):
            handlers[str(entry['name'])] = (
                str(entry['target']),
                list(entry.get('roles') or []),
            )
    return handlers


class AppCallView(APIView):
    """
    POST /registry/apps/<app_key>/call/<handler>/
    Run an app's server handler for the caller's school.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['App Registry'], description="Invoke an uploaded app's handler.")
    def post(self, request, app_key, handler):
        user = request.user
        school_id = getattr(user, 'school_id', None)
        if not school_id:
            return Response(
                {'detail': 'You are not attached to a school.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        package = (
            AppPackage.objects.select_related('live_build')
            .filter(key=app_key)
            .first()
        )
        if package is None:
            return Response(
                {'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND
            )

        # A school runs its pinned build, not whatever is newest. Falling back
        # to the live build covers an installation made before pinning existed.
        installation = registry_api.get_installation(school_id, app_key)
        build = (installation.pinned_build if installation else None) or package.live_build

        if build is None or not build.is_runnable:
            return Response(
                {'detail': 'This app is not available right now.'},
                status=status.HTTP_409_CONFLICT,
            )

        if not registry_api.is_installed_for_user(user, app_key):
            return Response(
                {'detail': 'This app is not part of your school\'s subscription.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        manifest = build.manifest or {}
        declared = _declared_handlers(manifest)
        if handler not in declared:
            return Response(
                {'detail': f'{app_key} does not expose a handler called {handler!r}.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        target, handler_roles = declared[handler]
        allowed_roles = handler_roles or manifest.get('roles') or []
        role = str(getattr(user, 'role', '') or '').upper()
        if allowed_roles and role not in allowed_roles:
            return Response(
                {'detail': 'Your role cannot use this part of the app.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload = request.data if isinstance(request.data, dict) else {}

        try:
            # Never .path: production stores packages on S3, where that raises.
            package_path = local_package_path(build)
        except PackageUnavailable as exc:
            logger.error('Package unavailable for %s %s: %s', app_key, build.version, exc)
            return Response(
                {'detail': 'This app could not be loaded.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            result = run_handler(
                app_key=app_key,
                version=build.version,
                handler=target,
                manifest=manifest,
                package_path=package_path,
                school_id=school_id,
                user_id=user.id,
                payload=payload,
            )
        except Exception:  # noqa: BLE001 - a platform fault, not an app one
            logger.exception('App runner failed for %s.%s', app_key, handler)
            return Response(
                {'detail': 'The app could not be run.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if result.ok:
            return Response({'value': result.value})

        # An app failing is a 422, not a 500: the platform worked, the app did
        # not. Internals stay in the log; the caller gets something readable.
        logger.warning(
            'App %s.%s failed for school %s: %s\n%s',
            app_key, handler, school_id, result.error, result.traceback,
        )
        return Response(
            {
                'detail': (
                    'This app took too long and was stopped.'
                    if result.timed_out
                    else 'This app could not complete that action.'
                ),
                'error_type': result.error_type,
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

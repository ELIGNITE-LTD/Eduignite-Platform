"""Data endpoints the app UI reaches through the bridge.

App *UI* cannot call these directly — the iframe has no network access at all
(see frame_views.py). It posts a message to the host, and the host makes the
request with its own session. So every call here arrives from EduIgnite's own
client, already authenticated, with the app named in the URL rather than
chosen by the app.

No app code executes here. These use the same DataService the server runtime
uses, so the scoping and permission rules are identical whether a read comes
from a handler or from a screen. That matters: two paths to the same data with
two sets of rules is how one of them ends up wrong.
"""

import logging

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import api as registry_api
from .collection_schema import ValidationError
from .sdk import AppContext, PermissionError_, SdkError

logger = logging.getLogger(__name__)

READ_ACTIONS = {'query', 'get', 'count'}
WRITE_ACTIONS = {'insert', 'update', 'delete'}


def _resolve(request, app_key):
    """The manifest this school runs for this app, or an error response."""
    user = request.user
    school_id = getattr(user, 'school_id', None)
    if not school_id:
        return None, None, Response(
            {'detail': 'You are not attached to a school.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not registry_api.is_installed_for_user(user, app_key):
        return None, None, Response(
            {'detail': 'This app is not available for your account.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    from .build_models import AppPackage

    package = (
        AppPackage.objects.select_related('live_build').filter(key=app_key).first()
    )
    if package is None:
        return None, None, Response(
            {'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND
        )

    installation = registry_api.get_installation(school_id, app_key)
    build = (installation.pinned_build if installation else None) or package.live_build
    if build is None or not build.is_runnable:
        return None, None, Response(
            {'detail': 'This app is not available right now.'},
            status=status.HTTP_409_CONFLICT,
        )
    return build, school_id, None


class AppDataView(APIView):
    """
    POST /registry/apps/<app_key>/data/<collection>/<action>/
    Scoped reads and writes for one app's own collection.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['App Registry'], description="Read or write an app's own data.")
    def post(self, request, app_key, collection, action):
        if action not in READ_ACTIONS | WRITE_ACTIONS:
            return Response(
                {'detail': f'Unknown action {action!r}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        build, school_id, error = _resolve(request, app_key)
        if error is not None:
            return error

        body = request.data if isinstance(request.data, dict) else {}
        context = AppContext(
            app_key=app_key,
            school_id=school_id,
            manifest_raw=build.manifest or {},
            user=request.user,
        )

        try:
            handle = context.data.collection(collection)
            if action == 'query':
                value = handle.query(
                    where=body.get('where'),
                    order_by=body.get('order_by'),
                    limit=body.get('limit'),
                    offset=body.get('offset') or 0,
                )
            elif action == 'get':
                value = handle.get(body.get('id'))
            elif action == 'count':
                value = handle.count(where=body.get('where'))
            elif action == 'insert':
                value = handle.insert(body.get('values') or {})
            elif action == 'update':
                value = handle.update(body.get('id'), body.get('values') or {})
            else:
                value = handle.delete(body.get('id'))
        except PermissionError_ as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except (SdkError, ValidationError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:  # noqa: BLE001
            logger.exception('App data call failed: %s.%s.%s', app_key, collection, action)
            return Response(
                {'detail': 'That could not be completed.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({'value': value})


class AppCoreView(APIView):
    """
    GET /registry/apps/<app_key>/core/<resource>/
    Read-only platform data, scoped to the caller's school.
    """

    permission_classes = [IsAuthenticated]
    RESOURCES = {'students', 'staff', 'classes'}

    @extend_schema(tags=['App Registry'], description='Read Core data an app declared.')
    def get(self, request, app_key, resource):
        if resource not in self.RESOURCES:
            return Response(
                {'detail': f'Unknown resource {resource!r}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        build, school_id, error = _resolve(request, app_key)
        if error is not None:
            return error

        context = AppContext(
            app_key=app_key,
            school_id=school_id,
            manifest_raw=build.manifest or {},
            user=request.user,
        )

        try:
            if resource == 'students':
                value = context.core.students(
                    school_class=request.query_params.get('school_class') or None,
                    class_name=request.query_params.get('class_name') or '',
                )
            elif resource == 'staff':
                roles = request.query_params.getlist('role') or None
                value = context.core.staff(roles=roles)
            else:
                value = context.core.classes()
        except PermissionError_ as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except Exception:  # noqa: BLE001
            logger.exception('App core read failed: %s.%s', app_key, resource)
            return Response(
                {'detail': 'That could not be completed.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({'value': value})

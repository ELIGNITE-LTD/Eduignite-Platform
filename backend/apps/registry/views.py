"""Executive Console endpoints for the App Registry.

Two audiences:

* founders (CEO / CTO / SUPER_ADMIN), who see the catalogue and install or
  remove apps for any school;
* everyone else, who may only ask which apps *their own* school has, so the
  clients know what to show in navigation.

The second one matters: every signed-in client calls ``my-apps`` on load, so it
is deliberately cheap and reveals nothing beyond the school's own entitlements.
"""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.executive_access import executive_module_required

from . import api as registry_api
from .api import RegistryError

AppRegistryModule = executive_module_required('app_registry')


class MyAppsView(APIView):
    """
    GET /registry/my-apps/
    The signed-in user's available apps, for building navigation.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['App Registry'], description="Apps available to the caller's school.")
    def get(self, request):
        user = request.user
        is_exec = bool(getattr(user, 'is_platform_executive', False))
        keys = (
            {m.key for m in registry_api.list_catalogue()}
            if is_exec
            else registry_api.installed_app_keys(getattr(user, 'school_id', None))
        )

        apps = []
        screens_by_app = registry_api.screens_for_apps(keys)
        for manifest in registry_api.list_catalogue():
            if manifest.key not in keys:
                continue
            entry = manifest.as_dict()
            # Uploaded apps contribute screens; built-in apps own fixed routes.
            # Both end up as routes the client can navigate to, so navigation
            # does not need to know which kind an app is.
            screens = screens_by_app.get(manifest.key, [])
            entry['screens'] = screens
            if screens:
                entry['routes'] = [s['route'] for s in screens]
            apps.append(entry)
        return Response(
            {
                'installed_keys': sorted(keys),
                'apps': apps,
                # Routes the client should allow. Navigation filters on this.
                'routes': sorted(
                    {route for app in apps for route in app['routes']}
                ),
                # Every route any app in the catalogue owns, installed or not.
                # A client needs this to recognise a route that belongs to an
                # app this school does NOT have; judged only against 'routes'
                # it would mistake it for an ungated core page and show it.
                'claimed_routes': sorted(
                    {route for manifest in registry_api.list_catalogue() for route in manifest.routes}
                ),
                'is_platform_executive': is_exec,
            }
        )


class CatalogueView(APIView):
    """
    GET /registry/catalogue/
    Every app in this release. Founders only.
    """

    permission_classes = [AppRegistryModule]

    @extend_schema(tags=['App Registry'], description='Every app in this release.')
    def get(self, request):
        return Response({'apps': [m.as_dict() for m in registry_api.list_catalogue()]})


class SchoolAppsView(APIView):
    """
    GET  /registry/schools/<school_id>/apps/   — catalogue annotated for a school
    POST /registry/schools/<school_id>/apps/   — install / uninstall / set expiry

    POST body:
        {"app_key": "attendance", "action": "install",
         "licence_expiry": "2026-09-01", "note": "Paid to end of year"}

    ``action`` is one of install, uninstall, set_expiry.
    """

    permission_classes = [AppRegistryModule]

    @extend_schema(tags=['App Registry'], description='Apps for one school, with state.')
    def get(self, request, school_id):
        return Response({'apps': registry_api.describe_for_school(school_id)})

    @extend_schema(tags=['App Registry'], description='Install or remove an app for a school.')
    def post(self, request, school_id):
        data = request.data if isinstance(request.data, dict) else {}
        app_key = (data.get('app_key') or '').strip()
        action = (data.get('action') or 'install').strip()
        expiry = data.get('licence_expiry') or None
        note = (data.get('note') or '').strip()

        if not app_key:
            return Response(
                {'detail': 'app_key is required.'}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            if action == 'install':
                registry_api.install(
                    school_id, app_key, by=request.user, licence_expiry=expiry, note=note
                )
            elif action == 'uninstall':
                registry_api.uninstall(school_id, app_key, by=request.user, note=note)
            elif action == 'set_expiry':
                registry_api.set_licence_expiry(school_id, app_key, expiry)
            else:
                return Response(
                    {'detail': f'Unknown action {action!r}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except RegistryError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'apps': registry_api.describe_for_school(school_id)})

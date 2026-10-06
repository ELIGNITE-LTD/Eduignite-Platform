"""The school-facing app store.

The Executive Console lets founders install apps for any school. This is the
other side: a school administrator browses the published apps and installs them
for their *own* school, paying by mobile money when an app costs money.

A founder installs on a school's behalf; a school installs for itself. Both end
in the same place — an AppInstallation — so nothing downstream cares which
route was taken.

Only a school administrator (or an executive acting for their own school) may
reach these. A teacher cannot buy apps for the school.
"""

import logging

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import api as registry_api
from .build_models import AppPackage
from .pricing import default_expiry, effective

logger = logging.getLogger(__name__)

SCHOOL_BUYER_ROLES = {'SCHOOL_ADMIN', 'SUB_ADMIN'}


def _may_buy_for_school(user) -> bool:
    role = str(getattr(user, 'role', '') or '').upper()
    return role in SCHOOL_BUYER_ROLES and getattr(user, 'school_id', None)


class AppStoreView(APIView):
    """
    GET /registry/store/
    Published apps a school can install, with pricing and install state.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['App Store'], description='Published apps installable by a school.')
    def get(self, request):
        user = request.user
        school_id = getattr(user, 'school_id', None)
        if not school_id:
            return Response({'apps': []})

        installed = registry_api.installed_app_keys(school_id)

        rows = []
        packages = (
            AppPackage.objects.select_related('live_build')
            .filter(is_listed=True, live_build__isnull=False)
        )
        for package in packages:
            build = package.live_build
            if build is None or not build.is_runnable:
                continue
            # The publisher's audience decides whether this school sees it.
            if not registry_api.is_visible_to_school(package, school_id):
                continue
            manifest = build.manifest or {}
            installation = registry_api.get_installation(school_id, package.key)
            rows.append({
                'key': package.key,
                'name': package.name,
                'summary': manifest.get('summary', ''),
                'icon': manifest.get('icon', 'Boxes'),
                'icon_image': package.icon_image or '',
                'description': package.description or '',
                'version': build.version,
                'publisher': package.publisher,
                'pricing': effective(package),
                'installed': package.key in installed,
                'licence_expiry': (
                    installation.licence_expiry.isoformat()
                    if installation and installation.licence_expiry else None
                ),
                'expired': bool(installation and installation.is_expired),
                'can_manage': bool(_may_buy_for_school(user)),
            })

        rows.sort(key=lambda row: row['name'].lower())
        return Response({'apps': rows, 'can_manage': bool(_may_buy_for_school(user))})


class AppStoreInstallView(APIView):
    """
    POST /registry/store/<app_key>/install/
    A school installs an app for itself.

    Free apps install at once. A paid app returns what it costs and where to
    pay — the actual money is taken through the mobile-money endpoint, and the
    install happens when that payment confirms, never before.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['App Store'], description='Install a published app for your own school.')
    def post(self, request, app_key):
        user = request.user
        if not _may_buy_for_school(user):
            return Response(
                {'detail': 'Only a school administrator can install apps for the school.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        school_id = user.school_id

        package = AppPackage.objects.select_related('live_build').filter(
            key=app_key, is_listed=True
        ).first()
        if package is None or package.live_build is None or not package.live_build.is_runnable:
            return Response(
                {'detail': 'That app is not available.'}, status=status.HTTP_404_NOT_FOUND
            )

        # The roles the school wants this app for. Empty / "everyone" means
        # every role the app is built for.
        body = request.data if isinstance(request.data, dict) else {}
        roles = body.get('roles') or []

        pricing = effective(package)

        # Free: install immediately for the chosen roles, and notify them.
        if pricing.get('model') == 'free' or float(pricing.get('price') or 0) <= 0:
            try:
                registry_api.install(
                    school_id, app_key, by=user, allowed_roles=roles,
                    note='Installed by the school.',
                )
            except registry_api.RegistryError as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            return Response({'installed': True, 'paid': False})

        # Paid: tell the client to collect payment, carrying the chosen roles so
        # the install applies them once the payment confirms. The install is
        # deferred to that moment, so the school is never charged for nothing
        # and never gets the app for nothing.
        #
        # Returned as 200, not 402: a browser client treats any non-2xx as a
        # failed request and would never read this body, so "payment required"
        # has to arrive as a success the client can act on.
        return Response(
            {
                'installed': False,
                'payment_required': True,
                'app_key': app_key,
                'roles': roles,
                'amount': pricing.get('price'),
                'currency': pricing.get('currency', 'XAF'),
                'model': pricing.get('model'),
                'interval': pricing.get('interval', ''),
                'collect_url': '/api/v1/fees/fapshi/app-purchase/',
            },
            status=status.HTTP_200_OK,
        )


class AppStoreUninstallView(APIView):
    """
    POST /registry/store/<app_key>/uninstall/
    A school removes an app from itself. Its data is kept.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['App Store'], description='Remove an app from your own school.')
    def post(self, request, app_key):
        user = request.user
        if not _may_buy_for_school(user):
            return Response(
                {'detail': 'Only a school administrator can manage the school\'s apps.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            registry_api.uninstall(user.school_id, app_key, by=user, note='Removed by the school.')
        except registry_api.RegistryError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'uninstalled': True})

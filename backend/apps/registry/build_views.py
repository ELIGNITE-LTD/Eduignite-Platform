"""Developer and reviewer endpoints for uploaded apps.

Founders only, throughout. There is no public or school-facing surface here —
schools see published apps through the ordinary catalogue, and never see a
build that has not been through review.
"""

import hashlib

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.platform.permissions import IsExecutive

from . import lifecycle
from .build_models import AppBuild, AppPackage, BuildState
from .package import MAX_PACKAGE_BYTES, PackageError, read_package


def _pricing_of(package) -> dict:
    from .pricing import effective

    return effective(package)


def _serialize_build(build: AppBuild) -> dict:
    return {
        'id': str(build.id),
        'app_key': build.package.key,
        'app_name': build.package.name,
        'version': build.version,
        'runtime_api': build.runtime_api,
        'state': build.state,
        'state_label': BuildState(build.state).label,
        'changelog': build.changelog,
        'size_bytes': build.size_bytes,
        'check_report': build.check_report or {},
        'review_note': build.review_note,
        'submitted_by': getattr(build.submitted_by, 'name', '') or '',
        'reviewed_by': getattr(build.reviewed_by, 'name', '') or '',
        'submitted_at': build.submitted_at.isoformat() if build.submitted_at else None,
        'reviewed_at': build.reviewed_at.isoformat() if build.reviewed_at else None,
        'published_at': build.published_at.isoformat() if build.published_at else None,
        'is_live': build.package.live_build_id == build.id,
        'pricing': _pricing_of(build.package),
    }


class AppBuildUploadView(APIView):
    """
    POST /registry/builds/
    Upload an .eia package. Creates a Draft build; nothing runs.

    The package is validated before a byte is stored, so a malformed upload
    never becomes a row someone has to clean up later.
    """

    permission_classes = [IsExecutive]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(tags=['App Registry'], description='Upload an .eia package as a draft build.')
    def post(self, request):
        upload = request.FILES.get('package')
        if upload is None:
            return Response(
                {'detail': 'Attach the .eia package as "package".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if upload.size > MAX_PACKAGE_BYTES:
            return Response(
                {'detail': f'Package is larger than {MAX_PACKAGE_BYTES // (1024 * 1024)} MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            contents = read_package(upload)
        except PackageError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        manifest = contents.manifest
        raw = contents.raw_manifest
        key = manifest.key

        # An uploaded app may never take a built-in app's key: that would let an
        # upload silently replace Attendance or Fees for every school.
        from .manifest import get_manifest

        if get_manifest(key) is not None:
            return Response(
                {'detail': f'{key!r} is a built-in app. An uploaded app cannot use its key.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .pricing import pricing_from_manifest

        package, created = AppPackage.objects.get_or_create(
            key=key,
            defaults={
                'name': manifest.name,
                'publisher': str(raw.get('publisher') or 'EduIgnite'),
                # Seed the founder-editable pricing from the manifest's default.
                # Only on first upload — later uploads never silently reprice an
                # app the founder has already set a price for.
                'pricing': pricing_from_manifest(raw),
            },
        )
        version = str(raw.get('version'))
        if AppBuild.objects.filter(package=package, version=version).exists():
            return Response(
                {'detail': f'Version {version} of {key!r} has already been uploaded.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        upload.seek(0)
        digest = hashlib.sha256(upload.read()).hexdigest()
        upload.seek(0)

        build = AppBuild.objects.create(
            package=package,
            version=version,
            runtime_api=str(raw.get('runtime_api') or '1.x'),
            manifest=raw,
            changelog=contents.changelog,
            package_file=upload,
            size_bytes=upload.size,
            checksum=digest,
            state=BuildState.DRAFT,
            submitted_by=request.user,
        )
        return Response(_serialize_build(build), status=status.HTTP_201_CREATED)


class AppBuildListView(APIView):
    """
    GET /registry/builds/
    Every build, newest first. Filter with ?app_key= or ?state=.
    """

    permission_classes = [IsExecutive]

    @extend_schema(tags=['App Registry'], description='List uploaded builds.')
    def get(self, request):
        builds = AppBuild.objects.select_related('package', 'submitted_by', 'reviewed_by')
        app_key = request.query_params.get('app_key')
        state = request.query_params.get('state')
        if app_key:
            builds = builds.filter(package__key=app_key)
        if state:
            builds = builds.filter(state=state)
        return Response({'builds': [_serialize_build(b) for b in builds[:200]]})


class AppBuildActionView(APIView):
    """
    POST /registry/builds/<id>/<action>/
    Move a build through the lifecycle.

    Actions: submit, approve, reject, publish, pull.
    """

    permission_classes = [IsExecutive]

    ACTIONS = {'submit', 'approve', 'reject', 'publish', 'pull'}

    @extend_schema(tags=['App Registry'], description='Advance a build through the review lifecycle.')
    def post(self, request, build_id, action):
        if action not in self.ACTIONS:
            return Response(
                {'detail': f'Unknown action {action!r}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        build = (
            AppBuild.objects.select_related('package', 'submitted_by')
            .filter(id=build_id)
            .first()
        )
        if build is None:
            return Response({'detail': 'No such build.'}, status=status.HTTP_404_NOT_FOUND)

        note = str((request.data or {}).get('note') or '').strip()

        try:
            if action == 'submit':
                lifecycle.submit(build, by=request.user)
            elif action == 'approve':
                lifecycle.approve(build, by=request.user, note=note)
            elif action == 'reject':
                lifecycle.reject(build, by=request.user, note=note)
            elif action == 'publish':
                lifecycle.publish(build)
            elif action == 'pull':
                lifecycle.pull(build, reason=note)
        except lifecycle.LifecycleError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        build.refresh_from_db()
        return Response(_serialize_build(build))


class AppPricingView(APIView):
    """
    GET  /registry/apps/<app_key>/pricing/   — current pricing
    POST /registry/apps/<app_key>/pricing/   — set it

    The founder decides how an app is charged for, and can change it without a
    rebuild. Body: {"model": "subscription", "interval": "termly",
    "price": 10000, "currency": "XAF"}.
    """

    permission_classes = [IsExecutive]

    def get(self, request, app_key):
        from .pricing import effective

        package = AppPackage.objects.select_related('live_build').filter(key=app_key).first()
        if package is None:
            return Response({'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'pricing': effective(package)})

    def post(self, request, app_key):
        from .pricing import normalise

        package = AppPackage.objects.filter(key=app_key).first()
        if package is None:
            return Response({'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            package.pricing = normalise(request.data if isinstance(request.data, dict) else {})
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        package.save(update_fields=['pricing', 'modified'])
        return Response({'pricing': package.pricing})


class AppIconView(APIView):
    """
    POST /registry/apps/<app_key>/icon/
    Upload the app's icon. Stored as a data URL, so it shows everywhere with no
    separate file to serve and works offline.
    """

    permission_classes = [IsExecutive]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, app_key):
        from core.upload_validation import image_to_data_url, validate_image_upload

        package = AppPackage.objects.filter(key=app_key).first()
        if package is None:
            return Response({'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND)

        upload = request.FILES.get('icon') or request.FILES.get('image')
        error = validate_image_upload(upload, field_label='app icon')
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        package.icon_image = image_to_data_url(upload)
        package.save(update_fields=['icon_image', 'modified'])
        return Response({'icon_image': package.icon_image})

    def delete(self, request, app_key):
        package = AppPackage.objects.filter(key=app_key).first()
        if package is None:
            return Response({'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND)
        package.icon_image = ''
        package.save(update_fields=['icon_image', 'modified'])
        return Response({'icon_image': ''})


class AppDetailsView(APIView):
    """
    GET  /registry/apps/<app_key>/details/   — the app's full description
    POST /registry/apps/<app_key>/details/   — set it

    Body: {"description": "..."}. A fuller write-up than the one-line summary,
    shown on the app's store page and editable without a rebuild.
    """

    permission_classes = [IsExecutive]

    def get(self, request, app_key):
        package = AppPackage.objects.filter(key=app_key).first()
        if package is None:
            return Response({'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'description': package.description or ''})

    def post(self, request, app_key):
        package = AppPackage.objects.filter(key=app_key).first()
        if package is None:
            return Response({'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND)
        data = request.data if isinstance(request.data, dict) else {}
        package.description = str(data.get('description') or '')[:5000]
        package.save(update_fields=['description', 'modified'])
        return Response({'description': package.description})


class AppAudienceView(APIView):
    """
    GET  /registry/apps/<app_key>/audience/   — who can see and install the app
    POST /registry/apps/<app_key>/audience/   — set it, before or after publish

    Body: {"visible_to_all": false, "school_ids": ["<id>", "<id>"]}.
    The publisher decides which schools may see and install their app.
    """

    permission_classes = [IsExecutive]

    def get(self, request, app_key):
        package = AppPackage.objects.filter(key=app_key).first()
        if package is None:
            return Response({'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'visible_to_all': package.visible_to_all,
            'school_ids': list(package.visible_school_ids or []),
        })

    def post(self, request, app_key):
        package = AppPackage.objects.filter(key=app_key).first()
        if package is None:
            return Response({'detail': 'No such app.'}, status=status.HTTP_404_NOT_FOUND)
        data = request.data if isinstance(request.data, dict) else {}
        package.visible_to_all = bool(data.get('visible_to_all', True))
        ids = data.get('school_ids') or []
        package.visible_school_ids = [str(s) for s in ids] if isinstance(ids, list) else []
        package.save(update_fields=['visible_to_all', 'visible_school_ids', 'modified'])
        return Response({
            'visible_to_all': package.visible_to_all,
            'school_ids': package.visible_school_ids,
        })

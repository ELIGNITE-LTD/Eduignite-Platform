import hashlib
import json
import logging

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.schools.models import School

from .certificates import PLAN_ANNUAL, PLAN_FIRST_YEAR_FREE, build_certificate
from .migration.transform import MigrationValidationError, apply_migration, build_report
from .models import (
    DeviceRegistration,
    LicenseIssuance,
    LicensePlanPricing,
    MigrationJob,
    QRChallenge,
    SyncChunk,
    SyncSession,
)
from .permissions import IsSchoolTechnician, user_may_act_for_school
from .serializers import (
    DeviceReplacementChallengeSerializer,
    MigrationImportSerializer,
    QRChallengeSerializer,
    SyncChunkSerializer,
    SyncSessionCreateSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Licensing / QR activation
# ---------------------------------------------------------------------------

def _resolve_license_terms(school, purpose: str):
    """Decide plan + issued/expires window for a challenge redemption.

    - activation: the free first year, UNLESS this school has ever had a
      license issued before (prevents restarting the free entitlement by
      re-activating, per spec section 5's "First Year Free Entitlement
      Guardrails").
    - renewal: always the paid annual plan.
    - device_replacement is handled separately in ``_carry_over_license``,
      which calls neither of these branches.
    """
    if purpose == QRChallenge.Purpose.ACTIVATION:
        ever_issued = LicenseIssuance.objects.filter(school=school).exists()
        plan = PLAN_FIRST_YEAR_FREE if not ever_issued else PLAN_ANNUAL
    else:
        plan = PLAN_ANNUAL
    return plan, None, None  # issued_at/expires_at default inside build_certificate


def _carry_over_license(school):
    """For device_replacement: keep the existing license term, just move it."""
    current = (
        LicenseIssuance.objects.filter(school=school, revoked=False)
        .order_by('-issued_at')
        .first()
    )
    if current is None:
        return PLAN_ANNUAL, None, None
    now = timezone.now()
    expires_at = current.expires_at if current.expires_at > now else None
    return current.plan, now, expires_at


def _process_challenge(request, purpose_choices, *, require_previous_device):
    serializer_class = DeviceReplacementChallengeSerializer if require_previous_device else QRChallengeSerializer
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if data['purpose'] not in purpose_choices:
        return Response(
            {'detail': f"purpose must be one of {sorted(purpose_choices)} for this endpoint."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    school = School.objects.filter(id=data['schoolId']).first()
    if school is None:
        return Response({'detail': 'Unknown schoolId.'}, status=status.HTTP_404_NOT_FOUND)

    if not user_may_act_for_school(request.user, school.id):
        return Response(
            {'detail': 'You are not authorized to act on behalf of this school.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Anti-replay: the unique constraint on challenge_id is the real guard —
    # a second attempt with the same challengeId always hits this insert and
    # fails, whether or not the first attempt actually succeeded.
    try:
        with transaction.atomic():
            challenge = QRChallenge.objects.create(
                challenge_id=data['challengeId'],
                school=school,
                device_id=data['deviceId'],
                purpose=data['purpose'],
                nonce=data['nonce'],
                previous_device_id=data.get('previousDeviceId') or '',
                created_at=data['createdAt'],
                expires_at=data['expiresAt'],
            )
    except IntegrityError:
        return Response(
            {'detail': 'This challengeId has already been submitted (replay rejected).'},
            status=status.HTTP_409_CONFLICT,
        )

    if challenge.expires_at < timezone.now():
        return Response({'detail': 'Challenge has expired.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        if data['purpose'] == QRChallenge.Purpose.DEVICE_REPLACEMENT:
            previous = DeviceRegistration.objects.filter(
                school=school,
                device_id=data['previousDeviceId'],
                status=DeviceRegistration.Status.ACTIVE,
            ).first()
            new_device, _ = DeviceRegistration.objects.get_or_create(
                school=school,
                device_id=data['deviceId'],
                status=DeviceRegistration.Status.ACTIVE,
                defaults={},
            )
            if previous is not None and previous.pk != new_device.pk:
                previous.status = DeviceRegistration.Status.REPLACED
                previous.replaced_by = new_device
                previous.save(update_fields=['status', 'replaced_by'])
            device = new_device
            plan, issued_at, expires_at = _carry_over_license(school)
        else:
            device, _ = DeviceRegistration.objects.get_or_create(
                school=school,
                device_id=data['deviceId'],
                status=DeviceRegistration.Status.ACTIVE,
                defaults={},
            )
            plan, issued_at, expires_at = _resolve_license_terms(school, data['purpose'])

        certificate, issued_at_dt, expires_at_dt = build_certificate(
            school_id=school.id,
            device_id=data['deviceId'],
            plan=plan,
            issued_at=issued_at,
            expires_at=expires_at,
        )

        LicenseIssuance.objects.create(
            school=school,
            device=device,
            challenge=challenge,
            plan=plan,
            issued_at=issued_at_dt,
            expires_at=expires_at_dt,
            certificate_json=certificate,
        )

        challenge.used_at = timezone.now()
        challenge.redeemed_by = request.user
        challenge.save(update_fields=['used_at', 'redeemed_by'])

    return Response({'certificate': certificate}, status=status.HTTP_201_CREATED)


class ChallengeRedeemView(APIView):
    """POST /api/v1/offline-licensing/challenges/redeem/

    Handles ``activation`` and ``renewal`` challenges. See the wire contract's
    "QR Activation Challenge" section.
    """

    permission_classes = [permissions.IsAuthenticated, IsSchoolTechnician]

    def post(self, request):
        return _process_challenge(
            request,
            purpose_choices={QRChallenge.Purpose.ACTIVATION, QRChallenge.Purpose.RENEWAL},
            require_previous_device=False,
        )


class DeviceReplacementView(APIView):
    """POST /api/v1/offline-licensing/device-replacement/

    Same challenge/response shape as ``challenges/redeem/`` but requires
    ``purpose: "device_replacement"`` and ``previousDeviceId``, per the wire
    contract and spec section 9's replacement protocol.
    """

    permission_classes = [permissions.IsAuthenticated, IsSchoolTechnician]

    def post(self, request):
        return _process_challenge(
            request,
            purpose_choices={QRChallenge.Purpose.DEVICE_REPLACEMENT},
            require_previous_device=True,
        )


# ---------------------------------------------------------------------------
# Sync (chunked, resumable)
# ---------------------------------------------------------------------------

def _get_session_or_403(request, session_id):
    session = get_object_or_404(SyncSession, pk=session_id)
    if not user_may_act_for_school(request.user, session.school_id):
        return None, Response(
            {'detail': 'You are not authorized to act on behalf of this sync session.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return session, None


class CreateSyncSessionView(APIView):
    """POST /api/v1/offline-sync/sessions/ -> {"sessionId": ...}"""

    permission_classes = [permissions.IsAuthenticated, IsSchoolTechnician]

    def post(self, request):
        serializer = SyncSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device_id = serializer.validated_data['deviceId']

        school = request.user.school
        if school is None:
            return Response({'detail': 'Your account is not linked to a school.'}, status=status.HTTP_400_BAD_REQUEST)

        device = DeviceRegistration.objects.filter(
            school=school, device_id=device_id, status=DeviceRegistration.Status.ACTIVE,
        ).first()
        if device is None:
            return Response({'detail': 'Unknown or inactive deviceId for your school.'}, status=status.HTTP_404_NOT_FOUND)

        session = SyncSession.objects.create(school=school, device=device)
        return Response({'sessionId': str(session.id)}, status=status.HTTP_201_CREATED)


def _chunk_checksum(rows) -> str:
    body = json.dumps(rows, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(body.encode('utf-8')).hexdigest()


class ChunkUploadView(APIView):
    """POST /api/v1/offline-sync/sessions/{sessionId}/chunks/ -> {"received": chunkIndex}

    Idempotent: POSTing the same ``chunkIndex`` twice (e.g. after a dropped
    ack) returns the same response without creating a second row or
    re-counting rows, because of the ``(session, chunk_index)`` unique
    constraint on ``SyncChunk``.
    """

    permission_classes = [permissions.IsAuthenticated, IsSchoolTechnician]

    def post(self, request, session_id):
        session, error = _get_session_or_403(request, session_id)
        if error:
            return error

        serializer = SyncChunkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        chunk_index = data['chunkIndex']

        existing = SyncChunk.objects.filter(session=session, chunk_index=chunk_index).first()
        if existing is not None:
            return Response({'received': existing.chunk_index}, status=status.HTTP_200_OK)

        rows = data['rows']
        expected_checksum = _chunk_checksum(rows)
        if expected_checksum != data['checksum']:
            return Response({'detail': 'checksum does not match the submitted rows.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            chunk = SyncChunk.objects.create(
                session=session,
                chunk_index=chunk_index,
                total_chunks=data['totalChunks'],
                checksum=data['checksum'],
                row_count=len(rows),
            )
        except IntegrityError:
            # Lost the race with a concurrent identical POST — same no-op result.
            chunk = SyncChunk.objects.get(session=session, chunk_index=chunk_index)
            return Response({'received': chunk.chunk_index}, status=status.HTTP_200_OK)

        return Response({'received': chunk.chunk_index}, status=status.HTTP_201_CREATED)


class SyncSessionStatusView(APIView):
    """GET /api/v1/offline-sync/sessions/{sessionId}/status/ -> {"lastAckedChunkIndex": n}

    ``-1`` means no chunk has been acked yet, so the desktop client should
    resume from chunk 0.
    """

    permission_classes = [permissions.IsAuthenticated, IsSchoolTechnician]

    def get(self, request, session_id):
        session, error = _get_session_or_403(request, session_id)
        if error:
            return error
        return Response({'lastAckedChunkIndex': session.last_acked_chunk_index}, status=status.HTTP_200_OK)


class CompleteSyncSessionView(APIView):
    """POST /api/v1/offline-sync/sessions/{sessionId}/complete/"""

    permission_classes = [permissions.IsAuthenticated, IsSchoolTechnician]

    def post(self, request, session_id):
        session, error = _get_session_or_403(request, session_id)
        if error:
            return error

        session.status = SyncSession.Status.COMPLETED
        session.completed_at = timezone.now()
        session.save(update_fields=['status', 'completed_at'])
        return Response(
            {'status': session.status, 'completedAt': session.completed_at.isoformat()},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Migration (offline -> cloud)
# ---------------------------------------------------------------------------

class MigrationImportView(APIView):
    """POST /api/v1/offline-migration/import/

    Defaults to a dry run (validate + report, no writes). Only writes to real
    student/teacher/school rows when the request explicitly sets
    ``confirm: true`` — see ``apps/offline_licensing/migration/transform.py``
    for the isolated, unit-tested transform this delegates to.
    """

    permission_classes = [permissions.IsAuthenticated, IsSchoolTechnician]

    def post(self, request):
        serializer = MigrationImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if not user_may_act_for_school(request.user, data['schoolId']):
            return Response(
                {'detail': 'You are not authorized to migrate this school.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            report = build_report(data)
        except MigrationValidationError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        existing_school = School.objects.filter(id=data['schoolId']).first()

        if not data['confirm']:
            if existing_school is not None:
                MigrationJob.objects.create(
                    school=existing_school,
                    status=MigrationJob.Status.VALIDATED if report['valid'] else MigrationJob.Status.FAILED,
                    report_json=report,
                    created_by=request.user,
                )
            return Response(report, status=status.HTTP_200_OK)

        if not report['valid']:
            if existing_school is not None:
                MigrationJob.objects.create(
                    school=existing_school,
                    status=MigrationJob.Status.FAILED,
                    report_json=report,
                    created_by=request.user,
                )
            return Response(report, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = apply_migration(data)
        except MigrationValidationError as exc:  # pragma: no cover - build_report already checked
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        school = School.objects.get(id=data['schoolId'])
        MigrationJob.objects.create(
            school=school,
            status=MigrationJob.Status.IMPORTED,
            report_json=result,
            created_by=request.user,
        )
        return Response(result, status=status.HTTP_200_OK)

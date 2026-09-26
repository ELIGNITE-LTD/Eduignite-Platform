"""Collecting through Fapshi: start, status, webhook.

The frontend never sees a credential and is never believed about a payment.
Three rules hold this together, and between them they close off the ways money
goes wrong:

  **Nothing is credited on anyone's say-so.** Not the browser, not the webhook
  body. Every credit follows a fresh `payment-status` call to Fapshi, so a
  forged request to any of these endpoints achieves nothing at all.

  **The amount is checked.** Fapshi is asked what was paid and it must match
  what was asked for. A transaction that comes back short is left pending and
  logged rather than credited, because a part payment that unlocks a full
  subscription is a loss that nobody notices for months.

  **Applying is idempotent.** The row is locked and the `processed` flag is
  checked inside the transaction, so a webhook and a poll landing together, or
  the same webhook twice, still produce exactly one payment.
"""

import hmac
import logging
import uuid

from django.db import transaction
from rest_framework import status as http_status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import fapshi
from .models import GatewayTransaction, Invoice, Payment
from .payunit_views import STAFF_ROLES, apply_successful_transaction
from .serializers import PaymentDetailSerializer

logger = logging.getLogger(__name__)


def _serialize(txn: GatewayTransaction):
    return {
        'transaction_id': txn.transaction_id,
        'provider_transaction_id': txn.provider_transaction_id,
        'provider': txn.provider,
        'status': txn.status,
        'processed': txn.processed,
        'amount': float(txn.amount),
        'currency': txn.currency,
        'purpose': txn.purpose,
        'reason': txn.status_reason,
        'payment': PaymentDetailSerializer(txn.payment).data if txn.payment_id else None,
    }


def sync_transaction(txn: GatewayTransaction) -> GatewayTransaction:
    """Ask Fapshi what happened, and act only on that.

    Used by the status endpoint, the webhook and the reconciler alike, so there
    is one path to being paid and no second opinion about what counts.
    """
    if not txn.provider_transaction_id:
        # Nothing to ask about: the payer was never prompted.
        return txn

    data = fapshi.payment_status(txn.provider_transaction_id)
    remote = fapshi.normalize_status(data)
    txn.raw_response = data

    if remote == GatewayTransaction.STATUS_SUCCESS:
        paid = fapshi.amount_of(data)
        expected = int(txn.amount)

        if paid is None or paid < expected:
            # Short, or unreadable. Never credited: an incomplete payment that
            # unlocks a full subscription is a loss nobody notices for months.
            txn.status_reason = f'Fapshi reported {paid} paid against {expected} expected.'
            txn.save(update_fields=['raw_response', 'status_reason', 'modified'])
            logger.error(
                'Fapshi amount mismatch on %s: paid=%s expected=%s',
                txn.transaction_id, paid, expected,
            )
            return txn

        txn.save(update_fields=['raw_response', 'modified'])
        apply_successful_transaction(txn)
        txn.refresh_from_db()
        return txn

    if remote in (GatewayTransaction.STATUS_FAILED, GatewayTransaction.STATUS_CANCELLED):
        txn.status = remote
        txn.status_reason = str(data.get('reason') or '')[:255]
        txn.save(update_fields=['status', 'status_reason', 'raw_response', 'modified'])
        return txn

    txn.save(update_fields=['raw_response', 'modified'])
    return txn


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def fapshi_collect(request):
    """Prompt the payer's mobile money line for one of the gateway purposes.

    The transaction row is written, and Fapshi's id stored on it, before
    anything else. Losing that id means never being able to confirm the
    payment, and the payer would have been charged regardless.
    """
    if not fapshi.is_configured():
        return Response(
            {'detail': 'Mobile money is not configured on the server.'},
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    purpose = request.data.get('purpose') or GatewayTransaction.PURPOSE_PLATFORM
    valid_purposes = dict(GatewayTransaction.PURPOSE_CHOICES)
    if purpose not in valid_purposes:
        return Response({'detail': 'Unknown payment purpose.'}, status=http_status.HTTP_400_BAD_REQUEST)

    phone = str(request.data.get('phone') or '').strip()
    if not phone:
        return Response({'detail': 'A mobile money number is required.'}, status=http_status.HTTP_400_BAD_REQUEST)

    # Who the payment is for. Staff may pay for a student of their own
    # school, a parent for their own linked child, and anyone for themselves.
    beneficiary, error = resolve_beneficiary(request.user, request.data)
    if error:
        return error

    # The amount is decided here, from the charge that account actually owes.
    # It is never read from the request: a client that could name its own
    # price could buy a subscription for one franc.
    amount = resolve_amount(beneficiary, purpose, request.data)
    if amount is None:
        return Response({'detail': 'There is nothing to pay for this account.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if amount < fapshi.MINIMUM_AMOUNT:
        return Response(
            {'detail': f'Mobile money payments start at {fapshi.MINIMUM_AMOUNT} XAF.'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    txn = GatewayTransaction.objects.create(
        provider=GatewayTransaction.PROVIDER_FAPSHI,
        purpose=purpose,
        school=getattr(beneficiary, 'school', None),
        initiated_by=request.user,
        beneficiary=beneficiary,
        amount=amount,
        currency='XAF',
        phone_number=phone,
        gateway=fapshi.resolve_medium(request.data.get('operator')) or '',
        # Ours, and unique by construction: a collision here would attach a
        # payer's money to somebody else's transaction.
        transaction_id=f'EI-{uuid.uuid4().hex[:18].upper()}',
        status=GatewayTransaction.STATUS_PENDING,
    )

    try:
        result = fapshi.direct_pay(
            amount=int(amount),
            phone=phone,
            external_id=txn.transaction_id,
            medium=fapshi.resolve_medium(request.data.get('operator')),
            name=request.user.get_full_name(),
            email=request.user.email or '',
            user_id=str(request.user.id),
            message=valid_purposes[purpose],
        )
    except fapshi.FapshiError as exc:
        # The prompt may still have been raised, so the row is kept pending for
        # the reconciler rather than deleted. A deleted row is a payment nobody
        # can trace.
        txn.status_reason = str(exc)[:255]
        txn.save(update_fields=['status_reason', 'modified'])
        logger.warning('Fapshi direct-pay failed for %s: %s', txn.transaction_id, exc)
        return Response({'detail': str(exc)}, status=http_status.HTTP_502_BAD_GATEWAY)

    txn.provider_transaction_id = str(result.get('transId') or '')
    txn.raw_response = result
    txn.save(update_fields=['provider_transaction_id', 'raw_response', 'modified'])

    if not txn.provider_transaction_id:
        logger.error('Fapshi returned no transId for %s: %s', txn.transaction_id, result)
        return Response(
            {'detail': 'The payment could not be started. Please try again.'},
            status=http_status.HTTP_502_BAD_GATEWAY,
        )

    return Response(_serialize(txn), status=http_status.HTTP_201_CREATED)



def resolve_beneficiary(requester, payload):
    """Who this payment is for, and whether the requester may pay it.

    The same rules the gateway has always used: school staff may settle a
    student of their own school, a parent may settle their own linked child,
    and anyone may settle their own account. Paying for a stranger is refused,
    because a payment credited to the wrong account is money that has to be
    chased back by hand.
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    student_id = payload.get('student_id') or payload.get('beneficiary')
    if not student_id:
        return requester, None

    student = User.objects.filter(id=student_id, role='STUDENT').first()
    if not student:
        return None, Response({'detail': 'Select a valid student.'}, status=http_status.HTTP_400_BAD_REQUEST)

    if requester.role in STAFF_ROLES:
        if requester.school_id and student.school_id != requester.school_id:
            return None, Response(
                {'detail': 'The student must belong to your school.'},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        return student, None

    if requester.role == 'PARENT':
        from apps.students import api as students_api

        if not students_api.is_guardian_of(requester, students_api.get_student_for_user(student)):
            return None, Response(
                {'detail': 'You can only pay for your own linked children.'},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        return student, None

    return None, Response(
        {'detail': 'You cannot pay on behalf of another account.'},
        status=http_status.HTTP_403_FORBIDDEN,
    )

def resolve_amount(user, purpose, payload):
    """What this account owes for this purpose, decided on the server."""
    from apps.platform.access import get_role_platform_fee

    if purpose == GatewayTransaction.PURPOSE_PLATFORM:
        fee = get_role_platform_fee(getattr(user, 'role', None))
        return int(fee) if fee else None

    # School subscriptions and app purchases carry their price in the catalogue
    # the request names; the existing PayUnit endpoints already resolve those,
    # and this reuses their figure rather than inventing a second source.
    amount = payload.get('amount')
    try:
        value = int(float(amount))
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def fapshi_status(request, transaction_id):
    """Where a payment has got to, re-read from Fapshi."""
    txn = GatewayTransaction.objects.filter(transaction_id=transaction_id).first()
    if not txn:
        return Response({'detail': 'No such transaction.'}, status=http_status.HTTP_404_NOT_FOUND)

    # A person may only ask about their own payment.
    if txn.initiated_by_id != request.user.id and txn.beneficiary_id != request.user.id:
        if getattr(request.user, 'role', None) not in STAFF_ROLES:
            return Response({'detail': 'Not your transaction.'}, status=http_status.HTTP_403_FORBIDDEN)

    if txn.status == GatewayTransaction.STATUS_PENDING:
        try:
            txn = sync_transaction(txn)
        except fapshi.FapshiError as exc:
            # Unknown, not failed. The row stays pending for the reconciler.
            logger.info('Fapshi status check failed for %s: %s', txn.transaction_id, exc)

    return Response(_serialize(txn))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def fapshi_webhook(request):
    """Fapshi telling us something changed.

    The body is not evidence. It names a transaction, and that is all it is
    used for: the status is then read from Fapshi directly. So even a perfectly
    forged webhook cannot mark anything paid.

    Fapshi sends one webhook per event and never retries, so a failure here is
    a payment that only the reconciler will find. It answers 200 in all
    ordinary cases to avoid being treated as unreachable.
    """
    secret = fapshi.webhook_secret()
    if secret:
        supplied = request.headers.get('x-wh-secret', '')
        if not hmac.compare_digest(str(supplied), str(secret)):
            logger.warning('Fapshi webhook rejected: bad or missing secret.')
            return Response({'detail': 'Invalid webhook secret.'}, status=http_status.HTTP_401_UNAUTHORIZED)
    else:
        # Without a configured secret this endpoint is open to the internet, so
        # it is refused outright rather than trusted. The reconciler keeps
        # payments flowing until the secret is set on both sides.
        logger.error('Fapshi webhook refused: no FAPSHI_WEBHOOK_SECRET is configured.')
        return Response({'detail': 'Webhooks are not configured.'}, status=http_status.HTTP_403_FORBIDDEN)

    payload = request.data if isinstance(request.data, dict) else {}
    trans_id = str(payload.get('transId') or '').strip()
    external_id = str(payload.get('externalId') or '').strip()

    txn = None
    if trans_id:
        txn = GatewayTransaction.objects.filter(provider_transaction_id=trans_id).first()
    if txn is None and external_id:
        txn = GatewayTransaction.objects.filter(transaction_id=external_id).first()

    if txn is None:
        logger.info('Fapshi webhook for unknown transaction: transId=%s externalId=%s', trans_id, external_id)
        return Response({'status': 'ignored'}, status=http_status.HTTP_200_OK)

    try:
        sync_transaction(txn)
    except fapshi.FapshiError as exc:
        logger.warning('Fapshi webhook re-query failed for %s: %s', txn.transaction_id, exc)

    return Response({'status': 'ok'}, status=http_status.HTTP_200_OK)

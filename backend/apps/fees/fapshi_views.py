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
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from . import fapshi
from .models import GatewayTransaction, Invoice, Payment
from .processing import STAFF_ROLES, apply_successful_transaction
from .serializers import PaymentDetailSerializer

logger = logging.getLogger(__name__)


class PaymentRateThrottle(UserRateThrottle):
    """Caps how fast one account can fire mobile-money prompts.

    Every initiator raises a real prompt on a real phone, so an unthrottled
    loop here is both an abuse vector (spamming a victim's line) and a direct
    cost. The ceiling is set in DEFAULT_THROTTLE_RATES['payment']; ordinary use
    never comes near it.
    """
    scope = 'payment'


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

    if txn.environment != fapshi.current_environment():
        # A transaction from the other world is never acted on: the live API
        # does not know a sandbox transId (and vice versa), so querying it
        # could only mislead. This keeps sandbox webhooks from ever crediting
        # against live money, and keeps the reconciler from touching the wrong
        # world when the mode is switched.
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


def _new_transaction_id() -> str:
    # Ours, and unique by construction: a collision here would attach a
    # payer's money to somebody else's transaction.
    return f'EI-{uuid.uuid4().hex[:18].upper()}'


def _prompt_and_store(txn: GatewayTransaction, request, phone: str, message: str):
    """Raise the mobile-money prompt for an already-written transaction row.

    Shared by every Fapshi initiator (platform charge, app purchase, school
    subscription) so the one money-path — prompt, store Fapshi's id, refuse a
    row that never got one — lives in a single place.
    """
    try:
        result = fapshi.direct_pay(
            amount=int(txn.amount),
            phone=phone,
            external_id=txn.transaction_id,
            medium=fapshi.resolve_medium(request.data.get('operator')),
            name=request.user.get_full_name(),
            email=request.user.email or '',
            user_id=str(request.user.id),
            message=message,
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


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([PaymentRateThrottle])
def fapshi_collect(request):
    """Prompt the payer's mobile money line for the platform charge.

    Only the per-user platform charge goes through here. The other purposes
    carry a catalogue price that must be resolved on the server, so they have
    their own endpoints (AI credits, app purchase, school subscription) and are
    refused here — a generic collect that trusted a request-supplied amount
    would let a client buy a subscription for one franc.
    """
    if not fapshi.is_configured():
        return Response(
            {'detail': 'Mobile money is not configured on the server.'},
            status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    purpose = request.data.get('purpose') or GatewayTransaction.PURPOSE_PLATFORM
    if purpose != GatewayTransaction.PURPOSE_PLATFORM:
        return Response(
            {'detail': 'Use the dedicated endpoint for this payment type.'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    phone = str(request.data.get('phone') or '').strip()
    if not phone:
        return Response({'detail': 'A mobile money number is required.'}, status=http_status.HTTP_400_BAD_REQUEST)

    # Who the payment is for. Staff may pay for a student of their own
    # school, a parent for their own linked child, and anyone for themselves.
    beneficiary, error = resolve_beneficiary(request.user, request.data)
    if error:
        return error

    # The amount is decided here, from the charge that account actually owes.
    # It is never read from the request.
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
        transaction_id=_new_transaction_id(),
        environment=fapshi.current_environment(),
        status=GatewayTransaction.STATUS_PENDING,
    )
    return _prompt_and_store(txn, request, phone, message='EduIgnite platform subscription')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([PaymentRateThrottle])
def fapshi_app_purchase(request):
    """Buy an app for the caller's school through Fapshi mobile money.

    Mirrors the retired PayUnit path: the price is read from the app's own
    pricing on the server, never the request, and the successful-payment side
    effect (installing the app) runs in the shared apply_successful_transaction
    once Fapshi confirms the payment.
    """
    if not fapshi.is_configured():
        return Response({'detail': 'Mobile money is not configured on the server.'},
                        status=http_status.HTTP_503_SERVICE_UNAVAILABLE)

    requester = request.user
    role = str(getattr(requester, 'role', '') or '').upper()
    if role not in ('SCHOOL_ADMIN', 'SUB_ADMIN') or not requester.school_id:
        return Response({'detail': 'Only a school administrator can buy apps for the school.'},
                        status=http_status.HTTP_403_FORBIDDEN)

    phone = str(request.data.get('phone') or request.data.get('phone_number') or '').strip()
    if not phone:
        return Response({'detail': 'A mobile money number is required.'}, status=http_status.HTTP_400_BAD_REQUEST)

    app_key = str(request.data.get('app_key') or '').strip()
    if not app_key:
        return Response({'detail': 'Which app? app_key is required.'}, status=http_status.HTTP_400_BAD_REQUEST)
    app_roles = request.data.get('roles') if isinstance(request.data.get('roles'), list) else []

    from decimal import Decimal
    from apps.registry.build_models import AppPackage
    from apps.registry.pricing import effective

    package = AppPackage.objects.select_related('live_build').filter(key=app_key, is_listed=True).first()
    if package is None or package.live_build is None or not package.live_build.is_runnable:
        return Response({'detail': 'That app is not available.'}, status=http_status.HTTP_404_NOT_FOUND)

    pricing = effective(package)
    amount = Decimal(str(pricing.get('price') or 0))
    if pricing.get('model') == 'free' or amount <= 0:
        return Response({'detail': 'This app is free — no payment needed.'}, status=http_status.HTTP_400_BAD_REQUEST)
    if int(amount) < fapshi.MINIMUM_AMOUNT:
        return Response({'detail': f'Mobile money payments start at {fapshi.MINIMUM_AMOUNT} XAF.'},
                        status=http_status.HTTP_400_BAD_REQUEST)

    txn = GatewayTransaction.objects.create(
        provider=GatewayTransaction.PROVIDER_FAPSHI,
        purpose=GatewayTransaction.PURPOSE_APP,
        app_key=app_key,
        app_roles=app_roles,
        school=requester.school,
        initiated_by=requester,
        amount=amount,
        currency=pricing.get('currency') or 'XAF',
        phone_number=phone,
        gateway=fapshi.resolve_medium(request.data.get('operator')) or '',
        transaction_id=_new_transaction_id(),
        environment=fapshi.current_environment(),
        status=GatewayTransaction.STATUS_PENDING,
    )
    return _prompt_and_store(txn, request, phone, message=f'EduIgnite app: {package.name}')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([PaymentRateThrottle])
def fapshi_school_subscription(request):
    """Pay the school's one-time subscription through Fapshi mobile money.

    The amount is the founder-set amount for this school, read on the server so
    it cannot be understated. On success the shared apply_successful_transaction
    marks the school paid, activating every non-parent user.
    """
    if not fapshi.is_configured():
        return Response({'detail': 'Mobile money is not configured on the server.'},
                        status=http_status.HTTP_503_SERVICE_UNAVAILABLE)

    requester = request.user
    role = str(getattr(requester, 'role', '') or '').upper()
    # Only the school administrator pays; a sub-admin can view the bill only.
    if role != 'SCHOOL_ADMIN' or not requester.school_id:
        return Response({'detail': 'Only a school administrator can pay the school subscription.'},
                        status=http_status.HTTP_403_FORBIDDEN)

    phone = str(request.data.get('phone') or request.data.get('phone_number') or '').strip()
    if not phone:
        return Response({'detail': 'A mobile money number is required.'}, status=http_status.HTTP_400_BAD_REQUEST)

    from decimal import Decimal
    from apps.schools.models import School

    school = School.objects.filter(id=requester.school_id).first()
    if school is None:
        return Response({'detail': 'School not found.'}, status=http_status.HTTP_404_NOT_FOUND)

    # Per-student platform bill (set by the founders) takes precedence. The
    # amount is the bill's balance computed here; a client may only ask for a
    # smaller part of it (partial payment), never more and never a made-up sum.
    from apps.platform import billing

    bill_data = billing.build_bill(school, create=True)
    platform_bill = bill_data['_bill']
    if bill_data['configured']:
        if bill_data['status'] in (billing.STATUS_PAID, billing.STATUS_NO_CHARGE) or bill_data['balance'] <= 0:
            return Response({'detail': 'Your platform bill has nothing left to pay.'},
                            status=http_status.HTTP_400_BAD_REQUEST)
        amount = Decimal(str(bill_data['balance']))
        requested = request.data.get('amount')
        if requested not in (None, ''):
            try:
                part = Decimal(str(requested))
            except Exception:  # noqa: BLE001
                return Response({'detail': 'Amount must be a number.'}, status=http_status.HTTP_400_BAD_REQUEST)
            if part != part.to_integral_value() or part <= 0 or part > amount:
                return Response({'detail': 'Amount must be a whole number up to the balance of the bill.'},
                                status=http_status.HTTP_400_BAD_REQUEST)
            amount = part
    else:
        platform_bill = None
        amount = Decimal(str(school.subscription_amount or 0))
    if amount <= 0:
        return Response(
            {'detail': 'No subscription amount has been set for your school yet. Contact EduIgnite.'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if int(amount) < fapshi.MINIMUM_AMOUNT:
        return Response({'detail': f'Mobile money payments start at {fapshi.MINIMUM_AMOUNT} XAF.'},
                        status=http_status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        if platform_bill is not None:
            # Serialise concurrent clicks on one bill: whoever holds the lock
            # checks for a prompt already in flight before adding another, so
            # the same bill is never charged twice at once.
            type(platform_bill).objects.select_for_update().get(pk=platform_bill.pk)
            pending = billing.pending_txn(platform_bill)
            if pending is not None:
                return Response(
                    {'detail': 'A payment for this bill is already waiting for approval on your phone.',
                     'transaction_id': pending.transaction_id, 'status': pending.status},
                    status=http_status.HTTP_409_CONFLICT,
                )
        txn = GatewayTransaction.objects.create(
            provider=GatewayTransaction.PROVIDER_FAPSHI,
            purpose=GatewayTransaction.PURPOSE_SCHOOL,
            school=school,
            platform_bill=platform_bill,
            initiated_by=requester,
            amount=amount,
            currency=school.subscription_currency or 'XAF',
            phone_number=phone,
            gateway=fapshi.resolve_medium(request.data.get('operator')) or '',
            transaction_id=_new_transaction_id(),
            environment=fapshi.current_environment(),
            status=GatewayTransaction.STATUS_PENDING,
        )
    return _prompt_and_store(txn, request, phone, message=f'EduIgnite school subscription: {school.name}')



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
    """What this account owes for the platform charge, decided on the server.

    Only the platform charge is resolved here; app purchases and school
    subscriptions carry a catalogue price and are handled by their own
    endpoints, which read the price from the catalogue, never the request.
    """
    from apps.platform.access import get_role_platform_fee

    if purpose == GatewayTransaction.PURPOSE_PLATFORM:
        fee = get_role_platform_fee(getattr(user, 'role', None))
        return int(fee) if fee else None
    return None


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

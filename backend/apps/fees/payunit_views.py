"""PayUnit collect / status / webhook endpoints for the platform subscription.

The frontend only ever talks to these endpoints — it never sees PayUnit
credentials. Before any money-affecting side effect we always re-query PayUnit
for the authoritative status, so a spoofed request cannot mark a payment as paid.
"""

import logging
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.platform.access import get_role_platform_fee

from . import payunit
from .models import GatewayTransaction, Invoice, Payment
from .serializers import PaymentDetailSerializer
from .utils import generate_invoice_number, generate_receipt_number, generate_reference_number

logger = logging.getLogger(__name__)
User = get_user_model()

STAFF_ROLES = ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']


@transaction.atomic
def apply_successful_transaction(txn: GatewayTransaction):
    """Idempotently apply the side effects of a successful PayUnit payment."""
    txn = GatewayTransaction.objects.select_for_update().get(pk=txn.pk)
    if txn.processed and txn.payment_id:
        return txn.payment

    # AI credits are bought by a person for themselves, not paid to a school,
    # so they do not become a school fee payment. The credits are added in the
    # same transaction that marks the payment processed, and the ledger refuses
    # a second credit for the same transaction id.
    if txn.purpose == GatewayTransaction.PURPOSE_AI_CREDITS:
        if not txn.processed:
            from apps.ai_features import credit_engine

            credit_engine.grant_purchase(txn)
            txn.status = GatewayTransaction.STATUS_SUCCESS
            txn.processed = True
            txn.save(update_fields=['status', 'processed', 'modified'])
        return None

    beneficiary = txn.beneficiary
    payment = Payment.objects.create(
        school=txn.school,
        payer=beneficiary,
        fee_structure=None,
        bursar=txn.initiated_by if (txn.initiated_by and txn.initiated_by.role in STAFF_ROLES) else None,
        amount=txn.amount,
        currency=txn.currency,
        payment_method='mobile_money',
        reference_number=generate_reference_number(),
        status='confirmed',
        payment_date=date.today(),
        receipt_number=generate_receipt_number(),
        notes=f'PayUnit mobile money ({txn.gateway or "MOMO"}) ref {txn.provider_transaction_id}',
    )
    Invoice.objects.get_or_create(
        payment=payment,
        defaults={'invoice_number': generate_invoice_number(), 'issued_by': txn.initiated_by},
    )

    # Settling the platform subscription activates the student account.
    if txn.purpose == GatewayTransaction.PURPOSE_PLATFORM and beneficiary:
        beneficiary.is_license_paid = True
        beneficiary.is_active = True
        beneficiary.save(update_fields=['is_license_paid', 'is_active'])

    # A school subscription settles the whole school: mark it paid, which
    # activates every non-parent user without individual payments. Inside the
    # same atomic block as the payment, so paying and activating cannot diverge.
    if txn.purpose == GatewayTransaction.PURPOSE_SCHOOL and txn.school_id:
        try:
            from apps.schools.models import School

            school = School.objects.filter(id=txn.school_id).first()
            if school is not None:
                from datetime import timedelta as _td
                from django.utils import timezone as _tz
                school.subscription_status = School.SUBSCRIPTION_PAID
                school.subscription_paid_at = _tz.now()
                # Yearly: a payment keeps the school active for a year.
                school.subscription_expires_on = _tz.localdate() + _td(days=365)
                school.save(update_fields=['subscription_status', 'subscription_paid_at',
                                           'subscription_expires_on', 'modified'])
        except Exception:  # noqa: BLE001 - payment stands even if activation hiccups
            logger.exception('School activation after payment failed for %s', txn.school_id)

    # An app purchase installs the app for the school, with an expiry taken from
    # the app's pricing. Done here, inside the same atomic block that confirms
    # the payment, so a school can never be charged without getting the app.
    if txn.purpose == GatewayTransaction.PURPOSE_APP and txn.app_key and txn.school_id:
        try:
            from apps.registry import api as registry_api
            from apps.registry.pricing import default_expiry, effective

            manifest = registry_api.get_app(txn.app_key)
            expiry = None
            if manifest is not None:
                from apps.registry.build_models import AppPackage

                package = AppPackage.objects.filter(key=txn.app_key).first()
                if package is not None:
                    expiry = default_expiry(effective(package))
            registry_api.install(
                txn.school_id, txn.app_key, by=txn.initiated_by,
                licence_expiry=expiry, allowed_roles=list(txn.app_roles or []),
                note='Paid by mobile money.',
            )
        except Exception:  # noqa: BLE001 - payment stands even if install hiccups
            logger.exception('App install after payment failed for %s', txn.app_key)

    txn.payment = payment
    txn.status = GatewayTransaction.STATUS_SUCCESS
    txn.processed = True
    txn.save(update_fields=['payment', 'status', 'processed', 'modified'])
    return payment


def _sync_status(txn: GatewayTransaction):
    """Re-query PayUnit and update the transaction; apply side effects on success."""
    data = payunit.get_status(txn.transaction_id)
    remote_status = payunit.normalize_status(data)
    txn.raw_response = data
    if remote_status == GatewayTransaction.STATUS_SUCCESS:
        txn.save(update_fields=['raw_response', 'modified'])
        apply_successful_transaction(txn)
    elif remote_status in (GatewayTransaction.STATUS_FAILED, GatewayTransaction.STATUS_CANCELLED):
        txn.status = remote_status
        txn.save(update_fields=['status', 'raw_response', 'modified'])
    else:
        txn.save(update_fields=['raw_response', 'modified'])
    txn.refresh_from_db()
    return txn


def _serialize_txn(txn: GatewayTransaction):
    return {
        'transaction_id': txn.transaction_id,
        'provider_transaction_id': txn.provider_transaction_id,
        'gateway': txn.gateway,
        'status': txn.status,
        'processed': txn.processed,
        'amount': float(txn.amount),
        'currency': txn.currency,
        'purpose': txn.purpose,
        'reason': txn.status_reason,
        'payment': PaymentDetailSerializer(txn.payment).data if txn.payment_id else None,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def payunit_app_purchase(request):
    """Initiate a mobile-money collection to buy an app for the caller's school.

    Mirrors :func:`payunit_collect`, but the beneficiary is the school and the
    successful-payment side effect (in ``apply_successful_transaction``) is
    installing the app rather than activating a student. Only a school
    administrator may buy for the school.
    """
    if not payunit.is_configured():
        return Response({'detail': 'Mobile money is not configured on the server.'},
                        status=http_status.HTTP_503_SERVICE_UNAVAILABLE)

    requester = request.user
    role = str(getattr(requester, 'role', '') or '').upper()
    if role not in ('SCHOOL_ADMIN', 'SUB_ADMIN') or not requester.school_id:
        return Response({'detail': 'Only a school administrator can buy apps for the school.'},
                        status=http_status.HTTP_403_FORBIDDEN)

    data = request.data
    phone = data.get('phone') or data.get('phone_number')
    if not phone:
        return Response({'detail': 'A mobile money phone number is required.'},
                        status=http_status.HTTP_400_BAD_REQUEST)

    app_key = str(data.get('app_key') or '').strip()
    if not app_key:
        return Response({'detail': 'Which app? app_key is required.'},
                        status=http_status.HTTP_400_BAD_REQUEST)
    app_roles = data.get('roles') if isinstance(data.get('roles'), list) else []

    from apps.registry.build_models import AppPackage
    from apps.registry.pricing import effective

    package = AppPackage.objects.select_related('live_build').filter(
        key=app_key, is_listed=True
    ).first()
    if package is None or package.live_build is None or not package.live_build.is_runnable:
        return Response({'detail': 'That app is not available.'},
                        status=http_status.HTTP_404_NOT_FOUND)

    pricing = effective(package)
    # The server sets the price from the app's own pricing — never from the
    # request — so a client cannot pay less than the app costs.
    amount = Decimal(str(pricing.get('price') or 0))
    if pricing.get('model') == 'free' or amount <= 0:
        return Response({'detail': 'This app is free — no payment needed.'},
                        status=http_status.HTTP_400_BAD_REQUEST)

    gateway = payunit.resolve_gateway(data.get('operator') or data.get('gateway'))

    txn = GatewayTransaction.objects.create(
        provider=GatewayTransaction.PROVIDER_PAYUNIT,
        purpose=GatewayTransaction.PURPOSE_APP,
        app_key=app_key,
        app_roles=app_roles,
        school=requester.school,
        initiated_by=requester,
        amount=amount,
        currency=pricing.get('currency') or payunit._config().get('DEFAULT_CURRENCY', 'XAF'),
        phone_number=phone,
        gateway=gateway,
    )

    try:
        result = payunit.make_payment(
            amount=amount,
            phone=phone,
            gateway=gateway,
            transaction_id=txn.transaction_id,
            description=f'EduIgnite app: {package.name}',
        )
    except payunit.PayunitError as exc:
        txn.status = GatewayTransaction.STATUS_FAILED
        txn.status_reason = str(exc)[:250]
        txn.save(update_fields=['status', 'status_reason', 'modified'])
        return Response({'detail': str(exc)}, status=http_status.HTTP_502_BAD_GATEWAY)

    inner = result.get('data') if isinstance(result.get('data'), dict) else result
    txn.provider_transaction_id = str(inner.get('id') or inner.get('provider_transaction_id') or '')
    txn.raw_response = result
    txn.save(update_fields=['provider_transaction_id', 'raw_response', 'modified'])

    resolved = payunit.normalize_status(result)
    if resolved == GatewayTransaction.STATUS_SUCCESS:
        try:
            apply_successful_transaction(txn)
            txn.refresh_from_db()
        except Exception:  # noqa: BLE001
            logger.exception('PayUnit immediate finalize failed for %s', txn.transaction_id)
    elif resolved in (GatewayTransaction.STATUS_FAILED, GatewayTransaction.STATUS_CANCELLED):
        txn.status = resolved
        txn.save(update_fields=['status', 'modified'])

    return Response(_serialize_txn(txn), status=http_status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def payunit_school_subscription(request):
    """Initiate a mobile-money collection for the school's one-time subscription.

    On success (in ``apply_successful_transaction``) the school is marked paid,
    which activates every non-parent user. The amount is the founder-set amount
    for this school, read on the server so it cannot be understated.
    """
    if not payunit.is_configured():
        return Response({'detail': 'Mobile money is not configured on the server.'},
                        status=http_status.HTTP_503_SERVICE_UNAVAILABLE)

    requester = request.user
    role = str(getattr(requester, 'role', '') or '').upper()
    if role not in ('SCHOOL_ADMIN', 'SUB_ADMIN') or not requester.school_id:
        return Response({'detail': 'Only a school administrator can pay the school subscription.'},
                        status=http_status.HTTP_403_FORBIDDEN)

    data = request.data
    phone = data.get('phone') or data.get('phone_number')
    if not phone:
        return Response({'detail': 'A mobile money phone number is required.'},
                        status=http_status.HTTP_400_BAD_REQUEST)

    from apps.schools.models import School

    school = School.objects.filter(id=requester.school_id).first()
    if school is None:
        return Response({'detail': 'School not found.'}, status=http_status.HTTP_404_NOT_FOUND)

    amount = Decimal(str(school.subscription_amount or 0))
    if amount <= 0:
        return Response(
            {'detail': 'No subscription amount has been set for your school yet. '
                       'Contact EduIgnite.'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    gateway = payunit.resolve_gateway(data.get('operator') or data.get('gateway'))

    txn = GatewayTransaction.objects.create(
        provider=GatewayTransaction.PROVIDER_PAYUNIT,
        purpose=GatewayTransaction.PURPOSE_SCHOOL,
        school=school,
        initiated_by=requester,
        amount=amount,
        currency=school.subscription_currency or payunit._config().get('DEFAULT_CURRENCY', 'XAF'),
        phone_number=phone,
        gateway=gateway,
    )

    try:
        result = payunit.make_payment(
            amount=amount, phone=phone, gateway=gateway,
            transaction_id=txn.transaction_id,
            description=f'EduIgnite school subscription: {school.name}',
        )
    except payunit.PayunitError as exc:
        txn.status = GatewayTransaction.STATUS_FAILED
        txn.status_reason = str(exc)[:250]
        txn.save(update_fields=['status', 'status_reason', 'modified'])
        return Response({'detail': str(exc)}, status=http_status.HTTP_502_BAD_GATEWAY)

    inner = result.get('data') if isinstance(result.get('data'), dict) else result
    txn.provider_transaction_id = str(inner.get('id') or inner.get('provider_transaction_id') or '')
    txn.raw_response = result
    txn.save(update_fields=['provider_transaction_id', 'raw_response', 'modified'])

    resolved = payunit.normalize_status(result)
    if resolved == GatewayTransaction.STATUS_SUCCESS:
        try:
            apply_successful_transaction(txn)
            txn.refresh_from_db()
        except Exception:  # noqa: BLE001
            logger.exception('PayUnit immediate finalize failed for %s', txn.transaction_id)
    elif resolved in (GatewayTransaction.STATUS_FAILED, GatewayTransaction.STATUS_CANCELLED):
        txn.status = resolved
        txn.save(update_fields=['status', 'modified'])

    return Response(_serialize_txn(txn), status=http_status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def payunit_collect(request):
    """Initiate a PayUnit mobile-money collection for the platform subscription."""
    if not payunit.is_configured():
        return Response({'detail': 'Mobile money is not configured on the server.'},
                        status=http_status.HTTP_503_SERVICE_UNAVAILABLE)

    requester = request.user
    data = request.data
    phone = data.get('phone') or data.get('phone_number')
    if not phone:
        return Response({'detail': 'A mobile money phone number is required.'}, status=http_status.HTTP_400_BAD_REQUEST)

    # Resolve who the subscription is for. Staff may pay for any student of their
    # school (student_id); parents may pay for their own linked children; anyone
    # without a student_id pays their own subscription for their own role.
    student_id = data.get('student_id') or data.get('beneficiary')
    if student_id and requester.role in STAFF_ROLES:
        beneficiary = User.objects.filter(id=student_id, role='STUDENT').first()
        if not beneficiary:
            return Response({'detail': 'Select a valid student.'}, status=http_status.HTTP_400_BAD_REQUEST)
        if requester.school_id and beneficiary.school_id != requester.school_id:
            return Response({'detail': 'The student must belong to your school.'}, status=http_status.HTTP_403_FORBIDDEN)
    elif student_id and requester.role == 'PARENT':
        from apps.students import api as students_api

        beneficiary = User.objects.filter(id=student_id, role='STUDENT').first()
        if not beneficiary:
            return Response({'detail': 'Select a valid student.'}, status=http_status.HTTP_400_BAD_REQUEST)
        is_linked = students_api.is_guardian_of(
            requester, students_api.get_student_for_user(beneficiary)
        )
        if not is_linked:
            return Response({'detail': 'You can only pay the subscription of your own linked children.'},
                            status=http_status.HTTP_403_FORBIDDEN)
    else:
        # Self-service: any user pays their own platform subscription.
        beneficiary = requester

    amount = get_role_platform_fee(beneficiary.role)
    if amount <= 0:
        return Response({'detail': 'No subscription fee is set for this account, so there is nothing to pay.'},
                        status=http_status.HTTP_400_BAD_REQUEST)

    gateway = payunit.resolve_gateway(data.get('operator') or data.get('gateway'))

    txn = GatewayTransaction.objects.create(
        provider=GatewayTransaction.PROVIDER_PAYUNIT,
        purpose=GatewayTransaction.PURPOSE_PLATFORM,
        school=beneficiary.school,
        initiated_by=requester,
        beneficiary=beneficiary,
        amount=amount,
        currency=payunit._config().get('DEFAULT_CURRENCY', 'XAF'),
        phone_number=phone,
        gateway=gateway,
    )

    try:
        result = payunit.make_payment(
            amount=amount,
            phone=phone,
            gateway=gateway,
            transaction_id=txn.transaction_id,
            description='EduIgnite platform subscription',
        )
    except payunit.PayunitError as exc:
        txn.status = GatewayTransaction.STATUS_FAILED
        txn.status_reason = str(exc)[:250]
        txn.save(update_fields=['status', 'status_reason', 'modified'])
        return Response({'detail': str(exc)}, status=http_status.HTTP_502_BAD_GATEWAY)

    inner = result.get('data') if isinstance(result.get('data'), dict) else result
    txn.provider_transaction_id = str(inner.get('id') or inner.get('provider_transaction_id') or '')
    txn.raw_response = result
    txn.save(update_fields=['provider_transaction_id', 'raw_response', 'modified'])

    # If the gateway already resolved the charge (instant / sandbox approval),
    # finalise now so the client gets SUCCESS from this call and never has to poll.
    resolved = payunit.normalize_status(result)
    if resolved == GatewayTransaction.STATUS_SUCCESS:
        try:
            apply_successful_transaction(txn)
            txn.refresh_from_db()
        except Exception:  # noqa: BLE001
            logger.exception('PayUnit immediate finalize failed for %s', txn.transaction_id)
    elif resolved in (GatewayTransaction.STATUS_FAILED, GatewayTransaction.STATUS_CANCELLED):
        txn.status = resolved
        txn.save(update_fields=['status', 'modified'])

    return Response(_serialize_txn(txn), status=http_status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def payunit_status(request, transaction_id):
    """Poll the status of a PayUnit transaction (also finalises on success)."""
    txn = GatewayTransaction.objects.filter(transaction_id=transaction_id).first()
    if not txn:
        return Response({'detail': 'Transaction not found.'}, status=http_status.HTTP_404_NOT_FOUND)

    requester = request.user
    if requester.role in STAFF_ROLES:
        if requester.school_id and txn.school_id and txn.school_id != requester.school_id:
            return Response({'detail': 'Not authorized.'}, status=http_status.HTTP_403_FORBIDDEN)
    elif txn.beneficiary_id != requester.id and txn.initiated_by_id != requester.id:
        return Response({'detail': 'Not authorized.'}, status=http_status.HTTP_403_FORBIDDEN)

    if txn.status == GatewayTransaction.STATUS_PENDING:
        try:
            _sync_status(txn)
        except payunit.PayunitError:
            pass  # keep pending; the webhook will finalise it

    return Response(_serialize_txn(txn))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def payunit_webhook(request):
    """Receive PayUnit payment notifications and finalise after re-querying status."""
    payload = request.data if isinstance(request.data, dict) else {}
    transaction_id = (
        payload.get('transaction_id')
        or payload.get('transactionId')
        or request.query_params.get('transaction_id')
    )
    if not transaction_id and isinstance(payload.get('data'), dict):
        transaction_id = payload['data'].get('transaction_id')

    txn = GatewayTransaction.objects.filter(transaction_id=transaction_id).first() if transaction_id else None
    if not txn:
        logger.info('PayUnit webhook for unknown transaction: %s', transaction_id)
        return Response({'status': 'ignored'}, status=http_status.HTTP_200_OK)

    try:
        _sync_status(txn)
    except payunit.PayunitError as exc:
        logger.warning('PayUnit webhook re-query failed for %s: %s', txn.transaction_id, exc)

    return Response({'status': 'ok'}, status=http_status.HTTP_200_OK)

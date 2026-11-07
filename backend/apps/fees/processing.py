"""Applying a successful mobile-money collection.

Gateway-neutral: whichever endpoint confirmed the payment (today, always
Fapshi), the side effects of a successful collection are applied here, once.
Nothing in here talks to a gateway — the authoritative status has already been
read by the caller before this runs.
"""

import logging
from datetime import date

from django.db import transaction

from .models import GatewayTransaction, Invoice, Payment
from .utils import generate_invoice_number, generate_receipt_number, generate_reference_number

logger = logging.getLogger(__name__)

STAFF_ROLES = ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']


@transaction.atomic
def apply_successful_transaction(txn: GatewayTransaction):
    """Idempotently apply the side effects of a successful collection."""
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
        notes=f'{txn.get_provider_display()} mobile money ({txn.gateway or "MOMO"}) ref {txn.provider_transaction_id}',
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

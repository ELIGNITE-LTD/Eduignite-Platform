"""Buying AI credits by mobile money, for any channel.

The apps start a purchase through `POST /ai/credits/purchase/`; the chat bots
call `start_purchase` directly. Either way the price is decided here from the
number of credits, and the credits are added only once Fapshi itself confirms
the full amount - through the status check, the webhook or the reconciler,
whichever sees it first - and never twice.
"""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status

from . import credit_engine
from . import credit_pricing as pricing

logger = logging.getLogger(__name__)

PURCHASES_CLOSED = 'Buying AI credits is not open yet. Your free daily credits still refresh every day.'
AI_IS_FREE = 'EduIgnite AI is free to use right now, so there is nothing to buy.'
#: How long a second press of "Pay" is answered with the first payment
#: instead of prompting the phone again.
DUPLICATE_PURCHASE_WINDOW = timedelta(minutes=3)


class PurchaseError(Exception):
    """A purchase that could not be started, with what to tell the person."""

    def __init__(self, message: str, *, http_status: int = status.HTTP_400_BAD_REQUEST, code: str = ''):
        super().__init__(message)
        self.message = message
        self.http_status = http_status
        self.code = code


def parse_credits(raw, config):
    """A whole number of credits inside the configured limits, or an error."""
    try:
        credits = int(str(raw).replace(',', '').replace(' ', '').strip())
    except (TypeError, ValueError):
        return None, 'Enter how many credits you want.'
    if credits < int(config.min_purchase_credits):
        return None, f'The smallest purchase is {config.min_purchase_credits:,} credits.'
    if credits > int(config.max_purchase_credits):
        return None, f'The largest purchase is {config.max_purchase_credits:,} credits.'
    return credits, None


def quote(config, credits):
    from apps.fees import fapshi

    price = pricing.price_for_credits(config, credits)
    return {
        'credits': credits,
        'price': price,
        'currency': config.currency,
        'price_per_credit': float(config.price_per_credit),
        'minimum_payment': fapshi.MINIMUM_AMOUNT,
        'payable': price >= fapshi.MINIMUM_AMOUNT,
    }


def start_purchase(user, raw_credits, phone, *, operator=None):
    """Prompt the payer's phone for a credit purchase. Returns (txn, is_new).

    A repeated request for the same purchase within a few minutes returns the
    payment already started rather than prompting the phone a second time.
    """
    from apps.fees import fapshi
    from apps.fees.models import GatewayTransaction

    config = credit_engine.get_config()
    if not config.billing_enabled:
        raise PurchaseError(AI_IS_FREE, code='ai_credits_free_mode')
    if not config.purchases_enabled:
        raise PurchaseError(PURCHASES_CLOSED, code='ai_credits_purchases_closed')
    credits, error = parse_credits(raw_credits, config)
    if error:
        raise PurchaseError(error)
    phone = str(phone or '').strip().replace(' ', '')
    if not phone:
        raise PurchaseError('A mobile money number is required.')
    if not fapshi.is_configured():
        raise PurchaseError('Mobile money is not configured on the server.',
                            http_status=status.HTTP_503_SERVICE_UNAVAILABLE)

    offer = quote(config, credits)
    if not offer['payable']:
        raise PurchaseError(
            f'Mobile money payments start at {fapshi.MINIMUM_AMOUNT} {config.currency}. Choose more credits.'
        )

    recent = GatewayTransaction.objects.filter(
        purpose=GatewayTransaction.PURPOSE_AI_CREDITS,
        initiated_by=user,
        status=GatewayTransaction.STATUS_PENDING,
        ai_credits=credits,
        phone_number=phone,
        created__gte=timezone.now() - DUPLICATE_PURCHASE_WINDOW,
    ).exclude(provider_transaction_id='').order_by('-created').first()
    if recent:
        return recent, False

    # Two presses landing at the same instant: only one gets through.
    lock_key = f'ai-credits:purchase-lock:{user.pk}'
    if not cache.add(lock_key, 1, 20):
        raise PurchaseError('A payment is already being started. Check your phone.',
                            http_status=status.HTTP_409_CONFLICT)
    try:
        medium = fapshi.resolve_medium(operator)
        txn = GatewayTransaction.objects.create(
            provider=GatewayTransaction.PROVIDER_FAPSHI,
            purpose=GatewayTransaction.PURPOSE_AI_CREDITS,
            school=getattr(user, 'school', None) if getattr(user, 'school_id', None) else None,
            initiated_by=user,
            beneficiary=user,
            amount=offer['price'],
            currency='XAF',
            ai_credits=credits,
            phone_number=phone,
            gateway=medium or '',
            transaction_id=f'EI-AIC-{uuid.uuid4().hex[:14].upper()}',
            environment=fapshi.current_environment(),
            status=GatewayTransaction.STATUS_PENDING,
        )
        try:
            result = fapshi.direct_pay(
                amount=offer['price'],
                phone=phone,
                external_id=txn.transaction_id,
                medium=medium,
                name=user.get_full_name(),
                email=user.email or '',
                user_id=str(user.pk),
                message=f'EduIgnite AI credits x{credits}',
            )
        except fapshi.FapshiError as exc:
            # Kept pending, never deleted: the prompt may still have gone out,
            # and the reconciler can still find a payment the payer approves.
            txn.status_reason = str(exc)[:255]
            txn.save(update_fields=['status_reason', 'modified'])
            logger.warning('Fapshi direct-pay failed for AI credits %s: %s', txn.transaction_id, exc)
            raise PurchaseError(str(exc), http_status=status.HTTP_502_BAD_GATEWAY)

        txn.provider_transaction_id = str(result.get('transId') or '')
        txn.raw_response = result
        txn.save(update_fields=['provider_transaction_id', 'raw_response', 'modified'])
        if not txn.provider_transaction_id:
            logger.error('Fapshi returned no transId for AI credits %s: %s', txn.transaction_id, result)
            raise PurchaseError('The payment could not be started. Please try again.',
                                http_status=status.HTTP_502_BAD_GATEWAY)
        return txn, True
    finally:
        cache.delete(lock_key)


def refresh_purchase(txn):
    """Ask Fapshi again about a purchase still pending. Returns the txn."""
    from apps.fees import fapshi
    from apps.fees.fapshi_views import sync_transaction
    from apps.fees.models import GatewayTransaction

    if txn.status == GatewayTransaction.STATUS_PENDING and not txn.processed:
        try:
            return sync_transaction(txn)
        except fapshi.FapshiError as exc:
            # Unknown, not failed: asked again on the next check.
            logger.info('Fapshi status check failed for %s: %s', txn.transaction_id, exc)
    return txn

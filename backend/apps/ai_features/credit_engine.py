"""The EduIgnite AI Credit Engine.

Every AI feature on the platform pays through here, and nowhere else. The rules
a person sees are simple:

  * 100 free credits every day. They do not pile up: each new day starts
    again at the daily allowance.
  * Credits they buy are kept until they are spent.
  * Free credits are always spent first.
  * Simple work costs a few credits; heavy work costs more.

Underneath, three things keep the money honest.

**A hold, then a charge.** When a request is accepted, its estimated cost is
set aside from the balance. When the work finishes, the hold is settled
against what the provider actually reports: the difference goes back, or a
small overrun is taken if the balance allows it. If the work fails, the whole
hold goes back. So two requests at once cannot spend the same credits, and a
provider outage never costs anyone anything.

**Compare-and-swap on the balance.** Every change to an account is a single
UPDATE that only succeeds if the row is still exactly as it was read, retried
on conflict. That holds on any database without relying on row locks, makes a
negative balance impossible (the database also refuses one outright), and
means a daily reset racing a purchase or a charge simply retries.

**A ledger with unique references.** Every movement is a ledger line, and a
purchase or a charge carries the id of what caused it, unique per kind. A
payment that is reported twice, or a request settled twice, collides with its
own first line and changes nothing.

Metering is ambient: a feature runs its work inside `metered(...)` (or the
`meters` decorator), and every provider call made inside it is counted by
`call_groq_api` automatically. No feature does its own credit arithmetic.
"""

from __future__ import annotations

import contextvars
import functools
import logging
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status

from core.exceptions import CustomAPIException

from . import credit_pricing as pricing
from .credit_models import (
    AICreditAccount,
    AICreditConfig,
    AICreditHold,
    AICreditTransaction,
    AIUsageRecord,
)

logger = logging.getLogger(__name__)

CONFIG_CACHE_KEY = 'ai_credits:config:v1'
CONFIG_CACHE_SECONDS = 60
#: How many times a balance change is retried when another change got there
#: first. Conflicts are rare and resolve on the next read.
MAX_RETRIES = 25
CONFIRM_HEADER = 'HTTP_X_AI_CREDITS_CONFIRM'
CLIENT_HEADER = 'HTTP_X_AI_CREDITS_CLIENT'


# ---------------------------------------------------------------------------
# Refusals the apps know how to show
# ---------------------------------------------------------------------------

def recommended_purchase(required, available, config=None):
    """What to buy to finish a request the person cannot currently afford.

    The smallest sensible purchase that covers the shortfall: at least the
    configured minimum number of credits, priced at or above the gateway
    minimum, in whole credits. Returns {credits, price, currency}, or None when
    buying is not open — so callers can simply leave the recommendation out.
    """
    try:
        from math import ceil

        from apps.fees import fapshi

        from . import credit_pricing as pricing

        config = config or get_config()
        if not config.purchases_enabled:
            return None
        ppc = float(config.price_per_credit or 0)
        shortfall = max(int(required) - int(available or 0), 0)
        credits = max(shortfall, int(config.min_purchase_credits))
        if ppc > 0:
            # Never recommend a purchase the gateway would reject as too small.
            credits = max(credits, ceil(fapshi.MINIMUM_AMOUNT / ppc))
        credits = min(credits, int(config.max_purchase_credits))
        price = int(pricing.price_for_credits(config, credits))
        return {'credits': credits, 'price': price, 'currency': config.currency}
    except Exception:  # noqa: BLE001 - a recommendation must never break the error path
        return None


class InsufficientCredits(CustomAPIException):
    """The request needs more credits than the person has."""

    status_code = status.HTTP_402_PAYMENT_REQUIRED
    default_detail = 'You do not have enough AI credits for this request.'
    default_code = 'ai_credits_insufficient'

    def __init__(self, *, required, available, balance=None, estimate=None):
        rec = recommended_purchase(required, available)
        detail = (
            f'You have run out of AI credits: this answer needs about {required} '
            f'and you have {available}. '
        )
        if rec:
            detail += (
                f"To finish it now, buy about {rec['credits']} credits for "
                f"{rec['price']} {rec['currency']}, or wait for tomorrow's free credits."
            )
        else:
            detail += 'Your free credits refresh tomorrow.'
        super().__init__(detail)
        self.extra = {
            'required': required,
            'available': available,
            'estimate': estimate,
            'balance': balance,
            'recommended_purchase': rec,
        }


class CreditConfirmationRequired(CustomAPIException):
    """A heavy request: the person is shown the cost and asked first."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Please confirm the AI credits this request will use.'
    default_code = 'ai_credits_confirmation_required'

    def __init__(self, *, estimate, balance):
        super().__init__(
            f'This request will use about {estimate["credits"]} AI credits. '
            f'You have {balance["total_available"]}.'
        )
        self.extra = {'estimate': estimate, 'balance': balance}


class CreditConflict(Exception):
    """A balance kept changing under us. Practically never happens."""


# ---------------------------------------------------------------------------
# Configuration and time
# ---------------------------------------------------------------------------

def get_config() -> AICreditConfig:
    config = cache.get(CONFIG_CACHE_KEY)
    if isinstance(config, AICreditConfig):
        return config
    config, _ = AICreditConfig.objects.get_or_create(pk=1)
    cache.set(CONFIG_CACHE_KEY, config, CONFIG_CACHE_SECONDS)
    return config


def invalidate_config():
    cache.delete(CONFIG_CACHE_KEY)


def credit_timezone() -> ZoneInfo:
    """The day free credits belong to is a day in Cameroon, not in UTC.

    Set explicitly so a student in Douala gets their new allowance at their
    own midnight, whatever the server's clock says.
    """
    name = getattr(settings, 'AI_CREDITS_TIMEZONE', 'Africa/Douala') or 'Africa/Douala'
    try:
        return ZoneInfo(name)
    except Exception:  # noqa: BLE001 - a typo in the setting must not stop the AI
        logger.error('Unknown AI_CREDITS_TIMEZONE %r; falling back to Africa/Douala', name)
        return ZoneInfo('Africa/Douala')


def credit_today():
    return timezone.now().astimezone(credit_timezone()).date()


def next_reset_at() -> datetime:
    tz = credit_timezone()
    return datetime.combine(credit_today() + timedelta(days=1), time.min, tzinfo=tz)


def daily_allowance_for(user, config) -> int:
    """How many free credits this person gets each day.

    Guests of the chat bots get a smaller allowance than people with an
    EduIgnite account, which is also the reason to create or link one.
    """
    if (getattr(user, 'role', '') or '') == 'AI_GUEST':
        return int(config.guest_daily_free_credits)
    return int(config.daily_free_credits)


def is_exempt(user, config=None) -> bool:
    """Whether this person is not charged for AI.

    Nobody is while billing is switched off (the free testing mode). When it
    is on, executives still are not: they run the platform. Either way their
    use is recorded, so its cost is known.
    """
    config = config or get_config()
    if not config.billing_enabled:
        return True
    return bool(config.exempt_platform_executives and getattr(user, 'is_platform_executive', False))


# ---------------------------------------------------------------------------
# Accounts and the daily cycle
# ---------------------------------------------------------------------------

def _ledger(account_user_id, *, kind, free_delta=0, purchased_delta=0, free_after, purchased_after,
            feature='', description='', reference_id='', usage=None, created_by=None, metadata=None):
    return AICreditTransaction.objects.create(
        user_id=account_user_id,
        kind=kind,
        amount=free_delta + purchased_delta,
        free_delta=free_delta,
        purchased_delta=purchased_delta,
        balance_after=free_after + purchased_after,
        free_balance_after=free_after,
        purchased_balance_after=purchased_after,
        feature=feature or '',
        description=(description or '')[:255],
        reference_id=(reference_id or '')[:100],
        usage=usage,
        created_by=created_by,
        metadata=metadata or {},
    )


def _create_account(user, config) -> AICreditAccount:
    today = credit_today()
    allowance = daily_allowance_for(user, config)
    try:
        with transaction.atomic():
            account = AICreditAccount.objects.create(
                user=user,
                cycle_date=today,
                daily_free_remaining=allowance,
                daily_free_allowance=allowance,
                purchased_balance=0,
            )
            if allowance:
                _ledger(
                    user.pk, kind=AICreditTransaction.DAILY_FREE, free_delta=allowance,
                    free_after=allowance, purchased_after=0,
                    description=f"Today's {allowance} free AI credits",
                    reference_id=f'daily:{user.pk}:{today.isoformat()}',
                )
            return account
    except IntegrityError:
        # Two first requests at once: the other one made the account.
        return AICreditAccount.objects.get(user=user)


def _refresh_cycle(account: AICreditAccount, config) -> AICreditAccount:
    """Start a new day if one has begun since the account last moved.

    Works however long the person has been away: yesterday's leftovers expire
    and today's allowance is granted, once, whoever gets here first.
    """
    today = credit_today()
    for _ in range(MAX_RETRIES):
        if account.cycle_date >= today:
            return account
        leftover = account.daily_free_remaining
        allowance = daily_allowance_for(account.user, config)
        try:
            with transaction.atomic():
                won = AICreditAccount.objects.filter(
                    pk=account.pk,
                    cycle_date=account.cycle_date,
                    daily_free_remaining=leftover,
                    purchased_balance=account.purchased_balance,
                ).update(
                    cycle_date=today,
                    daily_free_remaining=allowance,
                    daily_free_allowance=allowance,
                    updated_at=timezone.now(),
                )
                if won:
                    if leftover:
                        _ledger(
                            account.user_id, kind=AICreditTransaction.DAILY_EXPIRY, free_delta=-leftover,
                            free_after=0, purchased_after=account.purchased_balance,
                            description=f'{leftover} unused free credits from {account.cycle_date:%d %b} expired',
                            reference_id=f'expiry:{account.user_id}:{account.cycle_date.isoformat()}',
                        )
                    if allowance:
                        _ledger(
                            account.user_id, kind=AICreditTransaction.DAILY_FREE, free_delta=allowance,
                            free_after=allowance, purchased_after=account.purchased_balance,
                            description=f"Today's {allowance} free AI credits",
                            reference_id=f'daily:{account.user_id}:{today.isoformat()}',
                        )
        except IntegrityError:
            logger.exception('Daily AI credit reset collided for user %s', account.user_id)
        account.refresh_from_db()
    raise CreditConflict(f'Could not start the new credit day for user {account.user_id}.')


def get_account(user, config=None) -> AICreditAccount:
    """This person's account, created if new, on today's cycle."""
    config = config or get_config()
    account = AICreditAccount.objects.filter(user=user).first()
    if account is None:
        account = _create_account(user, config)
    return _refresh_cycle(account, config)


def run_daily_free_expiry(config=None) -> int:
    """Expire yesterday's unused free credits for everyone, on schedule.

    The daily reset is otherwise lazy — it only happens the next time a person
    touches their account. For someone who does not open the app, their unused
    free credits would then sit there with no expiry line ever written against
    them, which reads like free credits piling up day after day. A scheduled
    sweep closes that gap: every account that has rolled into a new day with
    free credits still on it has them expired and the new day's allowance
    granted, exactly as a live request would, so unused free credits never
    survive past their own day. Returns how many accounts were rolled over.
    """
    config = config or get_config()
    today = credit_today()
    rolled = 0
    stale_ids = list(
        AICreditAccount.objects.filter(
            cycle_date__lt=today, daily_free_remaining__gt=0,
        ).values_list('pk', flat=True)
    )
    for pk in stale_ids:
        account = AICreditAccount.objects.filter(pk=pk).first()
        if account is None or account.cycle_date >= today:
            continue
        try:
            _refresh_cycle(account, config)
            rolled += 1
        except CreditConflict:
            logger.warning('Daily free-credit expiry skipped account %s (kept changing)', pk)
    return rolled


def _move(user, compute, config):
    """Apply one change to an account, atomically, retrying on conflict.

    `compute(account)` returns (free_delta, purchased_delta) for the account as
    it currently is, or raises to refuse. The update only lands if nobody else
    changed the row since it was read. Must be called inside a transaction
    together with the ledger line it goes with.
    """
    for _ in range(MAX_RETRIES):
        account = get_account(user, config)
        free_delta, purchased_delta = compute(account)
        new_free = account.daily_free_remaining + free_delta
        new_purchased = account.purchased_balance + purchased_delta
        if new_free < 0 or new_purchased < 0:
            raise InsufficientCredits(required=-(free_delta + purchased_delta), available=account.total_available)
        updated = AICreditAccount.objects.filter(
            pk=account.pk,
            cycle_date=account.cycle_date,
            daily_free_remaining=account.daily_free_remaining,
            purchased_balance=account.purchased_balance,
        ).update(
            daily_free_remaining=new_free,
            purchased_balance=new_purchased,
            updated_at=timezone.now(),
        )
        if updated:
            return account, new_free, new_purchased
    raise CreditConflict(f'AI credit balance for user {user.pk} kept changing; giving up.')


# ---------------------------------------------------------------------------
# What a person can see
# ---------------------------------------------------------------------------

def balance(user, config=None) -> dict:
    config = config or get_config()
    account = get_account(user, config)
    exempt = is_exempt(user, config)
    held = AICreditHold.objects.filter(user=user, status=AICreditHold.HELD).aggregate(total=Sum('estimated_credits'))
    used_today = AICreditTransaction.objects.filter(
        user=user,
        kind=AICreditTransaction.AI_USAGE,
        created_at__gte=datetime.combine(account.cycle_date, time.min, tzinfo=credit_timezone()),
    ).aggregate(total=Sum('amount'))
    total = account.total_available
    return {
        'daily_free_remaining': account.daily_free_remaining,
        'daily_free_limit': account.daily_free_allowance or daily_allowance_for(user, config),
        'is_guest': (getattr(user, 'role', '') or '') == 'AI_GUEST',
        'purchased_balance': account.purchased_balance,
        'total_available': total,
        'held': int(held['total'] or 0),
        'used_today': -int(used_today['total'] or 0),
        'unlimited': exempt,
        # AI is free for everyone right now (billing switched off).
        'free_mode': not config.billing_enabled,
        'low_balance': (not exempt) and 0 < total <= int(config.low_balance_threshold),
        'low_balance_threshold': int(config.low_balance_threshold),
        'exhausted': (not exempt) and total <= 0,
        'next_reset_at': next_reset_at().isoformat(),
        'timezone': str(credit_timezone()),
        'confirm_above_credits': int(config.confirm_above_credits),
        'purchases_enabled': config.purchases_enabled,
        'currency': config.currency,
        'min_purchase_credits': int(config.min_purchase_credits),
        'max_purchase_credits': int(config.max_purchase_credits),
    }


# ---------------------------------------------------------------------------
# Estimating, confirming and holding
# ---------------------------------------------------------------------------

def estimate_request(feature, *, purpose=None, response_format=None, config=None, **kwargs) -> pricing.Estimate:
    """What a request of this feature will roughly cost, system prompt included."""
    from .utils import build_system_prompt, model_for_purpose

    config = config or get_config()
    request_purpose = purpose if purpose is not None else ('' if feature == pricing.CHAT_FEATURE else feature)
    system_tokens = pricing.tokens_for_text(build_system_prompt(request_purpose, response_format))
    model = kwargs.pop('model', None) or model_for_purpose(request_purpose, kwargs.get('images', 0))
    return pricing.estimate(config, feature, system_prompt_tokens=system_tokens, model=model, **kwargs)


def client_can_confirm(request) -> bool:
    """Whether the app sending this can show a confirmation and resend.

    Current apps say so on every request. Builds already installed on phones
    and computers cannot, so they are never asked: they are still refused what
    the person cannot afford, but a heavy request simply runs.
    """
    return bool(request is not None and request.META.get(CLIENT_HEADER))


def confirmation_given(request) -> bool:
    if request is None:
        return False
    header = request.META.get(CONFIRM_HEADER, '')
    if str(header).strip().lower() in ('1', 'true', 'yes'):
        return True
    data = getattr(request, 'data', None)
    if isinstance(data, dict):
        return str(data.get('confirm_credits', '')).strip().lower() in ('1', 'true', 'yes')
    return False


def require_affordable(user, estimate: pricing.Estimate, *, request=None, config=None,
                       can_confirm=None, confirmed=None):
    """Refuse up front what the person cannot pay for, and ask about heavy work.

    Nothing is created or sent to the model before this has passed. An HTTP
    request says for itself whether it can confirm and has confirmed; a chat
    bot, which has no request, says so through `can_confirm` and `confirmed`.
    """
    config = config or get_config()
    if is_exempt(user, config):
        return
    current = balance(user, config)
    if current['total_available'] < estimate.credits:
        raise InsufficientCredits(
            required=estimate.credits,
            available=current['total_available'],
            balance=current,
            estimate=estimate.as_dict(),
        )
    if (
        estimate.credits > int(config.confirm_above_credits)
        and (client_can_confirm(request) if can_confirm is None else can_confirm)
        and not (confirmation_given(request) if confirmed is None else confirmed)
    ):
        raise CreditConfirmationRequired(estimate=estimate.as_dict(), balance=current)


def hold_credits(user, feature, credits, *, ai_request=None, config=None):
    """Set credits aside for a request about to run. None for exempt users."""
    config = config or get_config()
    if is_exempt(user, config):
        return None
    credits = int(credits)

    def compute(account):
        if account.total_available < credits:
            raise InsufficientCredits(required=credits, available=account.total_available)
        from_free = min(account.daily_free_remaining, credits)
        return -from_free, -(credits - from_free)

    with transaction.atomic():
        account, _, _ = _move(user, compute, config)
        take_free = min(account.daily_free_remaining, credits)
        return AICreditHold.objects.create(
            user=user,
            ai_request=ai_request,
            feature=feature,
            estimated_credits=credits,
            free_amount=take_free,
            purchased_amount=credits - take_free,
            cycle_date=account.cycle_date,
        )


def hold_for_request(ai_request, estimate: pricing.Estimate, *, config=None):
    """Hold the estimate against an AI request that has just been created.

    Should the balance have changed since the up-front check, the request is
    marked failed rather than left waiting forever, and the refusal raised.
    """
    try:
        return hold_credits(ai_request.user, estimate.feature, estimate.credits, ai_request=ai_request, config=config)
    except InsufficientCredits:
        ai_request.mark_failed('Not enough AI credits.')
        raise


def _return_hold(hold, account_cycle_date):
    """What of a hold can go back: purchased always, free only on its own day."""
    same_day = account_cycle_date == hold.cycle_date
    return (hold.free_amount if same_day else 0), hold.purchased_amount


def release_hold(hold: AICreditHold, reason: str, *, config=None) -> bool:
    """Give a hold back in full. Safe to call more than once."""
    config = config or get_config()
    with transaction.atomic():
        claimed = AICreditHold.objects.filter(pk=hold.pk, status=AICreditHold.HELD).update(
            status=AICreditHold.RELEASED,
            release_reason=(reason or '')[:255],
            closed_at=timezone.now(),
        )
        if not claimed:
            return False
        lost = {'free': 0}

        def compute(account):
            free_back, purchased_back = _return_hold(hold, account.cycle_date)
            lost['free'] = hold.free_amount - free_back
            return free_back, purchased_back

        account, free_after, purchased_after = _move(hold.user, compute, config)
        if lost['free']:
            # Held yesterday, returned today: those free credits belonged to a
            # day that is over, like any other unused free credits.
            _ledger(
                hold.user_id, kind=AICreditTransaction.DAILY_EXPIRY, free_delta=-lost['free'],
                free_after=free_after, purchased_after=purchased_after,
                feature=hold.feature,
                description=f"{lost['free']} free credits from {hold.cycle_date:%d %b} expired",
            )
    return True


# ---------------------------------------------------------------------------
# Charging for finished work
# ---------------------------------------------------------------------------

def _charge_description(feature):
    return FEATURE_LABELS.get(feature, feature.replace('_', ' ').title())


def settle_hold(hold: AICreditHold, credits: int, *, usage=None, config=None) -> tuple[int, int]:
    """Charge the real cost against a hold. Returns (charged, waived).

    Anything held beyond the cost goes back. A cost above the hold is taken
    from the balance if it is there; whatever is not there is waived rather
    than pushing the account below zero.
    """
    config = config or get_config()
    credits = max(int(credits), 0)
    with transaction.atomic():
        claimed = AICreditHold.objects.filter(pk=hold.pk, status=AICreditHold.HELD).update(
            status=AICreditHold.SETTLED, closed_at=timezone.now(),
        )
        if not claimed:
            return 0, 0

        charged_free = min(hold.free_amount, credits)
        charged_purchased = min(hold.purchased_amount, credits - charged_free)
        extra = credits - charged_free - charged_purchased
        outcome = {}

        def compute(account):
            free_back, purchased_back = _return_hold(hold, account.cycle_date)
            free_back = max(free_back - charged_free, 0) if free_back else 0
            purchased_back = hold.purchased_amount - charged_purchased
            lost = (hold.free_amount - charged_free) - free_back
            spendable_free = account.daily_free_remaining + free_back
            spendable_purchased = account.purchased_balance + purchased_back
            extra_free = min(spendable_free, extra)
            extra_purchased = min(spendable_purchased, extra - extra_free)
            outcome.update(lost=lost, extra_free=extra_free, extra_purchased=extra_purchased)
            return free_back - extra_free, purchased_back - extra_purchased

        account, free_after, purchased_after = _move(hold.user, compute, config)
        free_spent = charged_free + outcome['extra_free']
        purchased_spent = charged_purchased + outcome['extra_purchased']
        charged = free_spent + purchased_spent
        waived = credits - charged
        if charged:
            _ledger(
                hold.user_id, kind=AICreditTransaction.AI_USAGE,
                free_delta=-free_spent, purchased_delta=-purchased_spent,
                free_after=free_after, purchased_after=purchased_after,
                feature=hold.feature, description=_charge_description(hold.feature),
                reference_id=f'ai:{hold.ai_request_id or hold.pk}', usage=usage,
            )
        if outcome['lost']:
            _ledger(
                hold.user_id, kind=AICreditTransaction.DAILY_EXPIRY, free_delta=-outcome['lost'],
                free_after=free_after, purchased_after=purchased_after, feature=hold.feature,
                description=f"{outcome['lost']} free credits from {hold.cycle_date:%d %b} expired",
            )
    return charged, waived


def charge_direct(user, feature, credits, *, reference_id='', usage=None, config=None) -> tuple[int, int]:
    """Charge finished work that had no hold. Never below zero; the rest is waived."""
    config = config or get_config()
    credits = max(int(credits), 0)
    if not credits:
        return 0, 0
    if reference_id and AICreditTransaction.objects.filter(
        kind=AICreditTransaction.AI_USAGE, reference_id=reference_id,
    ).exists():
        return 0, 0
    split = {}

    def compute(account):
        from_free = min(account.daily_free_remaining, credits)
        from_purchased = min(account.purchased_balance, credits - from_free)
        split.update(free=from_free, purchased=from_purchased)
        return -from_free, -from_purchased

    try:
        with transaction.atomic():
            _, free_after, purchased_after = _move(user, compute, config)
            charged = split['free'] + split['purchased']
            if charged:
                _ledger(
                    user.pk, kind=AICreditTransaction.AI_USAGE,
                    free_delta=-split['free'], purchased_delta=-split['purchased'],
                    free_after=free_after, purchased_after=purchased_after,
                    feature=feature, description=_charge_description(feature),
                    reference_id=reference_id, usage=usage,
                )
    except IntegrityError:
        # Already charged for this request.
        return 0, 0
    return charged, credits - charged


# ---------------------------------------------------------------------------
# Adding credits
# ---------------------------------------------------------------------------

def grant(user, amount, kind, *, reference_id='', description='', created_by=None, metadata=None, config=None):
    """Add credits to the purchased bucket, once per reference.

    Returns (transaction, created). Purchases, bonuses, refunds and positive
    adjustments all land in the bucket that does not expire.
    """
    config = config or get_config()
    amount = int(amount)
    if amount <= 0:
        raise ValueError('A grant must add credits.')
    if reference_id:
        existing = AICreditTransaction.objects.filter(kind=kind, reference_id=reference_id).first()
        if existing:
            return existing, False
    try:
        with transaction.atomic():
            _, free_after, purchased_after = _move(user, lambda account: (0, amount), config)
            return _ledger(
                user.pk, kind=kind, purchased_delta=amount,
                free_after=free_after, purchased_after=purchased_after,
                description=description, reference_id=reference_id,
                created_by=created_by, metadata=metadata,
            ), True
    except IntegrityError:
        return AICreditTransaction.objects.get(kind=kind, reference_id=reference_id), False


def deduct(user, amount, *, description='', created_by=None, config=None):
    """Take credits away by hand: purchased first, then today's free ones."""
    config = config or get_config()
    amount = int(amount)
    split = {}

    def compute(account):
        if account.total_available < amount:
            raise InsufficientCredits(required=amount, available=account.total_available)
        from_purchased = min(account.purchased_balance, amount)
        split.update(free=amount - from_purchased, purchased=from_purchased)
        return -(amount - from_purchased), -from_purchased

    with transaction.atomic():
        _, free_after, purchased_after = _move(user, compute, config)
        return _ledger(
            user.pk, kind=AICreditTransaction.ADMIN_ADJUSTMENT,
            free_delta=-split['free'], purchased_delta=-split['purchased'],
            free_after=free_after, purchased_after=purchased_after,
            description=description, created_by=created_by,
        )


def transfer_purchased(from_user, to_user, *, description='', config=None) -> int:
    """Move every bought credit from one account to another. Returns how many.

    Used when a chat guest links their real EduIgnite account: what they paid
    for goes with them. Free credits stay behind; they belong to the day.
    """
    config = config or get_config()
    moved = {'n': 0}

    def take(account):
        moved['n'] = account.purchased_balance
        return 0, -account.purchased_balance

    with transaction.atomic():
        _, free_after, purchased_after = _move(from_user, take, config)
        if not moved['n']:
            return 0
        _ledger(
            from_user.pk, kind=AICreditTransaction.TRANSFER, purchased_delta=-moved['n'],
            free_after=free_after, purchased_after=purchased_after,
            description=(description or 'Moved to your EduIgnite account')[:255],
            metadata={'to_user': str(to_user.pk)},
        )
        _, free_after, purchased_after = _move(to_user, lambda account: (0, moved['n']), config)
        _ledger(
            to_user.pk, kind=AICreditTransaction.TRANSFER, purchased_delta=moved['n'],
            free_after=free_after, purchased_after=purchased_after,
            description=(description or 'Credits from your chat guest account')[:255],
            metadata={'from_user': str(from_user.pk)},
        )
    return moved['n']


def grant_purchase(txn):
    """Credit a paid gateway transaction. Idempotent on the transaction id."""
    user = txn.beneficiary or txn.initiated_by
    if user is None or not txn.ai_credits:
        logger.error('AI credit purchase %s has no user or no credits', txn.transaction_id)
        return None, False
    return grant(
        user,
        txn.ai_credits,
        AICreditTransaction.PURCHASE,
        reference_id=f'gw:{txn.transaction_id}',
        description=f'Bought {txn.ai_credits:,} AI credits',
        metadata={
            'amount': str(txn.amount),
            'currency': txn.currency,
            'transaction_id': txn.transaction_id,
            'provider_transaction_id': txn.provider_transaction_id,
        },
    )


# ---------------------------------------------------------------------------
# Metering: counting the work while it happens
# ---------------------------------------------------------------------------

_current_meter: contextvars.ContextVar = contextvars.ContextVar('ai_credit_meter', default=None)


@dataclass
class Meter:
    user: object
    feature: str
    ai_request: object = None
    hold: object = None
    documents: int = 0
    images: int = 0
    channel: str = 'app'
    estimated_credits: int = 0
    calls: list = field(default_factory=list)
    #: 'completed' or 'failed' when the caller knows; otherwise read from the
    #: AI request when the work ends.
    outcome: str | None = None
    cached_response: bool = False

    def add(self, result: dict):
        self.calls.append(result)

    def complete(self):
        self.outcome = 'completed'

    def fail(self):
        self.outcome = 'failed'

    def served_from_cache(self):
        self.cached_response = True
        self.outcome = 'completed'

    @property
    def successful_calls(self):
        return [call for call in self.calls if call.get('success')]

    @property
    def truncated(self):
        return any(
            (call.get('finish_reason') or '') == 'length' and not call.get('continued')
            for call in self.successful_calls
        )

    def usage(self) -> pricing.Usage:
        calls = self.successful_calls
        models = [call.get('model') for call in calls if call.get('model')]
        return pricing.Usage(
            input_tokens=sum(int(call.get('input_tokens') or 0) for call in calls),
            output_tokens=sum(int(call.get('output_tokens') or 0) for call in calls),
            cached_tokens=sum(int(call.get('cached_tokens') or 0) for call in calls),
            model=models[-1] if models else '',
            documents=self.documents,
            images=self.images,
            cached_response=self.cached_response,
        )


def record_provider_call(result: dict):
    """Called by `call_groq_api` after every call. Counts it if metering is on."""
    meter = _current_meter.get()
    if meter is not None and result is not None:
        # The result itself, not a copy: a caller that continues a cut-off
        # answer marks this call as continued, so it is not billed as partial.
        meter.add(result)


def _succeeded(meter: Meter) -> bool:
    if meter.outcome is not None:
        return meter.outcome == 'completed'
    ai_request = meter.ai_request
    if ai_request is None:
        return bool(meter.successful_calls)
    ai_request.refresh_from_db(fields=['status'])
    return ai_request.status == 'completed'


def _finish(meter: Meter, error: str = ''):
    """Settle or release, and write down what the work cost."""
    config = get_config()
    usage = meter.usage()
    hold = meter.hold
    if hold is None and meter.ai_request is not None:
        hold = AICreditHold.objects.filter(ai_request=meter.ai_request, status=AICreditHold.HELD).first()

    delivered = not error and _succeeded(meter) and (meter.successful_calls or meter.cached_response)
    worth = pricing.credits_for_usage(config, meter.feature, usage) if delivered else 0
    to_charge = worth
    status_value = AIUsageRecord.CACHED if meter.cached_response else AIUsageRecord.COMPLETED
    if delivered and meter.truncated:
        status_value = AIUsageRecord.PARTIAL
        if config.partial_response_policy == AICreditConfig.PARTIAL_REFUND:
            to_charge = 0
        elif config.partial_response_policy == AICreditConfig.PARTIAL_CHARGE_HALF:
            to_charge = (worth + 1) // 2
    exempt = is_exempt(meter.user, config)
    if not delivered:
        status_value = AIUsageRecord.FAILED
    elif exempt:
        status_value = AIUsageRecord.EXEMPT

    record = AIUsageRecord.objects.create(
        user=meter.user,
        school_id=getattr(meter.user, 'school_id', None),
        ai_request=meter.ai_request,
        hold=hold,
        feature=meter.feature,
        channel=meter.channel,
        model=usage.model,
        provider_calls=len(meter.calls),
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cached_tokens=usage.cached_tokens,
        documents_count=meter.documents,
        images_count=meter.images,
        estimated_credits=hold.estimated_credits if hold else meter.estimated_credits,
        actual_credits=worth,
        provider_cost=pricing.provider_cost(config, usage),
        status=status_value,
        processing_time_ms=sum(int(call.get('processing_time_ms') or 0) for call in meter.calls),
        error=(error or ('' if delivered else 'No usable answer was produced.'))[:255],
    )

    charged = waived = 0
    if not delivered or exempt or to_charge == 0:
        if hold is not None:
            release_hold(hold, error or ('Exempt' if exempt and delivered else 'The AI request did not complete.'), config=config)
    elif hold is not None:
        charged, waived = settle_hold(hold, to_charge, usage=record, config=config)
    else:
        reference = f'ai:{meter.ai_request.pk}' if meter.ai_request is not None else ''
        charged, waived = charge_direct(
            meter.user, meter.feature, to_charge, reference_id=reference, usage=record, config=config,
        )
    if charged or waived:
        record.charged_credits = charged
        record.waived_credits = waived
        record.save(update_fields=['charged_credits', 'waived_credits', 'updated_at'])
    return record


@contextmanager
def metered(ai_request=None, *, user=None, feature=None, hold=None, documents=0, images=0,
            estimated_credits=0, channel='app'):
    """Count every provider call made inside, then charge or refund once.

    Nested use is harmless: the outermost meter does the counting.
    """
    if _current_meter.get() is not None:
        yield _current_meter.get()
        return
    meter = Meter(
        user=user or getattr(ai_request, 'user', None),
        feature=feature or pricing.feature_key(getattr(ai_request, 'request_type', None)),
        ai_request=ai_request,
        hold=hold,
        documents=documents,
        images=images,
        channel=channel,
        estimated_credits=estimated_credits,
    )
    token = _current_meter.set(meter)
    error = ''
    try:
        yield meter
    except BaseException as exc:
        error = f'{type(exc).__name__}: {exc}'[:255]
        raise
    finally:
        _current_meter.reset(token)
        if meter.user is not None:
            try:
                _finish(meter, error)
            except Exception:  # noqa: BLE001 - never lose the answer over the bookkeeping
                logger.exception(
                    'AI credit settlement failed for user %s feature %s request %s',
                    getattr(meter.user, 'pk', None), meter.feature, getattr(meter.ai_request, 'pk', None),
                )


def meters(get_ai_request):
    """Decorate a feature's generate function so its work is metered."""

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(target, *args, **kwargs):
            ai_request = get_ai_request(target)
            if ai_request is None:
                return fn(target, *args, **kwargs)
            with metered(ai_request):
                return fn(target, *args, **kwargs)

        return wrapper

    return decorator


def release_stale_holds(config=None) -> int:
    """Give back holds whose request died without finishing (a killed worker)."""
    config = config or get_config()
    cutoff = timezone.now() - timedelta(minutes=int(config.hold_timeout_minutes))
    released = 0
    for hold in AICreditHold.objects.filter(status=AICreditHold.HELD, created_at__lt=cutoff).select_related('user')[:500]:
        if release_hold(hold, 'The request did not finish in time.', config=config):
            released += 1
    return released


FEATURE_LABELS = {
    'chat': 'AI Assistant',
    'image_question': 'Image Question',
    'study_plan': 'Study Plan',
    'grade_analysis': 'Grade Analysis',
    'attendance_insight': 'Attendance Insight',
    'exam_prep': 'Exam Preparation',
    'parent_report': 'Parent Report',
    'teacher_insight': 'Teacher Insight',
    'ai_exam_generation': 'AI Exam Generation',
    'career_orientation': 'Career Orientation',
    'academic_roadmap': 'Academic Roadmap',
    'skill_gap_analysis': 'Skill Gap Analysis',
    'student_guidance': 'Student Guidance Report',
    'math_solver': 'Mathematics Solver',
    'quiz_generation': 'Quiz Generation',
    'study_notes': 'Study Notes',
    'document_analysis': 'Document Analysis',
    'lesson_generation': 'Lesson Generation',
    'course_generation': 'Course Generation',
}

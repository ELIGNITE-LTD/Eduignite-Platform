"""The numbers behind AI credits, for the people who run EduIgnite.

Everything here is read from what actually happened - the ledger, the usage
records and the payments - never from a hard-coded figure. It answers the
questions the business needs before it can set a price: how much AI work
people do, what that work costs us per credit, and whether the daily free
allowance is sustainable at the price being charged.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .credit_engine import FEATURE_LABELS, credit_timezone, get_config
from .credit_models import AICreditTransaction, AIUsageRecord


def _int(value) -> int:
    return int(value or 0)


def _money(value) -> float:
    return float(Decimal(value or 0).quantize(Decimal('0.01')))


def _ratio(numerator, denominator, places=2) -> float:
    if not denominator:
        return 0.0
    return round(float(numerator) / float(denominator), places)


def economics(days: int = 30) -> dict:
    from apps.fees.models import GatewayTransaction

    config = get_config()
    days = max(1, min(int(days or 30), 366))
    since = timezone.now() - timedelta(days=days)
    tz = credit_timezone()

    ledger = AICreditTransaction.objects.filter(created_at__gte=since)
    issued = {
        row['kind']: _int(row['total'])
        for row in ledger.filter(amount__gt=0).values('kind').annotate(total=Sum('amount'))
    }
    usage_lines = ledger.filter(kind=AICreditTransaction.AI_USAGE).aggregate(
        free=Sum('free_delta'), purchased=Sum('purchased_delta'), total=Sum('amount'),
    )
    free_used = -_int(usage_lines['free'])
    purchased_used = -_int(usage_lines['purchased'])
    consumed = -_int(usage_lines['total'])
    expired = -_int(ledger.filter(kind=AICreditTransaction.DAILY_EXPIRY).aggregate(total=Sum('amount'))['total'])

    sales = GatewayTransaction.objects.filter(
        purpose=GatewayTransaction.PURPOSE_AI_CREDITS,
        status=GatewayTransaction.STATUS_SUCCESS,
        environment=GatewayTransaction.ENV_LIVE,
        modified__gte=since,
    ).aggregate(revenue=Sum('amount'), credits=Sum('ai_credits'), count=Count('id'))
    revenue = Decimal(sales['revenue'] or 0)

    usage = AIUsageRecord.objects.filter(created_at__gte=since)
    totals = usage.aggregate(
        requests=Count('id'),
        charged_requests=Count('id', filter=Q(charged_credits__gt=0)),
        failed=Count('id', filter=Q(status=AIUsageRecord.FAILED)),
        exempt=Count('id', filter=Q(status=AIUsageRecord.EXEMPT)),
        partial=Count('id', filter=Q(status=AIUsageRecord.PARTIAL)),
        cost=Sum('provider_cost'),
        worth=Sum('actual_credits'),
        waived=Sum('waived_credits'),
        input_tokens=Sum('input_tokens'),
        output_tokens=Sum('output_tokens'),
        cached_tokens=Sum('cached_tokens'),
        estimated=Sum('estimated_credits'),
    )
    requests = _int(totals['requests'])
    provider_cost = Decimal(totals['cost'] or 0)
    worth = _int(totals['worth'])
    active_users = usage.values('user').distinct().count()
    user_days = (
        usage.annotate(day=TruncDate('created_at', tzinfo=tz)).values('user', 'day').distinct().count()
    )

    payment_fees = revenue * Decimal(config.payment_processing_percent or 0) / 100
    infrastructure = Decimal(config.infrastructure_cost_per_request or 0) * requests
    gross_margin = revenue - provider_cost - payment_fees - infrastructure

    # What one credit of work costs us to produce, from the real mix of
    # features and models. The floor under any price per credit.
    cost_per_credit = (provider_cost / worth) if worth else Decimal('0')
    keep_share = 1 - Decimal(config.payment_processing_percent or 0) / 100
    break_even_price = (cost_per_credit / keep_share) if keep_share > 0 else cost_per_credit
    free_per_user_day = _ratio(free_used, user_days)

    by_feature = []
    feature_rows = (
        usage.values('feature')
        .annotate(
            requests=Count('id'),
            credits=Sum('charged_credits'),
            worth=Sum('actual_credits'),
            cost=Sum('provider_cost'),
            input_tokens=Sum('input_tokens'),
            output_tokens=Sum('output_tokens'),
        )
        .order_by('-worth')
    )
    for row in feature_rows:
        row_worth = _int(row['worth'])
        by_feature.append({
            'feature': row['feature'],
            'label': FEATURE_LABELS.get(row['feature'], row['feature'].replace('_', ' ').title()),
            'requests': _int(row['requests']),
            'credits_charged': _int(row['credits']),
            'credits_worth': row_worth,
            'share_percent': _ratio(row_worth * 100, worth, 1),
            'provider_cost': _money(row['cost']),
            'avg_credits_per_request': _ratio(row_worth, row['requests'], 1),
            'avg_input_tokens': _ratio(row['input_tokens'], row['requests'], 0),
            'avg_output_tokens': _ratio(row['output_tokens'], row['requests'], 0),
        })

    by_channel = [
        {
            'channel': row['channel'],
            'requests': _int(row['requests']),
            'users': _int(row['users']),
            'credits_worth': _int(row['worth']),
            'provider_cost': _money(row['cost']),
        }
        for row in usage.values('channel')
        .annotate(requests=Count('id'), users=Count('user', distinct=True), worth=Sum('actual_credits'),
                  cost=Sum('provider_cost'))
        .order_by('-requests')
    ]

    daily = [
        {
            'date': row['day'].isoformat(),
            'requests': _int(row['requests']),
            'credits_charged': _int(row['credits']),
            'credits_worth': _int(row['worth']),
            'provider_cost': _money(row['cost']),
            'active_users': _int(row['users']),
        }
        for row in usage.annotate(day=TruncDate('created_at', tzinfo=tz))
        .values('day')
        .annotate(
            requests=Count('id'),
            credits=Sum('charged_credits'),
            worth=Sum('actual_credits'),
            cost=Sum('provider_cost'),
            users=Count('user', distinct=True),
        )
        .order_by('day')
    ]

    all_time_issued = {
        row['kind']: _int(row['total'])
        for row in AICreditTransaction.objects.filter(amount__gt=0).values('kind').annotate(total=Sum('amount'))
    }

    return {
        'window_days': days,
        'since': since.isoformat(),
        'billing_enabled': config.billing_enabled,
        'currency': config.currency,
        'credits': {
            'issued_total': sum(issued.values()),
            'issued_by_kind': issued,
            'free_issued': issued.get(AICreditTransaction.DAILY_FREE, 0),
            'free_used': free_used,
            'free_expired_unused': expired,
            'purchased_sold': _int(sales['credits']),
            'purchased_used': purchased_used,
            'consumed': consumed,
            'waived': _int(totals['waived']),
            'all_time_issued_total': sum(all_time_issued.values()),
        },
        'money': {
            'credit_revenue': _money(revenue),
            'purchases': _int(sales['count']),
            'provider_cost': _money(provider_cost),
            'payment_processing_cost': _money(payment_fees),
            'infrastructure_cost': _money(infrastructure),
            'gross_margin': _money(gross_margin),
            'gross_margin_percent': _ratio(gross_margin * 100, revenue, 1) if revenue else None,
        },
        'activity': {
            'requests': requests,
            'charged_requests': _int(totals['charged_requests']),
            'failed_requests': _int(totals['failed']),
            'exempt_requests': _int(totals['exempt']),
            'partial_requests': _int(totals['partial']),
            'active_users': active_users,
            'user_days': user_days,
            'avg_credits_per_user_per_day': _ratio(consumed, user_days),
            'avg_credits_per_request': _ratio(worth, requests),
            'avg_cost_per_request': _ratio(provider_cost, requests, 4),
            'avg_input_tokens': _ratio(totals['input_tokens'], requests, 0),
            'avg_output_tokens': _ratio(totals['output_tokens'], requests, 0),
            'cached_tokens': _int(totals['cached_tokens']),
            'estimate_accuracy_percent': _ratio(worth * 100, totals['estimated'], 1) if totals['estimated'] else None,
        },
        'pricing_insight': {
            # The inputs to choosing a price, taken from real usage.
            'provider_cost_per_credit': float(cost_per_credit.quantize(Decimal('0.0001'))),
            'break_even_price_per_credit': float(break_even_price.quantize(Decimal('0.0001'))),
            'current_price_per_credit': float(config.price_per_credit) if config.price_per_credit is not None else None,
            'daily_free_credits': int(config.daily_free_credits),
            'avg_free_credits_used_per_user_day': free_per_user_day,
            'cost_of_free_allowance_per_user_day': round(float(cost_per_credit) * free_per_user_day, 4),
            'cost_of_full_free_allowance_per_user_day': round(float(cost_per_credit) * int(config.daily_free_credits), 4),
        },
        'by_feature': by_feature,
        'by_channel': by_channel,
        'daily': daily,
    }

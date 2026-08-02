"""Pricing for uploaded apps.

Price is a commercial decision, not a code property: a founder sets it in the
console and can change it without a rebuild, exactly as an app store lets you
re-price a published app without resubmitting the binary. The manifest supplies
only a default, seeded on first upload.

This module is the one place that decides what an app costs and, for a
subscription, when a freshly installed licence should expire.
"""

from __future__ import annotations

from datetime import date, timedelta

MODELS = {'free', 'one_time', 'subscription'}
INTERVALS = {'monthly', 'termly', 'yearly'}

#: Roughly how long each interval runs. Termly is one Cameroon term.
INTERVAL_DAYS = {'monthly': 30, 'termly': 120, 'yearly': 365}


def pricing_from_manifest(raw_manifest: dict) -> dict:
    """The default pricing an uploaded manifest declares."""
    block = (raw_manifest or {}).get('pricing') or {}
    model = block.get('model', 'free')
    if model not in MODELS:
        model = 'free'
    interval = block.get('interval') or ''
    if model != 'subscription':
        interval = ''
    elif interval not in INTERVALS:
        interval = 'termly'
    try:
        price = float(block.get('price') or 0)
    except (TypeError, ValueError):
        price = 0.0
    return {
        'model': model,
        'interval': interval,
        'price': 0.0 if model == 'free' else max(price, 0.0),
        'currency': str(block.get('currency') or 'XAF'),
    }


def normalise(pricing: dict) -> dict:
    """Clean a pricing dict coming from a founder, refusing an incoherent one."""
    model = str((pricing or {}).get('model') or 'free')
    if model not in MODELS:
        raise ValueError('Choose free, one-time or subscription.')

    interval = str((pricing or {}).get('interval') or '')
    if model == 'subscription':
        if interval not in INTERVALS:
            raise ValueError('A subscription needs a billing interval.')
    else:
        interval = ''

    if model == 'free':
        price = 0.0
    else:
        try:
            price = float((pricing or {}).get('price') or 0)
        except (TypeError, ValueError):
            raise ValueError('Price must be a number.') from None
        if price <= 0:
            raise ValueError('A paid app needs a price above zero.')

    return {
        'model': model,
        'interval': interval,
        'price': price,
        'currency': str((pricing or {}).get('currency') or 'XAF')[:8] or 'XAF',
    }


def effective(package) -> dict:
    """The pricing in force for an app: the founder's override, or its default."""
    stored = getattr(package, 'pricing', None) or {}
    if stored.get('model'):
        return stored
    live = getattr(package, 'live_build', None)
    return pricing_from_manifest(live.manifest if live else {})


def default_expiry(pricing: dict, *, start: date | None = None) -> date | None:
    """When a licence just granted under this pricing should lapse.

    ``None`` means no expiry — free and one-time apps never lapse. A
    subscription lapses one interval from today, so a founder installing one
    gets a sensible date they can still override.
    """
    if not pricing or pricing.get('model') != 'subscription':
        return None
    days = INTERVAL_DAYS.get(pricing.get('interval'), INTERVAL_DAYS['termly'])
    return (start or date.today()) + timedelta(days=days)

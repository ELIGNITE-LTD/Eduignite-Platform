"""Cheap counters in the cache (one increment per event) that a task folds into per-hour rows for the charts.

The request path must never wait for the database to count itself, so counting is a single cache increment. A
failure of the cache is swallowed: monitoring must never be the reason a request fails.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone

from django.core.cache import cache
from django.utils import timezone

KINDS = ('requests', 'errors_5xx', 'errors_4xx', 'slow', 'client_errors', 'login_failures')
TTL = 4 * 3600


def _stamp(moment=None) -> str:
    return (moment or timezone.now()).astimezone(dt_timezone.utc).strftime('%Y%m%d%H')


def _key(kind: str, stamp: str) -> str:
    return f'watch:c:{kind}:{stamp}'


def bump(kind: str, n: int = 1) -> int:
    """Count one event in the current hour; returns the hour's total so far (0 when the cache is unavailable)."""
    try:
        key = _key(kind, _stamp())
        if cache.add(key, n, TTL):
            return n
        return cache.incr(key, n)
    except Exception:  # noqa: BLE001
        return 0


def read(kind: str, moment=None) -> int:
    try:
        return int(cache.get(_key(kind, _stamp(moment))) or 0)
    except Exception:  # noqa: BLE001
        return 0


def recent(kind: str, minutes: int) -> int:
    """Events counted in about the last ``minutes`` (whole hours at a time, so it is a close approximation)."""
    now = timezone.now()
    hours = {_stamp(now - timedelta(minutes=m)) for m in range(0, minutes + 1, 30)} | {_stamp(now)}
    try:
        return sum(int(cache.get(_key(kind, h)) or 0) for h in hours)
    except Exception:  # noqa: BLE001
        return 0


def flush_hours(hours: int = 3) -> int:
    """Write the cached counts of the last few hours into WatchHourly (idempotent: it sets, it does not add)."""
    from .models import WatchHourly

    now = timezone.now().astimezone(dt_timezone.utc).replace(minute=0, second=0, microsecond=0)
    written = 0
    for back in range(hours):
        hour = now - timedelta(hours=back)
        values = {kind: int(cache.get(_key(kind, _stamp(hour))) or 0) for kind in KINDS}
        if not any(values.values()):
            continue
        WatchHourly.objects.update_or_create(hour=hour, defaults=values)
        written += 1
    return written

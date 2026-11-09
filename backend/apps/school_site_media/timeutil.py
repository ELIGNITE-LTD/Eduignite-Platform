"""Event timing in Cameroon local time (Africa/Douala, UTC+1, no daylight saving)."""

from datetime import datetime, time, timedelta, timezone as dt_timezone

try:
    from zoneinfo import ZoneInfo
    DOUALA = ZoneInfo('Africa/Douala')
except Exception:  # tzdata missing: Douala is a fixed UTC+1.
    DOUALA = dt_timezone(timedelta(hours=1))


def effective_end(start_at, end_at):
    """The moment an event is over: its end, or the end of its start day in Douala."""
    if end_at:
        return end_at
    local = start_at.astimezone(DOUALA)
    day_end = datetime.combine(local.date(), time(23, 59, 59), tzinfo=DOUALA)
    return day_end.astimezone(dt_timezone.utc)


def classify(start_at, effective_end_at, now):
    if start_at > now:
        return 'upcoming'
    if effective_end_at >= now:
        return 'ongoing'
    return 'past'

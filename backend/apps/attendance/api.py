"""Public read API of the attendance app for other apps (e.g. report cards)."""
from datetime import date
from typing import Optional

from .models import AttendanceRecord, AttendanceSession


def attendance_summary(
    student,
    start: Optional[date] = None,
    end: Optional[date] = None,
    daily_only: bool = False,
) -> dict:
    """Counts of a learner's attendance records, optionally within a date range.

    ``daily_only`` restricts to the daily class register (Basic Education), where
    one record is one school day. Without it every session type is counted, which
    is the historical behaviour for period/subject attendance.
    """
    records = AttendanceRecord.objects.filter(student=student)
    if daily_only:
        records = records.filter(session__session_type=AttendanceSession.TYPE_DAILY)
    if start:
        records = records.filter(session__date__gte=start)
    if end:
        records = records.filter(session__date__lte=end)
    return {
        'present': records.filter(status='present').count(),
        'absent': records.filter(status='absent').count(),
        'excused': records.filter(status='excused').count(),
        'late': records.filter(status='late').count(),
    }


# Aggregates for read-only oversight (apps.proprietors) -----------------------

ATTENDED_STATUSES = ('present', 'late')


def attendance_by_school(school_ids, start: date, end: date) -> dict:
    """``{school_id: {'records', 'attended'}}`` for sessions dated start..end, in ONE query.

    A pupil counts as having attended when marked present or late. Every session
    type is included (daily class register and per-period sessions alike).
    """
    from django.db.models import Count, Q

    rows = (
        AttendanceRecord.objects
        .filter(session__school_id__in=list(school_ids), session__date__gte=start, session__date__lte=end)
        .order_by()
        .values('session__school_id')
        .annotate(records=Count('id'), attended=Count('id', filter=Q(status__in=ATTENDED_STATUSES)))
    )
    result = {sid: {'records': 0, 'attended': 0} for sid in school_ids}
    for row in rows:
        result[row['session__school_id']] = {'records': row['records'], 'attended': row['attended']}
    return result


def attendance_trend(school_id, start: date, end: date) -> list:
    """Per-day ``[{'date', 'records', 'attended'}]`` for one school, in ONE query."""
    from django.db.models import Count, Q

    rows = (
        AttendanceRecord.objects
        .filter(session__school_id=school_id, session__date__gte=start, session__date__lte=end)
        .order_by('session__date')
        .values('session__date')
        .annotate(records=Count('id'), attended=Count('id', filter=Q(status__in=ATTENDED_STATUSES)))
    )
    return [
        {'date': row['session__date'].isoformat(), 'records': row['records'], 'attended': row['attended']}
        for row in rows
    ]

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

import json
import re
from decimal import Decimal
from typing import Any

from django.db.models import Avg

from apps.attendance.models import AttendanceRecord
from apps.grades.models import Grade


def extract_json_payload(raw_response: str) -> dict[str, Any]:
    """Return the first JSON object from a model response."""
    if not raw_response:
        raise ValueError('AI returned an empty response.')

    cleaned = raw_response.strip()
    cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*```$', '', cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', cleaned, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def decimal_to_float(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)
    if value is None:
        return 0.0
    return float(value)


def get_student_grade_summary(student, sequence=None) -> list[dict[str, Any]]:
    grades = Grade.objects.select_related('subject', 'sequence').filter(student=student)
    if sequence:
        grades = grades.filter(sequence=sequence)

    rows = []
    for grade in grades.order_by('subject__name'):
        class_average = Grade.objects.filter(
            school=student.school,
            subject=grade.subject,
            sequence=grade.sequence,
            student__school_class=student.school_class,
        ).aggregate(avg=Avg('score'))['avg']
        rows.append({
            'subject': grade.subject.name if grade.subject else 'Unknown Subject',
            'score': decimal_to_float(grade.score),
            'class_average': decimal_to_float(class_average),
            'sequence': grade.sequence.name if grade.sequence else '',
            'comment': grade.comment or '',
        })
    return rows


def get_attendance_rate(student) -> float:
    records = AttendanceRecord.objects.filter(student=student)
    total = records.count()
    if total == 0:
        return 100.0
    present = records.filter(status='present').count()
    return round((present / total) * 100, 2)


def student_display_name(student) -> str:
    user = getattr(student, 'user', None)
    if not user:
        return str(student)
    return user.get_full_name() or getattr(user, 'email', '') or str(student)


def class_display_name(student) -> str:
    return (
        getattr(getattr(student, 'school_class', None), 'name', None)
        or getattr(student, 'student_class', None)
        or 'Unassigned Class'
    )

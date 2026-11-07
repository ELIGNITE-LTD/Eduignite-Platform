"""Attendance history reports: who may see which records, and what the report says.

Two kinds of report share this module:

* the school-wide report, for principals and vice principals, filtered by
  academic year, term, sub-school, class and date range; and
* the subject report, for a teacher, over the subjects and classes they are
  assigned to and the sessions they recorded.

Terms come from the school's own calendar: the grade sequences
(``grades.Sequence``) carry the dates, two sequences to a term in the
Cameroonian system, so a term runs from the first start to the last end.

Everything here is scoped on the server. A teacher asking for another
teacher's class, or a principal for another school, gets nothing, whatever
ids the request carries. The app turns the result into the PDF.
"""

from __future__ import annotations

import uuid
from datetime import date

from django.db.models import Max, Min, Q
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.platform.access import filter_student_related_by_platform_access

from .models import AttendanceRecord

ADMIN_ROLES = ('SCHOOL_ADMIN', 'SUB_ADMIN')
TERM_LABELS = {1: 'First Term', 2: 'Second Term', 3: 'Third Term'}
STATUSES = ('present', 'absent', 'late', 'excused')
# A report longer than this is not a document anyone can print; ask for a narrower one.
MAX_RECORDS = 20000


def _uuid_or_none(value, field):
    if value in (None, '', 'all'):
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise ValidationError({field: 'Invalid value.'})


def _date_or_none(value, field):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValidationError({field: 'Use the format YYYY-MM-DD.'})


def _managed_sub_school_ids(user):
    from apps.schools.scoping import managed_sub_school_ids

    return managed_sub_school_ids(user)


def _teacher_assignments(user):
    """(class, subject) pairs this teacher is assigned to."""
    from apps.grades.models import ClassSubject

    return list(
        ClassSubject.objects.filter(teacher=user, school_class__school_id=user.school_id)
        .select_related('school_class', 'subject')
        .order_by('school_class__name', 'subject__name')
    )


# ── Calendar ────────────────────────────────────────────────────────────────

def school_calendar(school):
    """Academic years with their terms and dates, newest year first."""
    from apps.grades.models import Sequence

    rows = (
        Sequence.objects.filter(school=school)
        .values('academic_year', 'term')
        .annotate(start=Min('start_date'), end=Max('end_date'))
        .order_by('-academic_year', 'term')
    )
    years = {}
    for row in rows:
        year = years.setdefault(row['academic_year'], {'academic_year': row['academic_year'], 'terms': []})
        year['terms'].append({
            'term': row['term'],
            'label': TERM_LABELS.get(row['term'], f"Term {row['term']}"),
            'start_date': row['start'].isoformat(),
            'end_date': row['end'].isoformat(),
        })
    for year in years.values():
        year['start_date'] = min(t['start_date'] for t in year['terms'])
        year['end_date'] = max(t['end_date'] for t in year['terms'])
    return list(years.values())


def _period_window(school, academic_year, term):
    """The dates an academic year (and optionally one term) covers."""
    if not academic_year:
        if term:
            raise ValidationError({'academic_year': 'Choose the academic year of the term.'})
        return None, None, ''
    year = next((y for y in school_calendar(school) if y['academic_year'] == academic_year), None)
    if year is None:
        raise ValidationError({'academic_year': 'This academic year has no calendar in your school.'})
    if term:
        try:
            term_number = int(term)
        except ValueError:
            raise ValidationError({'term': 'Invalid term.'})
        found = next((t for t in year['terms'] if t['term'] == term_number), None)
        if found is None:
            raise ValidationError({'term': 'This term has no dates in your school calendar.'})
        return date.fromisoformat(found['start_date']), date.fromisoformat(found['end_date']), found['label']
    return date.fromisoformat(year['start_date']), date.fromisoformat(year['end_date']), ''


# ── Options for the filter panel ────────────────────────────────────────────

def report_options(user):
    from apps.schools.models import SchoolClass, SubSchool

    school = user.school
    if user.role in ADMIN_ROLES:
        managed = _managed_sub_school_ids(user)
        classes = SchoolClass.objects.filter(school=school).select_related('sub_school')
        sub_schools = SubSchool.objects.filter(school=school)
        if managed is not None:
            classes = classes.filter(sub_school_id__in=managed)
            sub_schools = sub_schools.filter(id__in=managed)
        return {
            'kind': 'school',
            'calendar': school_calendar(school),
            'classes': [
                {'id': str(c.id), 'name': c.name, 'sub_school_id': str(c.sub_school_id) if c.sub_school_id else None}
                for c in classes.order_by('name')
            ],
            'sub_schools': [{'id': str(s.id), 'name': s.name} for s in sub_schools.order_by('name')],
        }
    if user.role == 'TEACHER':
        assignments = _teacher_assignments(user)
        from .class_access import teacher_class_ids

        return {
            'kind': 'subject',
            'calendar': school_calendar(school),
            # Classes whose daily register (basic education) this teacher may report on.
            'daily_classes': [
                {'class_id': str(c.id), 'class_name': c.name}
                for c in SchoolClass.objects.filter(id__in=teacher_class_ids(user)).order_by('name')
            ],
            'assignments': [
                {
                    'class_id': str(a.school_class_id),
                    'class_name': a.school_class.name,
                    'subject_id': str(a.subject_id),
                    'subject_name': a.subject.name,
                }
                for a in assignments
            ],
        }
    raise PermissionDenied('Only school administrators and teachers can download attendance history.')


# ── The report ──────────────────────────────────────────────────────────────

def _school_branding(school):
    parts = []
    for part in (school.address, school.city_village, school.division):
        part = (part or '').strip()
        if part and part.lower() not in {p.lower() for p in parts}:
            parts.append(part)
    return {
        'name': school.name,
        'motto': school.motto or '',
        'logo': school.logo or '',
        'principal': school.principal or '',
        'address': ', '.join(parts) or (school.location or ''),
        'phone': school.phone or '',
        'email': school.email or '',
    }


def build_report(user, params):
    """Resolve the filters, scope the records to this user, and summarise them."""
    from apps.schools.models import SchoolClass, SubSchool
    from apps.students import api as students_api

    if user.role not in ADMIN_ROLES and user.role != 'TEACHER':
        raise PermissionDenied('Only school administrators and teachers can download attendance history.')
    school = user.school
    if school is None:
        raise PermissionDenied('Your account is not linked to a school.')

    academic_year = (params.get('academic_year') or '').strip()
    term = (params.get('term') or '').strip()
    class_id = _uuid_or_none(params.get('class_id'), 'class_id')
    sub_school_id = _uuid_or_none(params.get('sub_school'), 'sub_school')
    subject_id = _uuid_or_none(params.get('subject'), 'subject')
    start = _date_or_none(params.get('start_date'), 'start_date')
    end = _date_or_none(params.get('end_date'), 'end_date')

    window_start, window_end, term_label = _period_window(school, academic_year, term)
    # A chosen date range narrows the term; it can never reach outside it.
    if window_start:
        if (start and start > window_end) or (end and end < window_start):
            raise ValidationError({'start_date': 'The date range falls outside the selected term.'})
        start = max(start, window_start) if start else window_start
        end = min(end, window_end) if end else window_end
    if not start or not end:
        raise ValidationError({'start_date': 'Choose an academic year and term, or a start and end date.'})
    if start > end:
        raise ValidationError({'end_date': 'The end date is before the start date.'})

    records = filter_student_related_by_platform_access(
        AttendanceRecord.objects.filter(
            session__school=school,
            session__date__gte=start,
            session__date__lte=end,
        )
    )
    classes = SchoolClass.objects.filter(school=school)
    filters = {}

    if user.role in ADMIN_ROLES:
        kind = 'school'
        managed = _managed_sub_school_ids(user)
        if managed is not None:
            records = records.filter(session__school_class__sub_school_id__in=managed)
            classes = classes.filter(sub_school_id__in=managed)
        if sub_school_id:
            if managed is not None and sub_school_id not in managed:
                raise PermissionDenied('You can only report on your own sections.')
            sub_school = SubSchool.objects.filter(id=sub_school_id, school=school).first()
            if sub_school is None:
                raise ValidationError({'sub_school': 'Unknown section.'})
            records = records.filter(session__school_class__sub_school_id=sub_school_id)
            classes = classes.filter(sub_school_id=sub_school_id)
            filters['sub_school'] = sub_school.name
        if class_id:
            school_class = classes.filter(id=class_id).first()
            if school_class is None:
                raise PermissionDenied('That class is not in your school or section.')
            records = records.filter(session__school_class_id=class_id)
            classes = classes.filter(id=class_id)
            filters['class'] = school_class.name
        if subject_id:
            records = records.filter(session__subject_id=subject_id)
    else:
        kind = 'subject'
        assignments = _teacher_assignments(user)
        pairs = {(a.school_class_id, a.subject_id): a for a in assignments}
        # Daily registers (basic education) have no subject: a teacher sees those
        # of the classes they are responsible for, unless a subject is asked for.
        from .class_access import teacher_class_ids
        from apps.schools.models import SchoolClass as _SchoolClass

        daily_class_ids = teacher_class_ids(user)
        if subject_id and not any(s == subject_id for (_c, s) in pairs):
            raise PermissionDenied('You are not assigned to that subject.')
        if class_id and not (any(c == class_id for (c, _s) in pairs) or class_id in daily_class_ids):
            raise PermissionDenied('You are not assigned to that class.')
        allowed = [
            (c, s) for (c, s) in pairs
            if (not class_id or c == class_id) and (not subject_id or s == subject_id)
        ]
        daily_ids = set() if subject_id else {c for c in daily_class_ids if not class_id or c == class_id}
        if not allowed and not daily_ids:
            raise PermissionDenied('You are not assigned to that subject in that class.')
        match = Q()
        for c, s in allowed:
            match |= Q(session__school_class_id=c, session__subject_id=s)
        # Only sessions this teacher recorded, in classes and subjects they teach...
        scoped = Q(session__teacher=user) & match if allowed else Q(pk__in=[])
        # ...plus the daily registers of the classes they are responsible for.
        if daily_ids:
            scoped |= Q(session__session_type='daily', session__school_class_id__in=daily_ids)
        records = records.filter(scoped)
        classes = classes.filter(id__in={c for c, _s in allowed} | daily_ids)
        subject_names = sorted({pairs[p].subject.name for p in allowed})
        class_names = sorted(
            {pairs[p].school_class.name for p in allowed}
            | set(_SchoolClass.objects.filter(id__in=daily_ids).values_list('name', flat=True))
        )
        filters['subject'] = ', '.join(subject_names)
        filters['class'] = ', '.join(class_names)

    records = records.select_related(
        'student__user', 'student__school_class', 'session__school_class', 'session__subject',
    ).order_by('session__date', 'session__student_class', 'session__period', 'student__user__name')

    total = records.count()
    if total > MAX_RECORDS:
        raise ValidationError({
            'detail': f'This report would have {total} records. Narrow the dates or choose a class.',
        })

    rows = []
    counts = dict.fromkeys(STATUSES, 0)
    students = set()
    sessions = set()
    for record in records:
        session = record.session
        counts[record.status] = counts.get(record.status, 0) + 1
        students.add(record.student_id)
        sessions.add(session.id)
        rows.append({
            'date': session.date.isoformat(),
            'class_name': session.school_class.name if session.school_class_id else session.student_class,
            'subject': session.subject.name if session.subject_id else '',
            'period': session.get_period_display(),
            'student_name': record.student.display_name,
            'admission_number': record.student.admission_number,
            'status': record.get_status_display(),
            'remarks': (record.excuse_note or '').strip(),
        })

    # Students on the roll of the classes in scope, today: the "expected".
    enrolled = students_api.list_students(school=school).filter(school_class__in=classes)
    attended = counts['present'] + counts['late']
    return {
        'kind': kind,
        'school': _school_branding(school),
        'teacher_name': user.get_full_name() if kind == 'subject' else '',
        'filters': {
            'academic_year': academic_year,
            'term': term_label,
            'start_date': start.isoformat(),
            'end_date': end.isoformat(),
            **filters,
        },
        'summary': {
            'students_on_roll': enrolled.count(),
            'students_recorded': len(students),
            'sessions': len(sessions),
            'records': total,
            'present': counts['present'],
            'absent': counts['absent'],
            'late': counts['late'],
            'excused': counts['excused'],
            # Present and late both count as attended, as everywhere else in EduIgnite.
            'attendance_rate': round(attended / total * 100, 1) if total else None,
        },
        'rows': rows,
    }

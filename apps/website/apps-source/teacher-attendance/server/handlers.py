"""Teacher Attendance — server handlers.

Runs inside the EduIgnite app runtime. Everything reaches data through ``ctx``:
there is no ORM here, no database connection and no network. ``ctx.data`` is
already scoped to this app and this school, so nothing below has to remember to
filter by either — it cannot reach another school's rows even by mistake.

Handlers take ``(ctx, request)`` and return plain data.
"""

STAFF_ROLES = ['TEACHER', 'SCHOOL_ADMIN', 'SUB_ADMIN']

VALID_STATUSES = ['present', 'absent', 'late', 'excused']


def _today(request):
    """The date being worked on, defaulting to whatever the client sent."""
    value = request.get('date')
    if value:
        return str(value)[:10]
    return ''


def _existing_for_day(ctx, date):
    """Every record already stored for this date, keyed by teacher id."""
    rows = ctx.data.collection('clock_events').query(
        where={'date': date},
        limit=500,
    )
    return {str(row.get('teacher')): row for row in rows}


def register_for_day(ctx, request):
    """The full staff list for a date, with whatever has been marked so far.

    Returns every member of staff rather than only those already marked, so the
    register opens as a complete list to work down rather than an empty page.
    """
    date = _today(request)
    if not date:
        return {'error': 'A date is required.'}

    staff = ctx.core.staff(roles=STAFF_ROLES)
    marked = _existing_for_day(ctx, date)

    entries = []
    for person in staff:
        person_id = str(person.get('id'))
        record = marked.get(person_id)
        entries.append({
            'teacher': person_id,
            'name': person.get('name') or '',
            'role': person.get('role') or '',
            'status': record.get('status') if record else '',
            'minutes_late': record.get('minutes_late') if record else 0,
            'record_id': record.get('id') if record else '',
        })

    entries.sort(key=lambda entry: entry['name'].lower())
    return {
        'date': date,
        'entries': entries,
        'marked': len(marked),
        'total': len(entries),
    }


def mark(ctx, request):
    """Record or change one member of staff's attendance for a date.

    Updates in place when there is already a record for that person on that
    day, so marking twice corrects the entry rather than producing two.
    """
    date = _today(request)
    teacher = str(request.get('teacher') or '')
    status = str(request.get('status') or '')

    if not date:
        return {'error': 'A date is required.'}
    if not teacher:
        return {'error': 'A member of staff is required.'}
    if status not in VALID_STATUSES:
        return {'error': 'Choose present, absent, late or excused.'}

    minutes_late = 0
    if status == 'late':
        try:
            minutes_late = max(int(request.get('minutes_late') or 0), 0)
        except (TypeError, ValueError):
            minutes_late = 0

    # The name is stored alongside the reference so a report still reads
    # correctly after someone leaves the school and their account is removed.
    name = ''
    for person in ctx.core.staff(roles=STAFF_ROLES):
        if str(person.get('id')) == teacher:
            name = person.get('name') or ''
            break

    values = {
        'teacher': teacher,
        'teacher_name': name,
        'date': date,
        'status': status,
        'minutes_late': minutes_late,
        'note': str(request.get('note') or '')[:500],
    }

    existing = _existing_for_day(ctx, date).get(teacher)
    if existing:
        updated = ctx.data.collection('clock_events').update(existing.get('id'), values)
        return {'saved': True, 'record': updated}

    created = ctx.data.collection('clock_events').insert(values)
    return {'saved': True, 'record': created}


def monthly_summary(ctx, request):
    """Per-teacher totals for a month, for the administrator.

    ``month`` is ``YYYY-MM``. Counting happens here rather than in the client so
    a slow connection moves one small summary instead of every record.
    """
    month = str(request.get('month') or '')[:7]
    if len(month) != 7 or '-' not in month:
        return {'error': 'A month like 2026-03 is required.'}

    rows = ctx.data.collection('clock_events').query(
        where={'date__startswith': month},
        order_by='date',
        limit=500,
    )

    totals = {}
    for row in rows:
        teacher = str(row.get('teacher'))
        entry = totals.get(teacher)
        if entry is None:
            entry = {
                'teacher': teacher,
                'name': row.get('teacher_name') or '',
                'present': 0,
                'absent': 0,
                'late': 0,
                'excused': 0,
                'minutes_late': 0,
            }
            totals[teacher] = entry

        status = row.get('status')
        if status in VALID_STATUSES:
            entry[status] = entry[status] + 1
        if status == 'late':
            entry['minutes_late'] = entry['minutes_late'] + int(row.get('minutes_late') or 0)

    summary = list(totals.values())
    summary.sort(key=lambda item: item['name'].lower())

    return {
        'month': month,
        'staff': summary,
        'records': len(rows),
        # A full window means there may be more; the client says so rather
        # than quietly showing a partial month as if it were complete.
        'truncated': len(rows) >= 500,
    }

"""Front Desk — server handlers.

A visitor sign-in book. Runs inside the EduIgnite app runtime: everything
reaches data through ``ctx``, already scoped to this app and this school.

Time is stamped here, not sent by the client, so a signed-in or signed-out
time is trustworthy — a reception book whose times can be edited by the browser
is not much of a record.
"""

import datetime

PURPOSES = ['parent', 'official', 'supplier', 'interview', 'other']


def _now_iso():
    return datetime.datetime.now().replace(microsecond=0).isoformat()


def _today():
    return datetime.date.today().isoformat()


def _sorted_for_day(rows):
    """Open visits first (nobody signed out), then by time in, newest first."""
    def key(row):
        open_first = 0 if not row.get('time_out') else 1
        return (open_first, row.get('time_in') or '')

    return sorted(rows, key=key, reverse=False)


def todays_visits(ctx, request):
    """Everyone in the building today, still-present first."""
    rows = ctx.data.collection('visits').query(where={'date': _today()}, limit=500)
    return {'date': _today(), 'visits': _sorted_for_day(rows), 'total': len(rows)}


def visits_for_date(ctx, request):
    """The log for one day. ``date`` is YYYY-MM-DD, defaulting to today."""
    date = str(request.get('date') or '')[:10] or _today()
    rows = ctx.data.collection('visits').query(where={'date': date}, limit=500)
    return {'date': date, 'visits': _sorted_for_day(rows), 'total': len(rows)}


def sign_in(ctx, request):
    """Record a visitor arriving. The time is stamped on the server."""
    name = str(request.get('visitor_name') or '').strip()
    purpose = str(request.get('purpose') or '').strip()

    if not name:
        return {'error': 'A visitor name is required.'}
    if purpose not in PURPOSES:
        return {'error': 'Choose why they are visiting.'}

    # ctx.user is set by the runtime; it may be None for a scheduled job, but a
    # sign-in always comes from a signed-in person. Attributes are read
    # directly — getattr() is refused by the app checks, because a dynamic
    # attribute name is a way to reach past the SDK.
    who = ctx.user
    signed_in_by = who.id if who is not None else ''
    signed_in_by_name = (who.name if who is not None else '') or ''

    record = ctx.data.collection('visits').insert({
        'visitor_name': name[:200],
        'phone': str(request.get('phone') or '')[:40],
        'purpose': purpose,
        'visiting': str(request.get('visiting') or '')[:200],
        'date': _today(),
        'time_in': _now_iso(),
        'signed_in_by': str(signed_in_by) if signed_in_by else '',
        'signed_in_by_name': signed_in_by_name,
    })
    return {'saved': True, 'visit': record}


def sign_out(ctx, request):
    """Mark a visitor leaving. Refuses if they are already signed out, so the
    first recorded departure time is the one that stands."""
    visit_id = str(request.get('id') or '')
    if not visit_id:
        return {'error': 'Which visit is signing out?'}

    existing = ctx.data.collection('visits').get(visit_id)
    if existing is None:
        return {'error': 'That visit was not found.'}
    if existing.get('time_out'):
        return {'error': 'That visitor is already signed out.'}

    updated = ctx.data.collection('visits').update(visit_id, {'time_out': _now_iso()})
    return {'saved': True, 'visit': updated}

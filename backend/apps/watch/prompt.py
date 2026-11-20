"""A ready-to-paste briefing for Claude: what went wrong, the evidence, the most likely root cause and where to look.

Built only from what the watch already stores (already scrubbed of passwords, tokens and personal data)."""

from django.utils import timezone

# Where in the repository to start looking, by kind of problem.
_WHERE_TO_LOOK = {
    'server': 'backend/apps/<app named in "where"> (the view, serializer or service on the failing line), backend/core/exceptions.py, and the route in that app\'s urls.py.',
    'client': 'apps/website/src (the page or component for the route below), then the same file in apps/mobile/src and apps/desktop/src, and apps/website/src/lib/api for the call that fails.',
    'security': 'backend/apps/authentication/views.py (MatriculeLoginView), backend/apps/watch/security.py (the thresholds), and the school or account named below.',
    'health': 'backend/apps/watch/checks.py (the check that fails), then the service it tests (database, cache, disk, Celery/Redis) and the server configuration.',
    'payments': 'backend/apps/fees (fapshi_views.py, webhooks), the payment provider status, and recent failed payment records.',
    'ai': 'backend/apps/ai_features (credit_engine.py, provider calls) and backend/apps/ai_marking; the provider API key, quota and model name.',
    'email': 'backend/core/email_service.py (send_transactional_email), the email provider settings and the sender domain.',
    'jobs': 'backend/config/celery.py (beat schedule), the failing task\'s module, and whether the Celery worker and beat processes are running.',
    'traffic': 'the slow route\'s view and its database queries (look for N+1 queries, missing indexes, heavy PDF or AI work done inside the request).',
}

# What usually causes it, so the first hypothesis is not a blank page.
_LIKELY_CAUSES = {
    'server': [
        'An unhandled exception in the code at "where": a None or missing value, a wrong type, a missing related record, or a database constraint.',
        'A recent deploy that changed this code path, or a migration not applied.',
        'Data that the code did not expect (an empty class, a student without a programme, an unusual school category).',
    ],
    'client': [
        'A screen reads a field that is missing or null in the API response (check the route and the stack).',
        'The website was updated while the device still held the old files (a "chunk load" error), or the mobile/desktop app is behind the backend.',
        'The device is on a very old browser, or the connection dropped mid-request.',
    ],
    'security': [
        'Someone guessing passwords or matricules (many failures from one address or against many accounts), or a real user who forgot a password.',
        'A script or a bad integration hammering the login endpoint.',
    ],
    'health': [
        'The service named in the check is down, full or slow (disk space, database connections, cache or the job runner stopped).',
        'The server needs a restart or more resources.',
    ],
    'payments': ['The payment provider is failing or slow, a webhook is not arriving, or keys/URLs changed.'],
    'ai': ['The AI provider is rejecting calls (key, quota, model name) or is timing out; credits may not be refunded after a failure.'],
    'email': ['The email provider is rejecting messages (credentials, domain verification, rate limit) or addresses are invalid.'],
    'jobs': ['A background task raised an exception, or the worker or scheduler is not running.'],
    'traffic': ['A slow query or heavy work inside the request, or a spike in traffic.'],
}

_ORDER = ('route', 'endpoint', 'method', 'where', 'exception', 'trail', 'app', 'version', 'device', 'kind', 'status', 'role', 'check', 'slowest_seconds')


def build_fix_prompt(i) -> str:
    details = dict(i.details or {})
    out = [
        'You are working on the EduIgnite platform (Django REST backend in backend/, Next.js website in apps/website with mirrored apps/mobile and apps/desktop).',
        'The founders\' System Watch detected the problem below. Find the ROOT CAUSE, fix it properly, and tell me what you found.',
        '',
        f'## Problem: {i.title}',
        f'- What the system saw: {i.message or i.title}',
        f'- Kind: {dict(i.CATEGORIES).get(i.category, i.category)} | Severity: {i.severity} | Reported by: {i.source or "unknown"} | Status: {i.status}',
        f'- How often: {i.count} time(s), affecting {i.affected_users} user(s) in {len(i.affected_schools or [])} school(s)'
        + (f' ({", ".join(s.get("name", "") for s in (i.affected_schools or [])[:5])})' if i.affected_schools else ''),
        f'- First seen {i.first_seen:%Y-%m-%d %H:%M} UTC, last seen {i.last_seen:%Y-%m-%d %H:%M} UTC (report generated {timezone.now():%Y-%m-%d %H:%M} UTC)',
    ]
    shown = [(k, details[k]) for k in _ORDER if details.get(k) not in (None, '', [])]
    shown += [(k, v) for k, v in details.items() if k not in _ORDER and k != 'stack' and v not in (None, '', [])]
    if shown:
        out += ['', '## Evidence']
        out += [f'- {k.replace("_", " ")}: {v}' for k, v in shown]
    if details.get('stack'):
        out += ['', 'Stack (from the device):', '```', str(details['stack']), '```']
    notes = [n for n in (i.notes or []) if n.get('text')]
    if notes:
        out += ['', '## Notes from the team']
        out += [f'- {n.get("by", "")}: {n["text"]}' for n in notes[-5:]]
    out += ['', '## Most likely root cause (hypotheses to verify, not conclusions)']
    out += [f'- {c}' for c in _LIKELY_CAUSES.get(i.category, ['Unknown: start from the evidence above.'])]
    out += ['', '## Where to start looking', f'- {_WHERE_TO_LOOK.get(i.category, "Search the repository for the route or message above.")}']
    out += [
        '',
        '## What to do',
        '1. Read the code at the place above and reproduce the problem (a failing test is best). Do not guess: confirm the root cause.',
        '2. Fix the cause, not just the symptom, with the smallest safe change. Keep migrations additive.',
        '3. Add or update a test that fails before the fix and passes after it. If the same screen exists in apps/mobile and apps/desktop, mirror the change.',
        '4. Do not run destructive actions on live data. Open a pull request and wait for the required checks.',
        '5. Finish by telling me the root cause in plain words, what you changed, and how to confirm on the live site that it is fixed.',
    ]
    return '\n'.join(out)

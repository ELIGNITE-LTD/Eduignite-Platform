"""Sensors that watch the live system: unhandled server errors and slow requests."""

from __future__ import annotations

import os
import traceback

from . import recorder
from .sanitize import clean_text, normalise_route

#: A failure on these paths is urgent on its first occurrence: people cannot sign in or pay.
URGENT_ROUTES = ('/auth/login', '/auth/activate', '/fapshi/', '/webhook', '/payments/', '/fees/pay')


def _where(exc) -> tuple[str, str]:
    """(file:line of the failing project code, readable frames) from the traceback, without any variable values."""
    frames = traceback.extract_tb(getattr(exc, '__traceback__', None))
    project = [f for f in frames if '/apps/' in f.filename or '/core/' in f.filename] or list(frames)
    if not project:
        return '', ''
    last = project[-1]
    where = f'{os.path.basename(os.path.dirname(last.filename))}/{os.path.basename(last.filename)}:{last.lineno}'
    trail = ' → '.join(f'{os.path.basename(f.filename)}:{f.lineno} {f.name}' for f in project[-5:])
    return where, trail


def server_error(request, exc) -> None:
    """Record an unhandled exception. ``request`` may be a Django or a DRF request. Never raises."""
    try:
        raw = getattr(request, '_request', request)
        match = getattr(raw, 'resolver_match', None)
        route = normalise_route(getattr(match, 'route', '') and '/' + str(match.route).lstrip('^/') or getattr(raw, 'path', ''))
        user = getattr(request, 'user', None)
        user = user if getattr(user, 'is_authenticated', False) else None
        where, trail = _where(exc)
        urgent = any(part in (getattr(raw, 'path', '') or '') for part in URGENT_ROUTES)
        name = type(exc).__name__
        recorder.record(
            'server', f'Server error {name} on {route or "an endpoint"}'[:200], severity='critical' if urgent else 'warning',
            message=f'{name}: {clean_text(exc, 300)}', source='api',
            fingerprint=recorder.fingerprint_of('500', name, route, where), user=user,
            details={'route': route, 'method': getattr(raw, 'method', ''), 'exception': f'{name}: {clean_text(exc, 200)}', 'where': where, 'trail': trail,
                     'role': getattr(user, 'role', '')},
            escalate_after=(5, 60, 3, 2),
        )
    except Exception:  # noqa: BLE001
        pass


def slow_request(request, seconds: float) -> None:
    try:
        route = normalise_route(getattr(request, 'path', ''))
        user = getattr(request, 'user', None)
        user = user if getattr(user, 'is_authenticated', False) else None
        recorder.record(
            'traffic', f'Slow endpoint {route}'[:200], severity='warning', source='api',
            message=f'A request took {seconds:.1f} seconds.', fingerprint=recorder.fingerprint_of('slow', request.method, route), user=user,
            details={'route': route, 'method': request.method, 'slowest_seconds': round(seconds, 1)}, escalate_after=(10, 10, 0, 0),
        )
    except Exception:  # noqa: BLE001
        pass

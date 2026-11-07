"""Runtime integration config: DB-first (CEO/CTO-editable), env fallback.

The AI and email layers call these instead of reading settings directly, so a
founder can rotate the Gemini/Brevo keys from the dashboard and have it take
effect immediately, with the environment value as the baseline.
"""

import time

from django.conf import settings

_CACHE = {'at': 0.0, 'gemini_api_key': None, 'gemini_model': None, 'brevo_api_key': None}
_TTL = 20  # seconds — fresh enough to reflect a dashboard change almost at once


def _row():
    try:
        from .models import IntegrationSecrets
        return IntegrationSecrets.load()
    except Exception:
        return None


def _refresh():
    row = _row()
    _CACHE['gemini_api_key'] = (getattr(row, 'gemini_api_key', '') or '').strip()
    _CACHE['gemini_model'] = (getattr(row, 'gemini_model', '') or '').strip()
    _CACHE['brevo_api_key'] = (getattr(row, 'brevo_api_key', '') or '').strip()
    _CACHE['at'] = time.time()


def _cached(field):
    if time.time() - _CACHE['at'] > _TTL or _CACHE[field] is None:
        _refresh()
    return _CACHE[field]


def gemini_api_key() -> str:
    return _cached('gemini_api_key') or getattr(settings, 'GEMINI_API_KEY', '') or ''


def gemini_model() -> str:
    return _cached('gemini_model') or getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-flash') or 'gemini-2.5-flash'


def brevo_api_key() -> str:
    return _cached('brevo_api_key') or getattr(settings, 'BREVO_API_KEY', '') or ''


def invalidate():
    _CACHE['at'] = 0.0

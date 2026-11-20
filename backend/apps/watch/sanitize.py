"""Anything stored about a problem is scrubbed first: monitoring must never keep a password, a token or a card number."""

from __future__ import annotations

import re

_SECRET_KEYS = re.compile(r'pass(word)?|secret|token|authorization|cookie|api[_-]?key|otp|pin|card|cvv|signature', re.I)
_BEARER = re.compile(r'(?i)\bbearer\s+[A-Za-z0-9._\-]+')
_JWT = re.compile(r'\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}')
_LONG_DIGITS = re.compile(r'\b\d{13,19}\b')
_EMAIL = re.compile(r'([A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]*@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})')
_UUID = re.compile(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
_NUMBER = re.compile(r'(?<![A-Za-z])\d{2,}')


def clean_text(value, limit: int = 600) -> str:
    text = str(value or '')
    text = _BEARER.sub('Bearer [removed]', text)
    text = _JWT.sub('[token removed]', text)
    text = _LONG_DIGITS.sub('[number removed]', text)
    text = _EMAIL.sub(lambda m: f'{m.group(1)}***@{m.group(2)}', text)
    return text[:limit]


def clean_details(value, depth: int = 0):
    """A JSON-safe copy with secret-looking keys blanked and every string scrubbed and shortened."""
    if depth > 4:
        return '…'
    if isinstance(value, dict):
        return {str(k)[:60]: ('[removed]' if _SECRET_KEYS.search(str(k)) else clean_details(v, depth + 1)) for k, v in list(value.items())[:40]}
    if isinstance(value, (list, tuple)):
        return [clean_details(v, depth + 1) for v in list(value)[:30]]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return clean_text(value, 800)


def normalise_route(path: str) -> str:
    """/schools/3f2…/students/17/ -> /schools/:id/students/:n/, so one route is one problem, not thousands."""
    path = str(path or '').split('?')[0]
    path = _UUID.sub(':id', path)
    return _NUMBER.sub(':n', path)[:200]

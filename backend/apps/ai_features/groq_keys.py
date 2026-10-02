"""Every Groq key the server has, used together.

Groq limits each account by tokens (and requests) per minute and per day, per
model. One busy or exhausted key must not stop the AI, so every key the
server knows is kept in one pool:

  * GROQ_API_KEY, GROQ_FAST_API_KEY, GROQ_EXAM_API_KEY, GROQ_CAREER_API_KEY
    (the keys each feature prefers);
  * GROQ_API_KEYS, a comma-separated list of extra keys;
  * GROQ_API_KEY_2 ... GROQ_API_KEY_20, one extra key each, so a key can be
    added (or removed) without rewriting the list.

When Groq answers "rate limit" for a key and model, that pair rests for as
long as Groq says (or a minute) and the next key is used. Keys only add
capacity when they belong to different Groq accounts or organisations: keys
of one account share its limits.

Keys are never logged or stored; the cache records only a short fingerprint.
"""

from __future__ import annotations

import hashlib
import re

from django.conf import settings
from django.core.cache import cache

NAMED_KEYS = ('GROQ_API_KEY', 'GROQ_FAST_API_KEY', 'GROQ_EXAM_API_KEY', 'GROQ_CAREER_API_KEY')
MAX_NUMBERED_KEYS = 20
#: How long a key rests when Groq does not say.
DEFAULT_REST_SECONDS = 60
#: The longest a key rests before it is tried again (daily limits included).
MAX_REST_SECONDS = 30 * 60

_RETRY_IN = re.compile(r'try again in\s+(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?', re.IGNORECASE)


def fingerprint(key: str) -> str:
    return hashlib.sha256((key or '').encode()).hexdigest()[:12]


def _extra_keys():
    import os

    extra = getattr(settings, 'GROQ_API_KEYS', None) or []
    if isinstance(extra, str):
        extra = [part.strip() for part in extra.split(',')]
    numbered = []
    for index in range(2, MAX_NUMBERED_KEYS + 1):
        name = f'GROQ_API_KEY_{index}'
        value = getattr(settings, name, None) or os.environ.get(name, '')
        if value:
            numbered.append(value.strip())
    return list(extra) + numbered


def all_keys() -> list[str]:
    """Every distinct key, the named ones first."""
    keys = []
    for value in [getattr(settings, name, '') for name in NAMED_KEYS] + _extra_keys():
        value = (value or '').strip()
        if value and value not in keys:
            keys.append(value)
    return keys


def _rest_key(key: str, model: str) -> str:
    return f'ai:groq:rest:{fingerprint(key)}:{model or "-"}'


def is_resting(key: str, model: str) -> bool:
    return bool(cache.get(_rest_key(key, model)))


def rest(key: str, model: str, error_text: str = ''):
    """Let this key rest for this model, as long as Groq asked."""
    seconds = DEFAULT_REST_SECONDS
    found = _RETRY_IN.search(error_text or '')
    if found and any(found.groups()):
        hours, minutes, secs = found.groups()
        seconds = int(hours or 0) * 3600 + int(minutes or 0) * 60 + float(secs or 0)
    seconds = max(5, min(int(seconds) + 1, MAX_REST_SECONDS))
    cache.set(_rest_key(key, model), True, seconds)


def ordered(preferred: str | None, model: str) -> list[str]:
    """The keys to try for this model: the preferred one, then the rest, rested ones last."""
    keys = all_keys()
    if preferred:
        keys = [preferred] + [key for key in keys if key != preferred]
    ready = [key for key in keys if not is_resting(key, model)]
    resting = [key for key in keys if key not in ready]
    return ready + resting


def is_rate_limited(error) -> bool:
    """A refusal over a limit (per minute or per day), not a broken request."""
    text = str(error).lower()
    # "Request too large" for the tokens per minute is about this request's
    # size, the same on every key; the caller asks for less instead. The
    # output-per-minute refusal is about recent use, and another key helps.
    if 'request too large' in text and 'output tokens per minute' not in text:
        return False
    return (
        'rate_limit' in text or 'rate limit' in text or 'error code: 429' in text
        or 'tokens per minute' in text or 'tokens per day' in text or 'requests per' in text
    )

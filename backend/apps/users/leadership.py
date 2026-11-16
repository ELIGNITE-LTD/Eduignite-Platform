"""What the EduIgnite AI knows about EduIgnite's leadership: the records the CEO and CTO keep.

The CEO and CTO add, edit and delete ``LeadershipEntry`` rows in the Founders tab; nothing is created
automatically and nothing is pre-filled. ``leadership_prompt()`` renders those records as a short block for the
AI's system prompt, with the rules for using it. Facts only: name, title, department and period.
"""

import logging
from datetime import date

from django.core.cache import cache

from .models import LeadershipEntry

logger = logging.getLogger(__name__)

AI_CACHE_KEY = 'ai:leadership-prompt'
AI_CACHE_SECONDS = 60
MAX_ENTRIES_IN_PROMPT = 40


# --------------------------------------------------------------------------
# The AI's view of the records
# --------------------------------------------------------------------------

def _month_year(value) -> str:
    return value.strftime('%B %Y') if value else ''


def _period(entry) -> str:
    start, end = _month_year(entry.start_date), _month_year(entry.end_date)
    if entry.is_current:
        return f'since {start}' if start else 'current (start date not recorded)'
    if start and end:
        return f'{start} to {end}'
    if start:
        return f'from {start} (end date not recorded)'
    if end:
        return f'until {end} (start date not recorded)'
    return 'dates not recorded'


def _line(entry) -> str:
    place = f', {entry.department}' if entry.department else ''
    note = f' ({entry.note})' if entry.note else ''
    return f'- {entry.person_name}: {entry.title}{place}; {_period(entry)}{note}'


RULES = (
    'Rules for questions about EduIgnite leadership: answer only from these records, never from memory. Give '
    'periods as month and year, in the language the person writes in. If a date is not recorded, say it is not '
    'recorded. If the person is not listed, say you have no record of them instead of guessing. A person with '
    'several entries was promoted or changed position: describe each step in order. Share only name, title, '
    'department and period; never share emails, phone numbers, shares or the reasons anyone left, and do not '
    'speculate about them.'
)


def build_prompt_text() -> str:
    rows = list(LeadershipEntry.objects.all()[: MAX_ENTRIES_IN_PROMPT * 3])
    current = [e for e in rows if e.is_current]
    former = [e for e in rows if not e.is_current]
    former.sort(key=lambda e: (e.end_date or date.min, e.start_date or date.min), reverse=True)
    if not current and not former:
        return ''
    lines = ['EDUIGNITE LEADERSHIP (authoritative company records):']
    if current:
        lines.append('Current:')
        lines += [_line(e) for e in current[:MAX_ENTRIES_IN_PROMPT]]
    if former:
        lines.append('Former (no longer in the position):')
        lines += [_line(e) for e in former[:MAX_ENTRIES_IN_PROMPT]]
    lines.append(RULES)
    return '\n'.join(lines)


def leadership_prompt() -> str:
    """The block appended to the AI's system prompt ('' when nothing is recorded). Never raises."""
    try:
        cached = cache.get(AI_CACHE_KEY)
        if cached is not None:
            return cached
        text = build_prompt_text()
        cache.set(AI_CACHE_KEY, text, AI_CACHE_SECONDS)
        return text
    except Exception:  # the chat must keep working if the records cannot be read
        logger.exception('Could not build the leadership prompt')
        return ''


def bust_prompt_cache() -> None:
    try:
        cache.delete(AI_CACHE_KEY)
    except Exception:
        pass

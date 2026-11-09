"""Class LEVELS for Basic Education (nursery / primary) schools.

The level ("Class 1", "CP") decides where a pupil is and which level comes next; a class
("Class 1 A") is one stream of a level. Everything here is tenant scoped, idempotent and
additive: nothing is ever deleted or renamed behind the school's back, and NO subjects are
created (schools add their own).
"""

from __future__ import annotations

import re
import unicodedata

from django.db import transaction

from .models import ClassLevel, SchoolClass, SubSchool

NURSERY = ClassLevel.Cycle.NURSERY
PRIMARY = ClassLevel.Cycle.PRIMARY

# order = stage + 1. Stages 0-2 nursery, 3-8 primary.
LADDER = {
    'en': ['Nursery 1', 'Nursery 2', 'Nursery 3', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'],
    'fr': ['Maternelle 1', 'Maternelle 2', 'Maternelle 3', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'],
}
NURSERY_STAGES = 3
FINAL_STAGE = 8
MAX_STREAM_LEN = 50
MAX_BULK_STREAMS = 26

_FRENCH_PRIMARY = {'sil': 3, 'cp': 4, 'ce1': 5, 'ce2': 6, 'cm1': 7, 'cm2': 8}
_SECTION_NURSERY = {'petite': 0, 'moyenne': 1, 'grande': 2}
_PATTERNS = [
    (re.compile(r'\b(?:nursery|nur|maternelle|mat)\s*-?\s*([1-3])(?!\d)'), 'nursery'),
    (re.compile(r'\b(petite|moyenne|grande)\s+section\b'), 'section'),
    (re.compile(r'\b(?:class|classe|primary|primaire|std|standard|p)\s*-?\s*([1-6])(?!\d)'), 'primary'),
    (re.compile(r'\b(sil|cp|ce1|ce2|cm1|cm2)\b'), 'french'),
]
_FR_HINT = re.compile(r'matern|classe|primaire|petite|moyenne|grande')


def _ascii(value: str) -> str:
    return unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode()


def parse_basic_class_name(name: str):
    """``(stage, language, stream)`` read from a class name, or ``(None, None, '')``.

    "Class 3 A" -> (5, 'en', 'A'); "CE1 B" -> (5, 'fr', 'B'); "Class 2" -> (4, 'en', '').
    """
    plain = _ascii(name)
    label = plain.lower()
    for pattern, kind in _PATTERNS:
        match = pattern.search(label)
        if not match:
            continue
        token = match.group(1)
        language = 'en'
        if kind == 'nursery':
            stage = int(token) - 1
            language = 'fr' if re.search(r'matern|^mat', match.group(0)) else 'en'
        elif kind == 'section':
            stage, language = _SECTION_NURSERY[token], 'fr'
        elif kind == 'primary':
            stage = NURSERY_STAGES + int(token) - 1
            language = 'fr' if _FR_HINT.search(match.group(0)) else 'en'
        else:
            stage, language = _FRENCH_PRIMARY[token], 'fr'
        return stage, language, clean_stream(plain[match.end():])
    return None, None, ''


def clean_stream(value) -> str:
    stream = ' '.join(str(value or '').replace('_', ' ').split()).strip(' -./')
    if len(stream) == 1:
        stream = stream.upper()
    return stream[:MAX_STREAM_LEN]


def compose_class_name(level, stream: str = '') -> str:
    stream = clean_stream(stream)
    return f'{level.name} {stream}'.strip() if stream else level.name


# --------------------------------------------------------------------- levels

def levels_of(school):
    return ClassLevel.objects.filter(school=school).order_by('order', 'name')


def next_level(level):
    """The level above ``level`` in its language track, or None (final / nothing above)."""
    if level is None or level.is_final:
        return None
    rows = ClassLevel.objects.filter(school_id=level.school_id, order__gt=level.order)
    if level.language:
        rows = rows.filter(language__in=['', level.language])
    return rows.order_by('order', 'name').first()


def school_languages(school) -> list:
    langs = []
    for section in SubSchool.objects.filter(school=school).order_by('name'):
        from .hierarchy_setup import section_language

        lang = section_language(section.name)
        if lang and lang not in langs:
            langs.append(lang)
    if not langs:
        subsystem = getattr(school, 'subsystem', 'anglophone')
        langs = ['fr'] if subsystem == 'francophone' else ['en', 'fr'] if subsystem == 'bilingual' else ['en']
    return langs


def ensure_default_levels(school, languages=None, *, nursery=True, primary=True) -> dict:
    """Insert the standard nursery / primary levels that are missing (idempotent, never edits)."""
    created, existing = [], []
    langs = languages or school_languages(school)
    multi = len(set(langs)) > 1
    with transaction.atomic():
        have = {l.name.lower(): l for l in ClassLevel.objects.filter(school=school)}
        for lang in dict.fromkeys(langs):
            for stage, name in enumerate(LADDER['fr' if lang == 'fr' else 'en']):
                is_nursery = stage < NURSERY_STAGES
                if (is_nursery and not nursery) or (not is_nursery and not primary):
                    continue
                found = have.get(name.lower())
                if found:
                    existing.append(found)
                    continue
                level = ClassLevel.objects.create(
                    school=school, name=name, order=stage + 1, cycle=NURSERY if is_nursery else PRIMARY,
                    language=lang if multi else '', is_final=stage == FINAL_STAGE,
                )
                have[name.lower()] = level
                created.append(level)
    return {'created': created, 'existing': existing}


def find_level_for_class_name(school, name, levels=None):
    """The school's level a class name belongs to, plus its stream. ``(None, '')`` when unknown."""
    stage, language, stream = parse_basic_class_name(name)
    if stage is None:
        return None, ''
    rows = levels if levels is not None else list(ClassLevel.objects.filter(school=school))
    wanted = LADDER[language][stage].lower()
    for level in rows:
        if level.name.lower() == wanted:
            return level, stream
    # A customised ladder: same position and a compatible language track.
    same = [l for l in rows if l.order == stage + 1 and l.language in ('', language)]
    if len(same) == 1:
        return same[0], stream
    return None, ''


def create_level(school, *, name, cycle=PRIMARY, language='', is_final=False, order=None) -> ClassLevel:
    name = ' '.join(str(name or '').split())
    if order is None:
        top = ClassLevel.objects.filter(school=school).order_by('-order').values_list('order', flat=True).first()
        order = (top or 0) + 1
    return ClassLevel.objects.create(
        school=school, name=name, cycle=cycle, language=language or '', is_final=is_final, order=order,
    )


def recompose_class_names(level) -> int:
    """After a level rename: rename its classes ("Class 1 A" follows "Primary 1 A")."""
    changed = 0
    with transaction.atomic():
        for klass in SchoolClass.objects.filter(level=level):
            new = compose_class_name(level, klass.stream)
            if new != klass.name and not SchoolClass.objects.filter(school_id=klass.school_id, name=new).exclude(pk=klass.pk).exists():
                klass.name = new
                klass.save()  # re-syncs pupils and relabels history
                changed += 1
    return changed


def reorder_levels(school, ids) -> list:
    rows = {str(l.id): l for l in ClassLevel.objects.filter(school=school)}
    order = [str(i) for i in ids if str(i) in rows]
    with transaction.atomic():
        for position, level_id in enumerate(order, start=1):
            if rows[level_id].order != position:
                ClassLevel.objects.filter(pk=rows[level_id].pk).update(order=position)
        rest = [l for k, l in rows.items() if k not in order]
        for offset, level in enumerate(sorted(rest, key=lambda l: (l.order, l.name)), start=len(order) + 1):
            ClassLevel.objects.filter(pk=level.pk).update(order=offset)
    return list(levels_of(school))


# -------------------------------------------------------------------- classes

def _letters_after(used: set, count: int) -> list:
    out, index = [], 0
    while len(out) < count and index < 26 * 3:
        letter = chr(ord('A') + index % 26) * (index // 26 + 1)
        if letter.lower() not in used:
            out.append(letter)
        index += 1
    return out


def create_classes_in_level(school, level, section, *, streams=None, count=None) -> dict:
    """Create "<level> <stream>" classes. ``streams`` = explicit names; ``count`` = next N letters.

    An existing class of the school with that exact name that has no level yet is ADOPTED (level
    and stream set, name untouched) instead of duplicated; one already in the level is reported
    under ``existing``. A name that belongs to a different level is reported under ``conflicts``.
    """
    created, existing, adopted, conflicts = [], [], [], []
    with transaction.atomic():
        in_level = list(SchoolClass.objects.filter(school=school, level=level))
        used = {c.stream.lower() for c in in_level}
        if streams:
            wanted = [clean_stream(s) for s in streams]
        elif count:
            wanted = _letters_after(used, min(int(count), MAX_BULK_STREAMS))
        else:
            wanted = ['']
        by_name = {c.name.strip().lower(): c for c in SchoolClass.objects.filter(school=school)}
        seen = set()
        for stream in wanted:
            if stream.lower() in seen:
                continue
            seen.add(stream.lower())
            name = compose_class_name(level, stream)
            found = by_name.get(name.lower())
            if found:
                if found.level_id == level.id:
                    existing.append(found)
                elif found.level_id is None:
                    found.level, found.stream = level, stream
                    found.save(update_fields=['level', 'stream', 'updated_at'])
                    from apps.students import api as students_api

                    students_api.sync_class_students(found)
                    adopted.append(found)
                else:
                    conflicts.append(name)
                continue
            klass = SchoolClass.objects.create(
                school=school, sub_school=section, name=name, cycle=level.cycle, level=level, stream=stream,
            )
            by_name[name.lower()] = klass
            created.append(klass)
    return {'created': created, 'existing': existing, 'adopted': adopted, 'conflicts': conflicts}


def class_sort_key(klass):
    return (klass.stream.lower() if klass.stream else '', klass.name.lower())


# ------------------------------------------------------------------- backfill

def plan_backfill(school) -> dict:
    """What ``backfill_class_levels`` would do for one basic school (no writes)."""
    levels = list(ClassLevel.objects.filter(school=school))
    taken = {(c.level_id, c.stream.lower()) for c in SchoolClass.objects.filter(school=school, level__isnull=False)}
    assign, skipped = [], []
    for klass in SchoolClass.objects.filter(school=school, level__isnull=True).order_by('name'):
        level, stream = find_level_for_class_name(school, klass.name, levels)
        if level is None:
            skipped.append((klass, 'name does not match a nursery/primary level'))
            continue
        key = (level.id, stream.lower())
        if key in taken:
            skipped.append((klass, f'another class already is {level.name} {stream}'.strip()))
            continue
        taken.add(key)
        assign.append((klass, level, stream))
    return {'assign': assign, 'skipped': skipped}

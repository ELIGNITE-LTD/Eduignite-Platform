import re
from datetime import date, timedelta

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.utils.dateparse import parse_date
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .assessment_config import DEFAULT_SEQUENCES_PER_TERM, get_assessment_config
from .models import Sequence


TERM_NUMBER_BY_SETTING = {
    'first': 1,
    'first term': 1,
    'second': 2,
    'second term': 2,
    'third': 3,
    'third term': 3,
}

TERM_SETTING_BY_NUMBER = {
    1: 'First',
    2: 'Second',
    3: 'Third',
}


def _current_school_year_start():
    today = timezone.now().date()
    return today.year if today.month >= 8 else today.year - 1


def _academic_year_label(school):
    settings = _school_settings(school)
    label = getattr(settings, 'academic_year', '') if settings else ''
    if label:
        return str(label).strip()
    start_year = _current_school_year_start()
    return f'{start_year}-{start_year + 1}'


def _parse_start_year(academic_year):
    matches = re.findall(r'\d{4}', academic_year or '')
    if matches:
        return int(matches[0])
    return _current_school_year_start()


def _school_settings(school):
    try:
        return school.settings
    except (AttributeError, ObjectDoesNotExist):
        return None


def _active_term_number(school):
    settings = _school_settings(school)
    value = str(getattr(settings, 'term', '') or '').strip().lower()
    return TERM_NUMBER_BY_SETTING.get(value, 1)


def _split_window(start, end, parts):
    """Split [start, end] into ``parts`` consecutive, gap-free date ranges."""
    total_days = (end - start).days + 1
    ranges = []
    cursor = start
    for index in range(parts):
        remaining_parts = parts - index
        remaining_days = (end - cursor).days + 1
        span = max(1, remaining_days // remaining_parts)
        stop = end if index == parts - 1 else cursor + timedelta(days=span - 1)
        ranges.append((cursor, stop))
        cursor = stop + timedelta(days=1)
    assert total_days > 0
    return ranges


def _sequence_blueprint(start_year, per_term=DEFAULT_SEQUENCES_PER_TERM):
    next_year = start_year + 1
    if per_term != DEFAULT_SEQUENCES_PER_TERM:
        windows = [
            (1, date(start_year, 9, 1), date(start_year, 12, 20)),
            (2, date(next_year, 1, 5), date(next_year, 3, 31)),
            (3, date(next_year, 4, 1), date(next_year, 6, 30)),
        ]
        rows = []
        number = 0
        for term, begin, finish in windows:
            for first, last in _split_window(begin, finish, per_term):
                number += 1
                rows.append((term, f'Sequence {number}', first, last))
        return rows
    return [
        (1, 'Sequence 1', date(start_year, 9, 1), date(start_year, 10, 31)),
        (1, 'Sequence 2', date(start_year, 11, 1), date(start_year, 12, 20)),
        (2, 'Sequence 3', date(next_year, 1, 5), date(next_year, 2, 15)),
        (2, 'Sequence 4', date(next_year, 2, 16), date(next_year, 3, 31)),
        (3, 'Sequence 5', date(next_year, 4, 1), date(next_year, 5, 15)),
        (3, 'Sequence 6', date(next_year, 5, 16), date(next_year, 6, 30)),
    ]


def build_cameroon_sequence_payloads(academic_year, per_term=DEFAULT_SEQUENCES_PER_TERM):
    """Return editable default payloads for the three-term year (six sequences by default)."""
    start_year = _parse_start_year(academic_year)
    return [
        {
            'name': name,
            'term': term,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'is_active': False,
        }
        for term, name, start_date, end_date in _sequence_blueprint(start_year, per_term)
    ]


def _clean_calendar_payload(data, per_term=DEFAULT_SEQUENCES_PER_TERM):
    academic_year = str(data.get('academic_year') or '').strip()
    if not academic_year:
        raise ValidationError({'academic_year': 'Enter the academic year, for example 2026-2027.'})
    if len(academic_year) > 20:
        raise ValidationError({'academic_year': 'Academic year cannot exceed 20 characters.'})

    current_term = data.get('current_term') or data.get('term') or 1
    try:
        current_term = int(current_term)
    except (TypeError, ValueError):
        raise ValidationError({'current_term': 'Current term must be 1, 2, or 3.'})
    if current_term not in [1, 2, 3]:
        raise ValidationError({'current_term': 'Current term must be 1, 2, or 3.'})

    incoming_sequences = data.get('sequences') or build_cameroon_sequence_payloads(academic_year, per_term)
    expected_total = 3 * per_term
    if not isinstance(incoming_sequences, list) or len(incoming_sequences) != expected_total:
        if expected_total == 6:
            message = 'Provide exactly the six Cameroon sequences for the academic year.'
        else:
            message = f'Provide exactly the {expected_total} sequences ({per_term} per term) configured for this school.'
        raise ValidationError({'sequences': message})

    cleaned_sequences = []
    seen = set()
    active_count = 0
    for index, item in enumerate(incoming_sequences, start=1):
        name = str(item.get('name') or f'Sequence {index}').strip()
        try:
            term = int(item.get('term'))
        except (TypeError, ValueError):
            raise ValidationError({'sequences': f'{name} must have a valid term number.'})
        if term not in [1, 2, 3]:
            raise ValidationError({'sequences': f'{name} term must be 1, 2, or 3.'})

        start_date = parse_date(str(item.get('start_date') or ''))
        end_date = parse_date(str(item.get('end_date') or ''))
        if not start_date or not end_date:
            raise ValidationError({'sequences': f'{name} must have valid start and end dates.'})
        if start_date >= end_date:
            raise ValidationError({'sequences': f'{name} end date must be after its start date.'})

        key = (term, name.lower())
        if key in seen:
            raise ValidationError({'sequences': f'{name} is duplicated in Term {term}.'})
        seen.add(key)
        is_active = bool(item.get('is_active'))
        active_count += 1 if is_active else 0
        cleaned_sequences.append({
            'name': name,
            'term': term,
            'start_date': start_date,
            'end_date': end_date,
            'is_active': is_active,
        })

    if active_count > 1:
        raise ValidationError({'sequences': 'Only one sequence can be active at a time.'})
    if active_count == 0:
        for item in cleaned_sequences:
            if item['term'] == current_term:
                item['is_active'] = True
                break
    else:
        active_sequence = next((item for item in cleaned_sequences if item['is_active']), None)
        if active_sequence:
            current_term = active_sequence['term']

    return academic_year, current_term, cleaned_sequences


@transaction.atomic
def configure_cameroon_calendar_for_school(school, data):
    """Persist the Cameroon secondary academic year, terms, and six sequences."""
    if not school:
        raise ValidationError({'school': 'Your account is not linked to a school.'})

    from apps.schools.models import SchoolSettings

    per_term = get_assessment_config(school).effective_per_term
    academic_year, current_term, cleaned_sequences = _clean_calendar_payload(data, per_term)

    settings_obj, _ = SchoolSettings.objects.get_or_create(school=school)
    settings_obj.academic_year = academic_year
    settings_obj.term = TERM_SETTING_BY_NUMBER[current_term]
    settings_obj.save(update_fields=['academic_year', 'term'])

    Sequence.objects.filter(school=school, academic_year=academic_year).update(is_active=False)
    saved_sequences = []
    for item in cleaned_sequences:
        sequence, _ = Sequence.objects.update_or_create(
            school=school,
            academic_year=academic_year,
            term=item['term'],
            name=item['name'],
            defaults={
                'start_date': item['start_date'],
                'end_date': item['end_date'],
                'is_active': item['is_active'],
            },
        )
        saved_sequences.append(sequence)

    return {
        'academic_year': academic_year,
        'current_term': current_term,
        'sequences': Sequence.objects.filter(
            id__in=[sequence.id for sequence in saved_sequences],
        ).order_by('term', 'name'),
    }


@transaction.atomic
def ensure_cameroon_sequences_for_school(school):
    """Create the standard Cameroon secondary six-sequence calendar when missing."""
    if not school:
        return 0

    academic_year = _academic_year_label(school)
    start_year = _parse_start_year(academic_year)
    today = timezone.now().date()
    active_term = _active_term_number(school)
    created = 0
    expected_sequences = _sequence_blueprint(start_year, get_assessment_config(school).effective_per_term)
    existing_sequences = {
        (sequence.term, sequence.name): sequence
        for sequence in Sequence.objects.filter(school=school, academic_year=academic_year)
    }
    active_sequence_id = next(
        (sequence.id for sequence in existing_sequences.values() if sequence.is_active),
        None,
    )

    for term, name, start_date, end_date in expected_sequences:
        sequence, was_created = Sequence.objects.get_or_create(
            school=school,
            academic_year=academic_year,
            term=term,
            name=name,
            defaults={
                'start_date': start_date,
                'end_date': end_date,
                'is_active': start_date <= today <= end_date,
            },
        )
        if was_created:
            created += 1
        if sequence.is_active:
            active_sequence_id = sequence.id

    if active_sequence_id is None:
        fallback = Sequence.objects.filter(
            school=school,
            academic_year=academic_year,
            term=active_term,
        ).order_by('name').first()
        if fallback:
            active_sequence_id = fallback.id

    if active_sequence_id:
        Sequence.objects.filter(school=school, academic_year=academic_year).exclude(id=active_sequence_id).update(is_active=False)
        Sequence.objects.filter(id=active_sequence_id).update(is_active=True)

    return created

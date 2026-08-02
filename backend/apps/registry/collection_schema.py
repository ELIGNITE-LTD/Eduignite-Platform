"""Validating a record against the collection its app declared.

An app says what its records look like; this is what holds it to that. Writes
are strict — an undeclared field is an error, not something quietly stored —
because silently accepting extra keys turns a typo into data nobody can query
and lets a collection drift away from what review approved.

Values are normalised on the way in so that what comes back out has the type
the app declared, rather than whatever JSON happened to carry.
"""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal, InvalidOperation

#: A single record is capped so one app cannot fill the table with one row.
MAX_RECORD_BYTES = 64 * 1024
MAX_STRING_LENGTH = 4000
MAX_TEXT_LENGTH = 100_000


class ValidationError(ValueError):
    """A record that does not match its collection. Message is shown to the app author."""


def _fail(message):
    raise ValidationError(message)


def _as_bool(value, name):
    if isinstance(value, bool):
        return value
    if value in (0, 1):
        return bool(value)
    if isinstance(value, str) and value.lower() in ('true', 'false'):
        return value.lower() == 'true'
    _fail(f'{name} must be true or false.')


def _as_int(value, name):
    if isinstance(value, bool):
        _fail(f'{name} must be a whole number, not a boolean.')
    try:
        return int(value)
    except (TypeError, ValueError):
        _fail(f'{name} must be a whole number.')


def _as_decimal(value, name):
    try:
        # Stored as a float so the value stays comparable inside JSONB; Decimal
        # is used only to reject things that are not numbers at all.
        return float(Decimal(str(value)))
    except (InvalidOperation, TypeError, ValueError):
        _fail(f'{name} must be a number.')


def _as_date(value, name):
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, str):
        try:
            return datetime.date.fromisoformat(value[:10]).isoformat()
        except ValueError:
            pass
    _fail(f'{name} must be a date like 2026-03-14.')


def _as_datetime(value, name):
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    if isinstance(value, str):
        try:
            return datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).isoformat()
        except ValueError:
            pass
    _fail(f'{name} must be a timestamp in ISO format.')


def _as_string(value, name, limit):
    if value is None:
        _fail(f'{name} must be text.')
    if not isinstance(value, str):
        value = str(value)
    if len(value) > limit:
        _fail(f'{name} is longer than {limit} characters.')
    return value


def _as_reference(value, name):
    """References are stored as ids only.

    Existence is deliberately *not* checked on write — that would be a query per
    field on every insert. It is safe because reads resolve references through
    the Core APIs, which scope to the caller's school, so an id belonging to
    somewhere else resolves to nothing.
    """
    if isinstance(value, uuid.UUID):
        return str(value)
    text = str(value or '').strip()
    if not text:
        _fail(f'{name} must reference a record.')
    try:
        return str(uuid.UUID(text))
    except (ValueError, AttributeError):
        # Not every id in this platform is a UUID, so accept a plain key too,
        # but keep it short enough that it cannot be used as a data smuggler.
        if len(text) > 64:
            _fail(f'{name} is not a valid reference.')
        return text


def _coerce(field: dict, value, name: str):
    ftype = field.get('type')

    if ftype == 'boolean':
        return _as_bool(value, name)
    if ftype == 'integer':
        return _as_int(value, name)
    if ftype == 'decimal':
        return _as_decimal(value, name)
    if ftype == 'date':
        return _as_date(value, name)
    if ftype == 'datetime':
        return _as_datetime(value, name)
    if ftype == 'string':
        return _as_string(value, name, MAX_STRING_LENGTH)
    if ftype == 'text':
        return _as_string(value, name, MAX_TEXT_LENGTH)
    if ftype == 'reference':
        return _as_reference(value, name)
    if ftype == 'enum':
        allowed = field.get('values') or []
        if value not in allowed:
            _fail(f'{name} must be one of: {", ".join(map(str, allowed))}.')
        return value
    if ftype == 'json':
        if not isinstance(value, (dict, list)):
            _fail(f'{name} must be an object or a list.')
        return value

    _fail(f'{name} has unknown type {ftype!r}.')


def collection_spec(manifest_raw: dict, collection: str) -> dict | None:
    """The declaration for one collection, or None if the app never declared it."""
    for spec in manifest_raw.get('collections') or []:
        if isinstance(spec, dict) and spec.get('name') == collection:
            return spec
    return None


def validate_record(spec: dict, values: dict, *, partial: bool = False) -> dict:
    """Check and normalise a record against its collection declaration.

    ``partial`` is for updates, where only the supplied fields are checked and
    required fields that were not sent are left alone.
    """
    if not isinstance(values, dict):
        _fail('A record must be an object.')

    fields = {f.get('name'): f for f in spec.get('fields') or [] if isinstance(f, dict)}

    unknown = sorted(set(values) - set(fields))
    if unknown:
        _fail(
            f'{spec.get("name")!r} has no field(s): {", ".join(unknown)}. '
            'Add them to the collection in the manifest first.'
        )

    cleaned = {}
    for name, field in fields.items():
        if name not in values:
            if not partial and field.get('required'):
                _fail(f'{name} is required.')
            continue

        value = values[name]
        if value is None:
            if field.get('required'):
                _fail(f'{name} is required and cannot be empty.')
            cleaned[name] = None
            continue

        cleaned[name] = _coerce(field, value, name)

    _check_size(cleaned)
    return cleaned


def _check_size(cleaned: dict) -> None:
    import json

    try:
        size = len(json.dumps(cleaned).encode('utf-8'))
    except (TypeError, ValueError):
        _fail('Record contains a value that cannot be stored.')
    if size > MAX_RECORD_BYTES:
        _fail(f'Record is {size} bytes, over the {MAX_RECORD_BYTES} byte limit.')


def indexed_fields(spec: dict) -> list:
    """Fields the app marked indexed — the ones it may filter and sort on."""
    return [
        f.get('name')
        for f in spec.get('fields') or []
        if isinstance(f, dict) and f.get('indexed')
    ]

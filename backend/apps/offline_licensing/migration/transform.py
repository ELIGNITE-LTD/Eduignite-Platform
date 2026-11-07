"""Offline export -> real EduIgnite cloud schema transform.

The wire contract (section "Migration") requires this to be "an isolated,
well-tested transform/import function", built and tested *before* it is ever
wired to a bulk write, because it touches real school/student/teacher rows.

Field-name note (see task instructions): the product spec (section 8) uses
illustrative table names like ``student_identities`` — those are NOT real
table/field names. The real Django models, read directly from
``apps/schools/models.py``, ``apps/students/models.py`` and
``apps/users/models.py``, are:

- School id            -> ``schools.School.id`` (already the human "School ID",
                          e.g. "GBHS-D" — a CharField primary key, not a
                          separate business identifier column).
- Teacher id            -> teachers are ``users.User`` rows with
                          ``role='TEACHER'`` (there is no separate Teacher
                          model). The portable, school-assigned identifier is
                          ``User.matricule``.
- Student id            -> ``students.Student`` has its own UUID primary key
                          (an internal implementation detail, safe to
                          regenerate), plus ``admission_number`` (the
                          school-assigned business identifier that must
                          survive migration byte-identical) and a linked
                          ``users.User`` row with its own ``matricule``.

So "preserve schoolId/studentId/teacherId exactly" is implemented as:
School.id is used verbatim as the primary key, Student.admission_number and
User.matricule (teacher and student accounts) are taken verbatim from the
export when present and never regenerated. Only the internal UUID primary
keys (Student.id, User.id) are allowed to be freshly generated, since offline
export rows do not carry them and nothing in the wire contract exposes them.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction

from apps.schools.models import School
from apps.schools.relations import resolve_school_class
# Through the students API: Student Management owns its own models, and
# core/tests/test_module_boundaries.py enforces that boundary.
from apps.students import api as students_api
from apps.users.matricules import generate_school_user_matricule

User = get_user_model()


EDUCATION_CATEGORIES = ('basic', 'secondary', 'higher')


def _school_is_basic(school_data: dict, existing: School | None) -> bool:
    """Basic-education school: the payload's category wins, else the stored one."""
    category = _get(school_data, 'educationCategory', 'education_category')
    if category is None and existing is not None:
        category = existing.education_category
    return category == 'basic'


def _wants_login(row: dict, school_is_basic: bool) -> bool:
    """Pupils of basic schools migrate without a login unless the row asks for one."""
    flag = row.get('createLogin', row.get('create_login'))
    if flag is None:
        return not school_is_basic
    return bool(flag)


class MigrationValidationError(ValueError):
    """Raised by ``apply_migration`` when ``build_report`` found blocking errors."""


def _get(row: dict, *keys, default=None):
    """Read the first present key, trying camelCase and snake_case variants."""
    for key in keys:
        if key in row and row[key] not in (None, ''):
            return row[key]
    return default


def _placeholder_email(matricule: str, existing_emails: set) -> str:
    base = f'{matricule.lower()}@students.eduignite.local'
    email = base
    suffix = 0
    while email in existing_emails:
        suffix += 1
        email = f'{matricule.lower()}.{suffix}@students.eduignite.local'
    return email


@dataclass
class RowReport:
    identifier: str
    action: str  # 'create' | 'update' | 'skip'
    errors: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {'id': self.identifier, 'action': self.action, 'errors': self.errors}


def _validate_school_section(school_data: dict, school_id: str) -> tuple[RowReport, School | None]:
    required = ['name', 'shortName', 'principal', 'location', 'email']
    errors = []
    for req in required:
        if not _get(school_data, req, req[0].lower() + req[1:], _to_snake(req)):
            errors.append(f'school.{req} is required')

    category = _get(school_data, 'educationCategory', 'education_category')
    if category is not None and category not in EDUCATION_CATEGORIES:
        errors.append(f'school.educationCategory must be one of: {", ".join(EDUCATION_CATEGORIES)}')

    existing = School.objects.filter(id=school_id).first()
    action = 'update' if existing else 'create'
    if errors:
        action = 'skip'
    return RowReport(identifier=school_id, action=action, errors=errors), existing


def _to_snake(camel: str) -> str:
    out = []
    for ch in camel:
        if ch.isupper():
            out.append('_')
            out.append(ch.lower())
        else:
            out.append(ch)
    return ''.join(out)


def _validate_teacher_row(row: dict, *, existing_matricules: set, foreign_school_matricules: dict) -> RowReport:
    teacher_id = _get(row, 'teacherId', 'teacher_id')
    errors = []
    if not teacher_id:
        errors.append('teacherId is required')
    if not _get(row, 'name'):
        errors.append('name is required')
    # matricule is globally unique (it's User.USERNAME_FIELD) — if this teacherId
    # already belongs to a *different* school, this is not a safe create/update,
    # it would silently reassign that school's real teacher account. Hard error.
    if teacher_id and teacher_id in foreign_school_matricules:
        errors.append(
            f'teacherId {teacher_id!r} is already registered to a different school '
            f'({foreign_school_matricules[teacher_id]!r}) — refusing to reassign it'
        )
    action = 'skip' if errors else ('update' if teacher_id in existing_matricules else 'create')
    return RowReport(identifier=teacher_id or '(missing teacherId)', action=action, errors=errors)


def _validate_student_row(
    row: dict, *, existing_admission_numbers: set, foreign_school_matricules: dict
) -> RowReport:
    student_id = _get(row, 'studentId', 'student_id')
    errors = []
    if not student_id:
        errors.append('studentId is required')
    if not _get(row, 'name'):
        errors.append('name is required')
    # Same cross-school hijack risk as teachers, via the student's linked User
    # account — only applies when the payload supplies an explicit matricule
    # (an omitted matricule is freshly generated per-school and can't collide).
    explicit_matricule = _get(row, 'matricule')
    if explicit_matricule and explicit_matricule in foreign_school_matricules:
        errors.append(
            f'matricule {explicit_matricule!r} is already registered to a different school '
            f'({foreign_school_matricules[explicit_matricule]!r}) — refusing to reassign it'
        )
    action = 'skip' if errors else ('update' if student_id in existing_admission_numbers else 'create')
    return RowReport(identifier=student_id or '(missing studentId)', action=action, errors=errors)


def build_report(data: dict) -> dict:
    """Validate an offline export payload and report what would happen.

    Pure/read-only: performs lookups against the database to classify each
    row as create/update/skip, but never writes. Safe to call for every
    ``dry_run`` request, and reused internally by :func:`apply_migration`.
    """
    school_id = _get(data, 'schoolId', 'school_id')
    if not school_id:
        raise MigrationValidationError('schoolId is required')

    school_data = data.get('school') or {}
    school_report, _existing_school = _validate_school_section(school_data, school_id)

    teacher_rows = data.get('teachers') or []
    student_rows = data.get('students') or []

    existing_teacher_matricules = set(
        User.objects.filter(school_id=school_id, role='TEACHER').values_list('matricule', flat=True)
    ) if school_report.action != 'create' else set()
    existing_admission_numbers = set(
        students_api.list_admission_numbers(school_id)
    ) if school_report.action != 'create' else set()

    # Cross-school collision check: matricule is globally unique (User.USERNAME_FIELD),
    # so a payload naming a matricule that already exists at a DIFFERENT school must be
    # rejected rather than silently reassigned during apply_migration. Scoped to only the
    # matricules actually present in this payload — not a full-table scan.
    payload_matricules = {
        _get(row, 'teacherId', 'teacher_id') for row in teacher_rows if _get(row, 'teacherId', 'teacher_id')
    } | {
        _get(row, 'matricule') for row in student_rows if _get(row, 'matricule')
    }
    foreign_school_matricules = dict(
        User.objects.filter(matricule__in=payload_matricules)
        .exclude(school_id=school_id)
        .values_list('matricule', 'school_id')
    ) if payload_matricules else {}

    teacher_reports = [
        _validate_teacher_row(
            row, existing_matricules=existing_teacher_matricules, foreign_school_matricules=foreign_school_matricules
        )
        for row in teacher_rows
    ]
    student_reports = [
        _validate_student_row(
            row,
            existing_admission_numbers=existing_admission_numbers,
            foreign_school_matricules=foreign_school_matricules,
        )
        for row in student_rows
    ]

    # Duplicate studentId/teacherId *within the same payload* is a hard error:
    # the wire contract requires each to be preserved byte-identically, so two
    # rows claiming the same id can never both be right.
    _flag_in_payload_duplicates(teacher_reports, 'teacherId')
    _flag_in_payload_duplicates(student_reports, 'studentId')

    all_reports = [school_report, *teacher_reports, *student_reports]
    error_count = sum(1 for r in all_reports if r.errors)

    return {
        'schoolId': school_id,
        'school': school_report.to_dict(),
        'teachers': {
            'rows': [r.to_dict() for r in teacher_reports],
            'toCreate': sum(1 for r in teacher_reports if r.action == 'create'),
            'toUpdate': sum(1 for r in teacher_reports if r.action == 'update'),
        },
        'students': {
            'rows': [r.to_dict() for r in student_reports],
            'toCreate': sum(1 for r in student_reports if r.action == 'create'),
            'toUpdate': sum(1 for r in student_reports if r.action == 'update'),
        },
        'totals': {
            'teachers': len(teacher_reports),
            'students': len(student_reports),
            'errors': error_count,
        },
        'valid': error_count == 0,
    }


def _flag_in_payload_duplicates(reports: list[RowReport], field_name: str) -> None:
    seen: dict[str, int] = {}
    for r in reports:
        if r.identifier in seen:
            r.errors.append(f'duplicate {field_name} within this payload')
            r.action = 'skip'
        else:
            seen[r.identifier] = 1


@transaction.atomic
def apply_migration(data: dict) -> dict:
    """Actually write the migration to the real cloud schema.

    Must only be called when the caller has explicitly confirmed
    (``confirm: true`` at the API layer) — this function itself has no
    dry-run switch on purpose, so the "did we mean to write?" decision lives
    in exactly one place (the view).

    Preserves schoolId/studentId(admission_number)/teacherId(matricule)
    exactly via ``update_or_create`` keyed on those fields, so re-running an
    already-applied payload is idempotent rather than duplicating rows.
    """
    report = build_report(data)
    if not report['valid']:
        raise MigrationValidationError('Payload has validation errors; see report.', )

    school_id = report['schoolId']
    school_data = data.get('school') or {}

    school_defaults = {
        'name': _get(school_data, 'name'),
        'short_name': _get(school_data, 'shortName', 'short_name'),
        'principal': _get(school_data, 'principal'),
        'location': _get(school_data, 'location'),
        'email': _get(school_data, 'email'),
    }
    optional_map = {
        'phone': ('phone',),
        'schoolType': ('school_type',),
        'subsystem': ('subsystem',),
        'region': ('region',),
        'division': ('division',),
        'subDivision': ('sub_division',),
        'cityVillage': ('city_village',),
        'address': ('address',),
        'motto': ('motto',),
        'description': ('description',),
        'educationCategory': ('education_category',),
    }
    for camel_key, (model_field,) in optional_map.items():
        value = _get(school_data, camel_key, model_field)
        if value is not None:
            school_defaults[model_field] = value
    # Drop keys with no value so we never overwrite existing data with None.
    school_defaults = {k: v for k, v in school_defaults.items() if v is not None}

    school, school_created = School.objects.update_or_create(id=school_id, defaults=school_defaults)

    existing_emails = set(User.objects.values_list('email', flat=True))
    school_is_basic = school.education_category == 'basic'

    teacher_results = []
    for row in data.get('teachers') or []:
        teacher_id = _get(row, 'teacherId', 'teacher_id')
        name = _get(row, 'name')
        email = _get(row, 'email')
        if not email:
            email = _placeholder_email(teacher_id, existing_emails)
        existing_emails.add(email)

        user, created = User.objects.update_or_create(
            matricule=teacher_id,
            defaults={
                'name': name,
                'email': email,
                'role': 'TEACHER',
                'school': school,
                'phone': _get(row, 'phone', default='') or '',
            },
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])
        teacher_results.append({'id': teacher_id, 'action': 'create' if created else 'update', 'userId': str(user.id)})

    student_results = []
    for row in data.get('students') or []:
        student_id = _get(row, 'studentId', 'student_id')  # -> admission_number
        name = _get(row, 'name')
        existing_student = students_api.list_students(school=school).filter(admission_number=student_id).first()
        # An already-known pupil keeps its matricule; a new one gets the next one.
        matricule = (
            _get(row, 'matricule')
            or (existing_student.display_matricule if existing_student else '')
            or generate_school_user_matricule(school, 'STUDENT')
        )
        user = None
        if existing_student is not None and existing_student.user_id:
            user = existing_student.user
        if _wants_login(row, school_is_basic) or user is not None:
            email = _get(row, 'email')
            if not email:
                email = _placeholder_email(matricule, existing_emails)
            existing_emails.add(email)

            user, user_created = User.objects.update_or_create(
                matricule=matricule,
                defaults={
                    'name': name,
                    'email': email,
                    'role': 'STUDENT',
                    'school': school,
                    'phone': _get(row, 'phone', default='') or '',
                },
            )
            if user_created:
                user.set_unusable_password()
                user.save(update_fields=['password'])

        dob_raw = _get(row, 'dateOfBirth', 'date_of_birth')
        date_of_birth = _parse_date(dob_raw)

        student_class_label = _get(row, 'studentClass', 'student_class', default='Unassigned' if school_is_basic else 'Form 1')
        matched_class = resolve_school_class(school, class_name=student_class_label)
        student, student_created = students_api.upsert_student(
            school=school,
            admission_number=student_id,
            defaults={
                'user': user,
                **({} if user is not None else {'name': name, 'matricule': matricule}),
                'student_class': student_class_label,
                'class_level': _get(row, 'classLevel', 'class_level', default='Unassigned' if school_is_basic else 'Form 1'),
                'section': _get(row, 'section', default='General'),
                # A class that exists in the cloud school is linked, and then
                # Student.save derives the name/level/section from it.
                **({'school_class': matched_class} if matched_class is not None else {}),
                'gender': _get(row, 'gender', default='other'),
                'date_of_birth': date_of_birth,
                'guardian_name': _get(row, 'guardianName', 'guardian_name', default='') or '',
                'guardian_phone': _get(row, 'guardianPhone', 'guardian_phone', default='') or '',
            },
        )
        student_results.append({
            'id': student_id,
            'action': 'create' if student_created else 'update',
            'studentId': str(student.id),
            'userId': str(user.id) if user is not None else None,
            'matricule': matricule,
            'hasLogin': user is not None,
        })

    return {
        'schoolId': school_id,
        'school': {'id': school.id, 'action': 'create' if school_created else 'update'},
        'teachers': teacher_results,
        'students': student_results,
        'totals': {
            'teachers': len(teacher_results),
            'students': len(student_results),
        },
    }


def _parse_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None

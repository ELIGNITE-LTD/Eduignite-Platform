"""Verifiable report cards: what is printed, signed, remembered and shown.

The card data itself always comes from the existing card builders
(``generate_report_card_data`` / ``generate_term_report_card_data``); this
module only picks an allowlist of fields from that output, hashes it and
remembers it as a ``ReportCardIssue`` so a QR token can point back at it.
"""
from __future__ import annotations

import hashlib
import json
import uuid

from core import verification

from .models import ReportCardIssue

TOKEN_SALT = 'eduignite.report-card.verify.v1'

_PERIOD_KEYS = (
    'average', 'average_label', 'average_label_fr', 'rank', 'total_students', 'total_marks', 'total_coefficient',
    'class_average', 'min_average', 'max_average', 'success_rate', 'conduct', 'conduct_summary',
    'teacher_comment', 'headmaster_comment', 'principal_remark', 'promotion_status', 'promotion_decision',
    'is_promoted', 'honour_roll', 'term_averages', 'annual_average', 'annual_label', 'annual_label_fr',
    'layout', 'grading_style', 'max_score', 'pass_mark', 'show_rank', 'show_average', 'show_coefficients',
    'show_subject_position', 'show_class_average', 'show_attendance', 'show_conduct', 'show_promotion',
    'academic_year', 'term_number',
)
_GRADE_KEYS = (
    'subject_name', 'subject_code', 'teacher_name', 'coefficient', 'score', 'average', 'total', 'grade_letter',
    'grade_label', 'grade_label_fr', 'remark', 'position', 'class_average',
)
_SEQ_SCORE_KEYS = ('sequence_name', 'score', 'evaluation_label', 'evaluation_label_fr')
_ATTENDANCE_KEYS = ('present', 'absent', 'excused', 'late')


def _logo(value):
    value = str(value or '')
    return value if value.startswith(('http://', 'https://', '/')) and len(value) < 500 else ''


def public_card_summary(data: dict) -> dict:
    """The printed card, reduced to what may be public. Strict allowlist.

    Guardian details, date/place of birth, photo and internal ids are never copied.
    """
    school = data.get('school') or {}
    student = data.get('student') or {}
    sequence = data.get('sequence') or {}
    signatures = data.get('signatures') or {}
    attendance = data.get('attendance') or {}
    summary = {
        'school': {
            'name': school.get('name', ''),
            'short_name': school.get('short_name', ''),
            'motto': school.get('motto', ''),
            'logo': _logo(school.get('logo')),
            'matricule': school.get('matricule', ''),
            'principal': school.get('principal', ''),
            'region': school.get('region', ''),
            'location': school.get('location', ''),
        },
        'student': {
            'name': student.get('name', ''),
            'matricule': student.get('matricule', ''),
            'admission_number': student.get('admission_number', ''),
            'class_name': student.get('class_name', ''),
            'level': student.get('level', ''),
            'section': student.get('section', ''),
            'cycle_label': student.get('cycle_label', ''),
            'class_teacher': student.get('class_teacher', ''),
        },
        'period': {
            'name': sequence.get('name', ''),
            'term': sequence.get('term'),
            'academic_year': sequence.get('academic_year', ''),
        },
        'grades': [
            {
                **{k: row.get(k) for k in _GRADE_KEYS},
                'sequence_scores': [
                    {k: item.get(k) for k in _SEQ_SCORE_KEYS} for item in (row.get('sequence_scores') or [])
                ],
            }
            for row in (data.get('grades') or [])
        ],
        'attendance': {k: attendance.get(k) for k in _ATTENDANCE_KEYS} if attendance else {},
        'signatures': {
            'class_teacher': (signatures.get('class_teacher') or {}).get('name', ''),
            'headmaster': (signatures.get('headmaster') or {}).get('name', ''),
        },
    }
    for key in _PERIOD_KEYS:
        if key in data:
            summary[key] = data[key]
    if data.get('areas'):
        summary['areas'] = [
            {k: area.get(k) for k in ('name', 'name_fr', 'level', 'label', 'label_fr')} for area in data['areas']
        ]
        summary['nursery_scale'] = data.get('nursery_scale') or []
    return json.loads(json.dumps(summary, default=str))  # plain JSON types only


def summary_hash(summary: dict) -> str:
    blob = json.dumps(summary, sort_keys=True, separators=(',', ':'), default=str)
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()


def scope_key(sequence=None, term=None) -> str:
    return f'seq-{sequence.id}' if sequence is not None else f'term-{term}'


def year_slug(year) -> str:
    return str(year or '').replace('/', '-')


def issue_report_card(student, data, *, sequence=None, term=None, academic_year='', issued_by=None) -> ReportCardIssue:
    """Record (once) what is being printed and return its issue row."""
    summary = public_card_summary(data)
    digest = summary_hash(summary)
    issue, _ = ReportCardIssue.objects.get_or_create(
        student=student,
        scope_key=scope_key(sequence, term),
        academic_year=str((sequence.academic_year if sequence is not None else academic_year) or ''),
        snapshot_hash=digest,
        defaults={
            'school': student.school,
            'snapshot': summary,
            'issued_by': issued_by if getattr(issued_by, 'pk', None) else None,
        },
    )
    return issue


def issue_token(issue: ReportCardIssue) -> str:
    return verification.sign_token(TOKEN_SALT, issue.pk.bytes)


def resolve_issue(token):
    """The ReportCardIssue a valid token points at, else None."""
    raw = verification.unsign_token(TOKEN_SALT, token)
    if raw is None or len(raw) != 16:
        return None
    return ReportCardIssue.objects.select_related('student', 'school').filter(pk=uuid.UUID(bytes=raw)).first()


def display_code(digest: str) -> str:
    d = digest[:12].upper()
    return f'{d[:4]}-{d[4:8]}-{d[8:12]}'


def integrity_report(issue: ReportCardIssue, current: dict) -> dict:
    """Compare what was issued with what the records say now."""
    base = {'hash_code': display_code(issue.snapshot_hash), 'issued_at': issue.issued_at.isoformat()}
    if summary_hash(current) == issue.snapshot_hash:
        return {**base, 'status': 'match', 'changes': []}
    issued = {r['subject_name']: r for r in issue.snapshot.get('grades', [])}
    now = {r['subject_name']: r for r in current.get('grades', [])}
    changes = []
    for name in sorted(set(issued) | set(now)):
        a, b = issued.get(name), now.get(name)
        if (a or {}).get('score') != (b or {}).get('score'):
            changes.append({'subject': name, 'issued': (a or {}).get('score'), 'current': (b or {}).get('score')})
    return {
        **base,
        'status': 'changed',
        'changes': changes,
        'current': {k: current.get(k) for k in ('average', 'rank', 'total_students')},
    }

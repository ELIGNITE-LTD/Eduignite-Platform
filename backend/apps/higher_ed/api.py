"""Public surface of Higher Education for other apps (and for this app's own views)."""

from . import grading_presets
from .models import (
    AcademicPeriod,
    AcademicYear,
    GradingPolicy,
    OrganizationalUnit,
    Programme,
    ProgrammeYear,
)

HIGHER = 'higher'


def is_higher_school(school) -> bool:
    return bool(school) and getattr(school, 'education_category', None) == HIGHER


def ensure_programme_years(programme) -> list:
    """Create the missing 'Year One'.. rows for a programme (existing labels are kept)."""
    existing = set(programme.years.values_list('number', flat=True))
    for number in range(1, programme.duration_years + 1):
        if number not in existing:
            ProgrammeYear.objects.create(programme=programme, number=number)
    return list(programme.years.all())


def set_grading_policy(school, preset_key, thresholds=None) -> GradingPolicy:
    """Pick (or change) the institution's grading preset; thresholds default to the preset's."""
    policy, _ = GradingPolicy.objects.get_or_create(
        school=school,
        defaults={'preset_key': preset_key, 'thresholds': thresholds or grading_presets.get_preset(preset_key)},
    )
    policy.preset_key = preset_key
    policy.thresholds = thresholds or grading_presets.get_preset(preset_key)
    policy.save()
    return policy


def setup_status(school) -> dict:
    """Wizard progress in the shape the frontend expects.

    ``{"steps": [{"key", "done", "count"}...], "complete": bool}`` with the keys
    departments, programmes, course_units, lecturers, students, grading (in that
    order). course_units and lecturers report done=false, count=0 until their
    phases exist.
    """
    from apps.students import api as students_api

    departments = OrganizationalUnit.objects.filter(
        school=school, unit_type=OrganizationalUnit.DEPARTMENT, is_active=True
    ).count()
    programmes = Programme.objects.filter(school=school, is_active=True).count()
    students = students_api.list_students(school=school).count()
    grading = 1 if GradingPolicy.objects.filter(school=school).exists() else 0
    counts = [
        ('departments', departments),
        ('programmes', programmes),
        ('course_units', 0),
        ('lecturers', 0),
        ('students', students),
        ('grading', grading),
    ]
    steps = [{'key': key, 'done': count > 0, 'count': count} for key, count in counts]
    return {'steps': steps, 'complete': all(step['done'] for step in steps)}


def school_ids_offering_award(award_level: str):
    """Subquery of school ids with an ACTIVE programme of ``award_level`` (public directory filter)."""
    return Programme.objects.filter(is_active=True, award_level=award_level).values('school_id')


def programme_summary(school_ids) -> dict:
    """``{school_id: {'programme_count': int, 'award_levels': [..]}}`` in one query.

    Counts ACTIVE programmes only; award levels are distinct and ordered like ``AWARD_CHOICES``.
    """
    from django.db.models import Count

    rows = (Programme.objects.filter(is_active=True, school_id__in=list(school_ids))
            .values('school_id', 'award_level').annotate(n=Count('id')))
    order = [key for key, _ in Programme.AWARD_CHOICES]
    out: dict = {}
    for row in rows:
        entry = out.setdefault(row['school_id'], {'programme_count': 0, 'award_levels': []})
        entry['programme_count'] += row['n']
        entry['award_levels'].append(row['award_level'])
    for entry in out.values():
        entry['award_levels'].sort(key=lambda a: order.index(a) if a in order else len(order))
    return out

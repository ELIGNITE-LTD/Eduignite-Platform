"""Public surface of Higher Education for other apps (and for this app's own views)."""

from django.contrib.auth import get_user_model

from . import grading_presets
from .models import (
    AcademicPeriod,
    AcademicYear,
    CourseUnit,
    CurriculumEntry,
    GradingPolicy,
    OrganizationalUnit,
    Programme,
    ProgrammeYear,
)

HIGHER = 'higher'
LECTURER_ROLE = 'TEACHER'  # lecturers are the existing TEACHER accounts; no new role exists
LMD_CREDITS_PER_SEMESTER = 30
LMD_AWARDS = {'licence', 'master'}
LECTURER_FIELDS = (
    'name', 'email', 'phone', 'whatsapp', 'gender', 'job_title', 'hire_date', 'employment_type',
    'password', 'password_confirm',
)


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


def lecturers_of(school):
    """Lecturer accounts of an institution (the TEACHER users of that school)."""
    return get_user_model().objects.filter(school=school, role=LECTURER_ROLE)


def create_lecturer(request, data):
    """Create a lecturer through the platform's one staff-creation path.

    Reuses ``UserCreateSerializer`` (matricule generator, placeholder email,
    school-admin scope checks). Returns the created user; raises DRF
    ValidationError on bad input.
    """
    from apps.users.serializers import UserCreateSerializer

    payload = {key: value for key, value in dict(data).items() if key in LECTURER_FIELDS}
    payload['role'] = LECTURER_ROLE
    payload['school'] = request.user.school_id
    serializer = UserCreateSerializer(data=payload, context={'request': request})
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    try:
        from core.email_service import send_account_created_email

        send_account_created_email(user, actor=request.user)
    except Exception:  # the account exists; a failed welcome email must not undo it
        pass
    return user


def semester_credit_summary(programme) -> list:
    """Credit totals per (year, period) of a programme, with a warning (never a block).

    LMD awards (licence, master) are expected to total 30 credits per semester; a
    different total yields ``warning`` text. Other awards have no fixed target.
    """
    target = LMD_CREDITS_PER_SEMESTER if programme.award_level in LMD_AWARDS else None
    totals = {}
    entries = CurriculumEntry.objects.filter(programme=programme).select_related('course_unit', 'programme_year')
    for entry in entries:
        key = (entry.programme_year.number, entry.period_type, entry.period_number)
        bucket = totals.setdefault(key, {
            'year_number': key[0], 'year_label': entry.programme_year.label,
            'period_type': key[1], 'period_number': key[2], 'total_credits': 0, 'core_credits': 0,
        })
        bucket['total_credits'] += entry.effective_credits
        if entry.category == CurriculumEntry.CORE:
            bucket['core_credits'] += entry.effective_credits
    rows = []
    for key in sorted(totals):
        row = totals[key]
        row['target_credits'] = target
        row['warning'] = None
        if target is not None and row['total_credits'] != target:
            row['warning'] = f"This {row['period_type']} totals {row['total_credits']} credits; {target} is expected."
        rows.append(row)
    return rows


def setup_status(school) -> dict:
    """Wizard progress in the shape the frontend expects.

    ``{"steps": [{"key", "done", "count"}...], "complete": bool}`` with the keys
    departments, programmes, course_units, lecturers, students, grading (in that
    order).
    """
    from apps.students import api as students_api

    departments = OrganizationalUnit.objects.filter(
        school=school, unit_type=OrganizationalUnit.DEPARTMENT, is_active=True
    ).count()
    programmes = Programme.objects.filter(school=school, is_active=True).count()
    course_units = CourseUnit.objects.filter(school=school, is_active=True).count()
    lecturers = lecturers_of(school).filter(is_active=True).count()
    students = students_api.list_students(school=school).count()
    grading = 1 if GradingPolicy.objects.filter(school=school).exists() else 0
    counts = [
        ('departments', departments),
        ('programmes', programmes),
        ('course_units', course_units),
        ('lecturers', lecturers),
        ('students', students),
        ('grading', grading),
    ]
    steps = [{'key': key, 'done': count > 0, 'count': count} for key, count in counts]
    return {'steps': steps, 'complete': all(step['done'] for step in steps)}

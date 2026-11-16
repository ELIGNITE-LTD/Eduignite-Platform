"""Course results: marking, grading, GPA and transcripts for higher education.

Marking follows Cameroonian practice: continuous assessment (CA) plus a final exam make the course total.
The institution's grading policy decides the scale:

* ``gpa_4``    total out of 100 (CA 30 + exam 70), letter grade and grade points, GPA out of 4.0, degree class.
* ``scale_20`` total out of 20 (CA 8 + exam 12), mention (Passable, Assez bien, Bien, Très bien), average out of 20.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from . import grading_presets
from .models import CourseOffering, CourseResult, CurriculumEntry, Enrolment, GradingPolicy

CA_SHARE = {grading_presets.GPA_4: Decimal('0.30'), 'scale_20': Decimal('0.40')}


def _d(value):
    return None if value in (None, '') else Decimal(str(value))


def _two(value):
    return None if value is None else Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def policy_of(school):
    """The institution's grading policy as ``(preset_key, thresholds)``; ``None`` when none is chosen yet."""
    policy = GradingPolicy.objects.filter(school=school).first()
    return (policy.preset_key, policy.thresholds) if policy else None


def split(key, thresholds):
    """``(ca_max, exam_max)`` for the scale: the total is out of ``thresholds['max_score']``."""
    total = _d(thresholds['max_score'])
    ca = _two(total * CA_SHARE.get(key, Decimal('0.30')))
    return ca, _two(total - ca)


def grade_result(key, thresholds, ca, exam):
    """``(total, grade label, grade points, passed)`` once both scores exist, else ``(None, '', None, None)``."""
    if ca is None or exam is None:
        return None, '', None, None
    total = _two(ca + exam)
    info = grading_presets.grade_for_score(key, thresholds, total)
    if key == grading_presets.GPA_4:
        return total, info['letter'], _two(_d(info['points'])), info['passed']
    return total, info['mention'], None, info['passed']


def credits_of(offering):
    return offering.course_unit.credits


# ---------------------------------------------------------------------------
# The class list of an offering
# ---------------------------------------------------------------------------

def roster(offering):
    """Enrolments expected to take this offering: active students in a programme and level whose curriculum
    holds the course unit for this semester, plus anyone who already has a result for it."""
    period = offering.academic_period
    places = CurriculumEntry.objects.filter(
        school=offering.school, course_unit=offering.course_unit,
        period_type=period.period_type, period_number=period.order,
    ).values_list('programme_id', 'programme_year_id')
    enrolments = list(
        Enrolment.objects.filter(
            school=offering.school, academic_year=period.academic_year, status=Enrolment.ACTIVE)
        .select_related('student', 'student__user', 'programme', 'programme_year'))
    expected = [e for e in enrolments if (e.programme_id, e.programme_year_id) in set(places)]
    seen = {e.student_id for e in expected}
    extra = list(
        Enrolment.objects.filter(
            school=offering.school, academic_year=period.academic_year,
            student__he_results__offering=offering)
        .exclude(student_id__in=seen).select_related('student', 'student__user', 'programme', 'programme_year'))
    return expected + extra


def student_name(student):
    return student.user.name if student.user_id else student.name


def student_matricule(student):
    return student.user.matricule if student.user_id else student.matricule


def roster_rows(offering):
    policy = policy_of(offering.school)
    results = {r.student_id: r for r in CourseResult.objects.filter(offering=offering)}
    rows = []
    for enrolment in sorted(roster(offering), key=lambda e: student_name(e.student).lower()):
        result = results.get(enrolment.student_id)
        rows.append({
            'student': str(enrolment.student_id), 'name': student_name(enrolment.student),
            'matricule': student_matricule(enrolment.student), 'programme': enrolment.programme.name,
            'level': enrolment.programme_year.label,
            'ca_score': result.ca_score if result else None, 'exam_score': result.exam_score if result else None,
            'total_score': result.total_score if result else None, 'grade': result.grade if result else '',
            'grade_points': result.grade_points if result else None, 'passed': result.passed if result else None,
            'status': result.status if result else 'none',
        })
    ca_max = exam_max = total_max = None
    if policy:
        ca_max, exam_max = split(*policy)
        total_max = _d(policy[1]['max_score'])
    return {
        'offering': str(offering.id), 'course_code': offering.course_unit.code, 'course_title': offering.course_unit.title,
        'credits': offering.course_unit.credits, 'period': offering.academic_period.name,
        'scale': policy[0] if policy else None, 'ca_max': ca_max, 'exam_max': exam_max, 'total_max': total_max,
        'rows': rows,
    }


# ---------------------------------------------------------------------------
# Writing results
# ---------------------------------------------------------------------------

@transaction.atomic
def save_scores(offering, rows, user):
    """Save CA and exam scores. There is no draft: a saved score is the lecturer's submitted score.

    A lecturer can correct a score at any time. Correcting a published result keeps it published, with the corrected
    mark, so students never see an out-of-date figure.
    """
    policy = policy_of(offering.school)
    if not policy:
        raise serializers.ValidationError({'detail': 'Choose how results are graded first (Settings, then Grading).'})
    key, thresholds = policy
    ca_max, exam_max = split(key, thresholds)
    allowed = {str(e.student_id): e for e in roster(offering)}
    saved = 0
    for index, row in enumerate(rows):
        student_id = str(row.get('student') or '')
        enrolment = allowed.get(student_id)
        if enrolment is None:
            raise serializers.ValidationError({'rows': f'Row {index + 1}: this student does not take this course.'})
        try:
            ca, exam = _d(row.get('ca_score')), _d(row.get('exam_score'))
        except Exception:
            raise serializers.ValidationError({'rows': f'Row {index + 1}: scores must be numbers.'})
        if ca is not None and not (0 <= ca <= ca_max):
            raise serializers.ValidationError({'rows': f'Row {index + 1}: continuous assessment is out of {ca_max}.'})
        if exam is not None and not (0 <= exam <= exam_max):
            raise serializers.ValidationError({'rows': f'Row {index + 1}: the exam is out of {exam_max}.'})
        result = CourseResult.objects.filter(offering=offering, student=enrolment.student).first()
        if result is None and ca is None and exam is None:
            continue
        if result is None:
            result = CourseResult(school=offering.school, offering=offering, student=enrolment.student)
        result.ca_score, result.exam_score = ca, exam
        result.total_score, result.grade, result.grade_points, result.passed = grade_result(key, thresholds, ca, exam)
        if result.status != CourseResult.PUBLISHED:
            result.status = CourseResult.SUBMITTED
        result.entered_by = user
        result.save()
        saved += 1
    return saved


def publish(offering):
    """The administrator makes complete, submitted results visible to students."""
    count = CourseResult.objects.filter(
        offering=offering, status=CourseResult.SUBMITTED, total_score__isnull=False,
    ).update(status=CourseResult.PUBLISHED, published_at=timezone.now())
    return {'published': count}


def unpublish(offering):
    count = CourseResult.objects.filter(offering=offering, status=CourseResult.PUBLISHED).update(
        status=CourseResult.SUBMITTED, published_at=None)
    return {'unpublished': count}


# ---------------------------------------------------------------------------
# GPA and transcript
# ---------------------------------------------------------------------------

def _summary(key, thresholds, items):
    """Weighted result for a set of course lines: GPA out of 4 (gpa_4) or average out of 20 (scale_20)."""
    attempted = sum(i['credits'] for i in items)
    earned = sum(i['credits'] for i in items if i['passed'])
    if not attempted:
        return {'credits_attempted': 0, 'credits_earned': 0, 'gpa': None, 'average': None}
    if key == grading_presets.GPA_4:
        gpa = _two(sum(Decimal(i['credits']) * i['grade_points'] for i in items) / Decimal(attempted))
        return {'credits_attempted': attempted, 'credits_earned': earned, 'gpa': gpa, 'average': None}
    average = _two(sum(Decimal(i['credits']) * i['total_score'] for i in items) / Decimal(attempted))
    return {'credits_attempted': attempted, 'credits_earned': earned, 'gpa': None, 'average': average}


def transcript(student, school):
    """Published results of a student by academic year and semester, with GPA / average and credits."""
    policy = policy_of(school)
    if not policy:
        return {'scale': None, 'periods': [], 'cumulative': None}
    key, thresholds = policy
    results = (CourseResult.objects.filter(student=student, school=school, status=CourseResult.PUBLISHED)
               .select_related('offering__course_unit', 'offering__academic_period__academic_year')
               .order_by('offering__academic_period__academic_year__start_date', 'offering__academic_period__order'))
    periods, all_items = {}, []
    for r in results:
        period = r.offering.academic_period
        item = {
            'code': r.offering.course_unit.code, 'title': r.offering.course_unit.title, 'credits': r.offering.course_unit.credits,
            'ca_score': r.ca_score, 'exam_score': r.exam_score, 'total_score': r.total_score, 'grade': r.grade,
            'grade_points': r.grade_points, 'passed': bool(r.passed),
        }
        block = periods.setdefault(period.id, {'academic_year': period.academic_year.label, 'period': period.name, 'courses': []})
        block['courses'].append(item)
        all_items.append(item)
    out = []
    for block in periods.values():
        out.append({**block, **_summary(key, thresholds, block['courses'])})
    cumulative = _summary(key, thresholds, all_items)
    if key == grading_presets.GPA_4 and cumulative['gpa'] is not None:
        cumulative['degree_class'] = grading_presets.degree_class(thresholds, cumulative['gpa'])
    elif cumulative['average'] is not None:
        cumulative['mention'] = grading_presets.grade_for_score(key, thresholds, cumulative['average'])['mention']
    return {'scale': key, 'max_score': _d(thresholds['max_score']), 'pass_mark': _d(thresholds['pass_mark']),
            'periods': out, 'cumulative': cumulative}

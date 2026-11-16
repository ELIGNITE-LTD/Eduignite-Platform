"""Moving students up a programme at the end of an academic year, and graduating the final level.

An enrolment is a student's place in a programme level for one academic year, so moving up means creating the next
enrolment (the old one stays as history). Finishing the last level of a programme is a decision of its own: it is
never done as part of a general promotion, only for the students the administration selects.
"""

from __future__ import annotations

from django.db import transaction

from . import results as results_api
from .models import AcademicYear, CourseResult, Enrolment, ProgrammeYear


def _final_numbers(school):
    """programme id -> number of its last year."""
    out = {}
    for programme_id, number in ProgrammeYear.objects.filter(programme__school=school).values_list('programme_id', 'number'):
        out[programme_id] = max(number, out.get(programme_id, 0))
    return out


def _year_summary(school, academic_year, student_ids):
    policy = results_api.policy_of(school)
    if not policy:
        return {}
    key, thresholds = policy
    lines = {}
    for r in (CourseResult.objects.filter(school=school, student_id__in=student_ids, offering__academic_period__academic_year=academic_year)
              .select_related('offering__course_unit')):
        if r.total_score is None:
            continue
        lines.setdefault(r.student_id, []).append({
            'credits': r.offering.course_unit.credits, 'passed': bool(r.passed),
            'grade_points': r.grade_points or 0, 'total_score': r.total_score,
        })
    return {sid: results_api._summary(key, thresholds, items) for sid, items in lines.items()}


def _cumulative_credits(school, student_ids):
    """student id -> credits earned over the whole programme so far (passed courses)."""
    out = {}
    for sid, credits in (CourseResult.objects.filter(school=school, student_id__in=student_ids, passed=True)
                         .values_list('student_id', 'offering__course_unit__credits')):
        out[sid] = out.get(sid, 0) + credits
    return out


def meets_criteria(enrolment, cumulative, year_info):
    """A final-level student graduates when the credits the programme requires are earned.

    When the programme has not set a number of required credits, the student must have passed every course taken
    this year (and have at least one result).
    """
    required = enrolment.programme.required_credits
    if required:
        return cumulative.get(enrolment.student_id, 0) >= required
    return bool(year_info.get('credits_attempted')) and year_info.get('credits_earned') == year_info.get('credits_attempted')


def list_rows(school, academic_year, *, programme=None, programme_year=None, q=''):
    enrolments = (Enrolment.objects.filter(school=school, academic_year=academic_year)
                  .exclude(status=Enrolment.WITHDRAWN)
                  .select_related('student', 'student__user', 'programme', 'programme_year'))
    if programme:
        enrolments = enrolments.filter(programme_id=programme)
    if programme_year:
        enrolments = enrolments.filter(programme_year_id=programme_year)
    term = (q or '').strip()
    if term:
        from django.db.models import Q
        enrolments = enrolments.filter(Q(student__user__name__icontains=term) | Q(student__name__icontains=term)
                                       | Q(student__user__matricule__icontains=term) | Q(student__matricule__icontains=term))
    enrolments = list(enrolments)
    finals = _final_numbers(school)
    later = set(Enrolment.objects.filter(school=school, academic_year__start_date__gt=academic_year.start_date,
                                         student_id__in=[e.student_id for e in enrolments]).values_list('student_id', flat=True))
    summaries = _year_summary(school, academic_year, [e.student_id for e in enrolments])
    cumulative = _cumulative_credits(school, [e.student_id for e in enrolments])
    rows = []
    for e in enrolments:
        s = e.student
        info = summaries.get(s.id) or {}
        is_final = e.programme_year.number >= finals.get(e.programme_id, e.programme_year.number)
        if e.status == Enrolment.GRADUATED:
            state = 'graduated'
        elif e.student_id in later:
            state = 'moved'
        else:
            state = ('ready_to_graduate' if meets_criteria(e, cumulative, info) else 'final_not_met') if is_final else 'to_decide'
        rows.append({
            'enrolment': str(e.id), 'student': str(s.id), 'name': results_api.student_name(s), 'matricule': results_api.student_matricule(s),
            'programme': str(e.programme_id), 'programme_name': e.programme.name,
            'level': str(e.programme_year_id), 'level_label': e.programme_year.label, 'level_number': e.programme_year.number,
            'is_final': is_final, 'state': state,
            'credits_attempted': info.get('credits_attempted', 0), 'credits_earned': info.get('credits_earned', 0),
            'credits_total': cumulative.get(s.id, 0), 'credits_required': e.programme.required_credits,
            'gpa': str(info['gpa']) if info.get('gpa') is not None else None,
            'average': str(info['average']) if info.get('average') is not None else None,
        })
    rows.sort(key=lambda r: (r['programme_name'], r['level_number'], r['name']))
    return rows


def _load(school, academic_year, enrolment_ids):
    return list(Enrolment.objects.select_for_update(of=("self",)).filter(school=school, academic_year=academic_year, id__in=enrolment_ids)
                .select_related('student', 'student__user', 'programme', 'programme_year'))


def move(school, from_year, to_year, enrolment_ids, *, repeat=False):
    """Enrol the chosen students in ``to_year``: the next level, or the same level when repeating."""
    if to_year.school_id != school.id or from_year.school_id != school.id:
        raise ValueError('That academic year belongs to another institution.')
    if to_year.start_date <= from_year.start_date:
        raise ValueError('The new academic year must come after the one you are promoting from.')
    finals = _final_numbers(school)
    moved, failed = 0, []
    with transaction.atomic():
        for e in _load(school, from_year, enrolment_ids):
            name = results_api.student_name(e.student)
            if e.status != Enrolment.ACTIVE:
                failed.append({'name': name, 'reason': f'This student is {e.get_status_display().lower()}.'})
                continue
            number = e.programme_year.number
            if not repeat and number >= finals.get(e.programme_id, number):
                failed.append({'name': name, 'reason': 'Final level: use Graduate.'})
                continue
            if Enrolment.objects.filter(student=e.student, academic_year=to_year).exists():
                failed.append({'name': name, 'reason': 'Already enrolled in the new academic year.'})
                continue
            target = e.programme_year if repeat else ProgrammeYear.objects.filter(programme=e.programme, number=number + 1).first()
            if target is None:
                failed.append({'name': name, 'reason': 'The next level does not exist in this programme.'})
                continue
            Enrolment.objects.create(school=school, student=e.student, programme=e.programme, programme_year=target,
                                     academic_year=to_year, status=Enrolment.ACTIVE)
            moved += 1
    return {'moved': moved, 'failed': failed}


def graduate(school, from_year, enrolment_ids):
    """Graduate the chosen students; only final-level students who meet the programme's criteria can."""
    finals = _final_numbers(school)
    chosen = _load(school, from_year, enrolment_ids)
    ids = [e.student_id for e in chosen]
    cumulative = _cumulative_credits(school, ids)
    year_info = _year_summary(school, from_year, ids)
    done, failed = 0, []
    with transaction.atomic():
        for e in chosen:
            name = results_api.student_name(e.student)
            if e.status == Enrolment.GRADUATED:
                failed.append({'name': name, 'reason': 'Already graduated.'})
            elif e.status != Enrolment.ACTIVE:
                failed.append({'name': name, 'reason': f'This student is {e.get_status_display().lower()}.'})
            elif e.programme_year.number < finals.get(e.programme_id, e.programme_year.number):
                failed.append({'name': name, 'reason': 'Only students of the final level can graduate.'})
            elif not meets_criteria(e, cumulative, year_info.get(e.student_id) or {}):
                failed.append({'name': name, 'reason': 'Has not earned the credits required to graduate yet.'})
            else:
                e.status = Enrolment.GRADUATED
                e.save()
                done += 1
    return {'graduated': done, 'failed': failed}

"""One class per teacher in nursery / primary (basic) schools.

Product rule: in a ``basic`` school a teacher is the class teacher of at most
ONE class per academic year, whether through ``SchoolClass.class_master`` or a
``ClassTeacherAssignment``. Every write path funnels through
``claim_class_for_teacher`` so the rule is enforced on the server, not only in
the UI. Secondary and higher schools are untouched (every helper is a no-op).

A conflict raises ``TeacherAlreadyHasClass`` (HTTP 409) naming the class the
teacher already holds. Passing ``reassign=True`` (the admin confirmed) moves the
teacher atomically: the old class loses them, the new class gains them.

Existing data is never modified automatically; see the read-only
``report_teachers_with_multiple_classes`` management command.
"""

from django.db import transaction
from django.db.models import Q
from rest_framework import status
from core.exceptions import CustomAPIException
from rest_framework.exceptions import PermissionDenied

from .class_teaching import is_basic_school


class TeacherAlreadyHasClass(CustomAPIException):
    """409 with the class they hold. The global handler returns
    ``{status, message, code, errors, classes, teacher_id, can_reassign}``."""

    status_code = status.HTTP_409_CONFLICT
    default_code = 'teacher_already_has_class'
    default_detail = 'This teacher already teaches another class.'

    def __init__(self, payload):
        super().__init__(payload['detail'], code=self.default_code)
        self.extra = {k: v for k, v in payload.items() if k != 'detail'}


def wants_reassign(request) -> bool:
    """True when the caller confirmed moving the teacher (``reassign=true``)."""
    if request is None:
        return False
    raw = None
    data = getattr(request, 'data', None)
    if hasattr(data, 'get'):
        raw = data.get('reassign')
    if raw in (None, ''):
        raw = getattr(request, 'query_params', {}).get('reassign')
    return str(raw).strip().lower() in {'1', 'true', 'yes', 'on'}


def current_academic_year(school) -> str:
    return getattr(getattr(school, 'settings', None), 'academic_year', '') or ''


def rule_applies(school, teacher) -> bool:
    return bool(
        school and teacher
        and is_basic_school(school)
        and getattr(teacher, 'role', None) == 'TEACHER'
    )


def classes_held_by_teacher(school, teacher, *, academic_year=None, exclude_class=None):
    """Classes of ``school`` that ``teacher`` is the class teacher of (list, by name)."""
    from .models import ClassTeacherAssignment, SchoolClass

    year = current_academic_year(school) if academic_year is None else academic_year
    ids = set(
        ClassTeacherAssignment.objects.filter(
            teacher=teacher, school_class__school=school,
        ).filter(Q(academic_year=year) | Q(academic_year='')).values_list('school_class_id', flat=True)
    )
    ids.update(
        SchoolClass.objects.filter(school=school, class_master=teacher).values_list('id', flat=True)
    )
    if exclude_class is not None:
        ids.discard(getattr(exclude_class, 'id', exclude_class))
    return list(SchoolClass.objects.filter(id__in=ids).order_by('name'))


def release_teacher_from_class(school_class, teacher, *, academic_year='') -> None:
    """Remove ``teacher`` from ``school_class`` (assignments and class master)."""
    from .models import ClassTeacherAssignment

    ClassTeacherAssignment.objects.filter(school_class=school_class, teacher=teacher).filter(
        Q(academic_year=academic_year) | Q(academic_year='')
    ).delete()
    if school_class.class_master_id == teacher.id:
        school_class.class_master = None
        school_class.save(update_fields=['class_master', 'updated_at'])


def conflict_payload(teacher, held) -> dict:
    names = ', '.join(c.name for c in held)
    return {
        'detail': (
            f'{teacher.name} already teaches {names}. Remove them from it first, '
            'or confirm to move them to this class.'
        ),
        'code': 'teacher_already_has_class',
        'teacher_id': str(teacher.id),
        'teacher_name': teacher.name,
        'classes': [{'id': str(c.id), 'name': c.name} for c in held],
        'can_reassign': True,
    }


def claim_class_for_teacher(
    school, teacher, target_class=None, *, reassign=False, academic_year=None, managed_sub_school_ids=None,
) -> list:
    """Allow ``teacher`` to become class teacher of ``target_class`` (or any new class).

    Returns the classes the teacher was moved out of. Raises
    ``TeacherAlreadyHasClass`` when they hold another class and ``reassign`` is
    false. A sub-admin (``managed_sub_school_ids`` not None) may only move a teacher
    out of classes inside their own sub-school(s). Call inside the write's transaction.
    """
    if not rule_applies(school, teacher):
        return []
    year = current_academic_year(school) if academic_year is None else academic_year
    held = classes_held_by_teacher(school, teacher, academic_year=year, exclude_class=target_class)
    if not held:
        return []
    if not reassign:
        raise TeacherAlreadyHasClass(conflict_payload(teacher, held))
    if managed_sub_school_ids is not None and any(c.sub_school_id not in managed_sub_school_ids for c in held):
        raise PermissionDenied(
            f'{teacher.name} teaches a class outside your section. Ask the head of the school to move them.'
        )
    with transaction.atomic():
        for other in held:
            release_teacher_from_class(other, teacher, academic_year=year)
    return held


def teachers_with_multiple_classes(school=None):
    """Read-only: [(school, teacher, [classes])] for basic-school teachers holding 2+ classes."""
    from django.contrib.auth import get_user_model

    from .models import ClassTeacherAssignment, School, SchoolClass

    schools = School.objects.filter(education_category='basic')
    if school is not None:
        schools = schools.filter(id=school.id)
    User = get_user_model()
    rows = []
    for sch in schools.select_related('settings').order_by('name'):
        year = current_academic_year(sch)
        held = {}
        for tid, cid in ClassTeacherAssignment.objects.filter(school_class__school=sch).filter(
            Q(academic_year=year) | Q(academic_year='')
        ).values_list('teacher_id', 'school_class_id'):
            held.setdefault(tid, set()).add(cid)
        for tid, cid in SchoolClass.objects.filter(school=sch, class_master__isnull=False).values_list('class_master_id', 'id'):
            held.setdefault(tid, set()).add(cid)
        multi = {t: c for t, c in held.items() if len(c) > 1}
        if not multi:
            continue
        teachers = {u.id: u for u in User.objects.filter(id__in=multi, role='TEACHER')}
        classes = {c.id: c for c in SchoolClass.objects.filter(id__in={i for s in multi.values() for i in s})}
        for tid, cids in multi.items():
            if tid in teachers:
                rows.append((sch, teachers[tid], sorted((classes[i] for i in cids), key=lambda c: c.name)))
    return rows

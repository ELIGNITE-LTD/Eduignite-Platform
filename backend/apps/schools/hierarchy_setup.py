"""Guided setup of a Basic Education school: Section -> Levels -> Classes -> Subjects -> Class teacher.

Everything here is idempotent and tenant scoped: callers pass the school and
nothing is ever created twice (classes are unique per school+name, subjects per
school+code, a subject is linked to a class once). All writers run inside a
transaction so a half-applied template never survives an error.

Basic Education only. Secondary and higher schools keep the existing
sub-school/class/subject managers untouched.
"""

from __future__ import annotations

import re
from decimal import Decimal

from django.db import transaction

from .models import ClassTeacherAssignment, SchoolClass, SubSchool

BASIC = 'basic'

ENGLISH_SECTION = 'English Section'
FRENCH_SECTION = 'French Section'

NURSERY_NAMES = {'en': ['Nursery 1', 'Nursery 2', 'Nursery 3'], 'fr': ['Maternelle 1', 'Maternelle 2', 'Maternelle 3']}
PRIMARY_NAMES = {
    'en': ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'],
    'fr': ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'],
}

_NURSERY_RE = re.compile(r'^\s*(nurs|matern|pre[- ]?school|petite section|moyenne section|grande section|creche|kindergarten|kg\b)', re.I)


def is_basic(school) -> bool:
    return bool(school) and getattr(school, 'education_category', None) == BASIC


def section_language(name: str):
    """Language of a section read from its name ('en', 'fr' or None)."""
    if re.search(r'engl|anglo', name or '', re.I):
        return 'en'
    if re.search(r'fran[cç]|franco|french', name or '', re.I):
        return 'fr'
    return None


def cycle_for_class_name(name: str) -> str:
    return SchoolClass.Cycle.NURSERY if _NURSERY_RE.search(name or '') else SchoolClass.Cycle.PRIMARY


def class_names_for(language: str, *, nursery: bool = True, primary: bool = True) -> list:
    lang = 'fr' if language == 'fr' else 'en'
    names = []
    if nursery:
        names += NURSERY_NAMES[lang]
    if primary:
        names += PRIMARY_NAMES[lang]
    return names


# ----------------------------------------------------------------- sections

def default_section_names(school) -> list:
    subsystem = getattr(school, 'subsystem', 'anglophone')
    if subsystem == 'francophone':
        return [FRENCH_SECTION]
    if subsystem == 'bilingual':
        return [ENGLISH_SECTION, FRENCH_SECTION]
    return [ENGLISH_SECTION]


def ensure_default_sections(school) -> list:
    """Make sure a basic school has at least one section (idempotent).

    Created sections are custom (``is_system_managed=False``) so the school-type
    sync that removes stale system sections never touches them. A school that
    already has any section is left exactly as it is.
    """
    if not is_basic(school):
        return []
    existing = list(SubSchool.objects.filter(school=school))
    if existing:
        return existing
    return [SubSchool.objects.create(school=school, name=name, is_system_managed=False)
            for name in default_section_names(school)]


def ensure_section_by_language(school, language: str) -> SubSchool:
    """The school's English/French section, created when it does not exist yet."""
    wanted = 'fr' if language == 'fr' else 'en'
    for section in SubSchool.objects.filter(school=school).order_by('name'):
        if section_language(section.name) == wanted:
            return section
    return SubSchool.objects.create(
        school=school, name=FRENCH_SECTION if wanted == 'fr' else ENGLISH_SECTION, is_system_managed=False,
    )


# ------------------------------------------------------------------ classes

def bulk_create_classes(school, section, names, *, class_master=None) -> dict:
    """Create the named classes inside ``section``; reuse any that already exist.

    A class name is unique per school, so an existing class with the same name
    (any case) is reported under ``existing`` and never modified or moved. A new class
    whose name reads as a level of the school's ladder ("Class 3 A") is placed in that level.
    """
    from . import class_levels

    levels = list(class_levels.levels_of(school))
    taken = {(c.level_id, c.stream.lower()) for c in SchoolClass.objects.filter(school=school, level__isnull=False)}
    created, existing = [], []
    seen = set()
    with transaction.atomic():
        by_lower = {c.name.strip().lower(): c for c in SchoolClass.objects.filter(school=school)}
        for raw in names or []:
            name = ' '.join(str(raw or '').split())
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())
            found = by_lower.get(name.lower())
            if found:
                existing.append(found)
                continue
            level, stream = class_levels.find_level_for_class_name(school, name, levels)
            if level is not None and (level.id, stream.lower()) in taken:
                level, stream = None, ''
            klass = SchoolClass.objects.create(
                school=school, sub_school=section, name=name,
                cycle=level.cycle if level else cycle_for_class_name(name),
                class_master=class_master, level=level, stream=stream,
            )
            if level is not None:
                taken.add((level.id, stream.lower()))
            by_lower[name.lower()] = klass
            created.append(klass)
    return {'created': created, 'existing': existing}


# ----------------------------------------------------------------- subjects

def _build_code(name: str) -> str:
    parts = [p for p in re.sub(r'[^A-Za-z0-9]+', ' ', name).split() if p]
    return ''.join(p[0].upper() for p in parts[:4]) or name[:4].upper() or 'SUBJ'


def _coefficient_for(school, requested) -> Decimal:
    """Coefficients follow the assessment config: off means every subject counts 1."""
    from apps.grades.assessment_config import get_assessment_config

    if not get_assessment_config(school.id).use_coefficients:
        return Decimal('1.00')
    try:
        value = Decimal(str(requested if requested not in (None, '') else '1'))
    except Exception:  # noqa: BLE001
        value = Decimal('1')
    return value if value > 0 else Decimal('1.00')


def resolve_subject(school, *, name, code='', coefficient=None, fallback_code=None, level=''):
    """Find (by name, then code) or create the school's subject. Returns ``(subject, created)``."""
    from apps.grades.models import Subject

    name = ' '.join((name or '').split())
    code = re.sub(r'[^A-Z0-9_-]+', '', (code or '').strip().upper())
    subject = Subject.objects.filter(school=school, name__iexact=name).first() if name else None
    if not subject and code and fallback_code is None:
        subject = Subject.objects.filter(school=school, code__iexact=code).first()
    if subject:
        return subject, False
    seed = code or fallback_code or _build_code(name)
    candidate, counter = seed, 1
    while Subject.objects.filter(school=school, code=candidate).exists():
        counter += 1
        candidate = f'{seed}{counter}'
    subject = Subject.objects.create(
        school=school, name=name, code=candidate, level=level or 'Multiple Classes',
        coefficient=_coefficient_for(school, coefficient), is_active=True,
    )
    return subject, True


def link_subjects(school, school_class, items) -> dict:
    """Attach the given subjects to a class (idempotent). Returns counts and the links."""
    from apps.grades.models import ClassSubject

    created = existing = 0
    for item in items:
        subject, _ = resolve_subject(
            school, name=item.get('name'), code=item.get('code', ''), coefficient=item.get('coefficient'),
            fallback_code=item.get('code') if item.get('fallback') else None, level=school_class.name,
        )
        _, made = ClassSubject.objects.get_or_create(school_class=school_class, subject=subject)
        if made:
            created += 1
        else:
            existing += 1
    return {'created': created, 'existing': existing}


def apply_subject_list(school, classes, items) -> dict:
    """Add the subjects the school typed to each class (idempotent). Nothing is ever added by default:
    the schools create their own subjects, so ``items`` is always explicit."""
    summary = []
    with transaction.atomic():
        for klass in classes:
            counts = link_subjects(school, klass, items)
            summary.append({'id': str(klass.id), 'name': klass.name, **counts})
    return {
        'classes': summary,
        'created': sum(r['created'] for r in summary), 'existing': sum(r['existing'] for r in summary),
    }


def copy_class_subjects(school, source, targets) -> dict:
    """Copy the subject list of ``source`` onto each target class (never removes anything)."""
    from apps.grades.models import ClassSubject

    links = list(ClassSubject.objects.filter(school_class=source).select_related('subject'))
    summary = []
    with transaction.atomic():
        for target in targets:
            if target.id == source.id:
                continue
            created = existing = 0
            for link in links:
                _, made = ClassSubject.objects.get_or_create(
                    school_class=target, subject=link.subject, defaults={'type': link.type},
                )
                created += 1 if made else 0
                existing += 0 if made else 1
            summary.append({'id': str(target.id), 'name': target.name, 'created': created, 'existing': existing})
    return {
        'classes': summary,
        'created': sum(r['created'] for r in summary), 'existing': sum(r['existing'] for r in summary),
    }


# ------------------------------------------------------------ class teacher

def set_class_teacher(school_class, teacher, *, academic_year='') -> None:
    """Make ``teacher`` (or nobody) the class teacher: class_master plus the lead assignment."""
    with transaction.atomic():
        leads = ClassTeacherAssignment.objects.filter(school_class=school_class, is_lead=True)
        if teacher is None:
            leads.delete()
        else:
            leads.exclude(teacher=teacher).update(is_lead=False)
            row, _ = ClassTeacherAssignment.objects.get_or_create(
                school_class=school_class, teacher=teacher, academic_year=academic_year,
                defaults={'is_lead': True},
            )
            if not row.is_lead:
                row.is_lead = True
                row.save(update_fields=['is_lead', 'updated_at'])
        school_class.class_master = teacher
        school_class.save(update_fields=['class_master', 'updated_at'])


# ------------------------------------------------------------------ summary

def _fee_class_ids(school) -> set:
    from apps.fees.models import FeeStructure, SchoolFeeAssignment

    ids = set(SchoolFeeAssignment.objects.filter(school=school, is_active=True).values_list('school_class_id', flat=True))
    ids.update(FeeStructure.objects.filter(school=school, school_class__isnull=False).values_list('school_class_id', flat=True))
    sub_ids = set(FeeStructure.objects.filter(school=school, school_class__isnull=True, sub_school__isnull=False)
                  .values_list('sub_school_id', flat=True))
    if sub_ids:
        ids.update(SchoolClass.objects.filter(school=school, sub_school_id__in=sub_ids).values_list('id', flat=True))
    return ids


def setup_summary(school, sub_school_ids=None) -> dict:
    """Counts and per-step completion for the guided checklist."""
    from django.contrib.auth import get_user_model
    from apps.grades.models import ClassSubject
    from apps.students import api as students_api

    User = get_user_model()
    sections = SubSchool.objects.filter(school=school)
    classes = SchoolClass.objects.filter(school=school)
    if sub_school_ids is not None:
        sections = sections.filter(id__in=sub_school_ids)
        classes = classes.filter(sub_school_id__in=sub_school_ids)
    class_rows = list(classes.select_related('sub_school'))
    class_ids = {c.id for c in class_rows}
    primary_ids = {c.id for c in class_rows if c.cycle != SchoolClass.Cycle.NURSERY}

    with_subjects = set(
        ClassSubject.objects.filter(school_class_id__in=class_ids).values_list('school_class_id', flat=True)
    )
    assigned = set(
        ClassTeacherAssignment.objects.filter(school_class_id__in=class_ids, is_lead=True)
        .values_list('school_class_id', flat=True)
    ) | {c.id for c in class_rows if c.class_master_id}
    fee_ids = _fee_class_ids(school) & class_ids
    in_scope = {str(i) for i in class_ids}
    pupil_total = sum(
        row['total'] for row in students_api.student_counts_by_class(school.id)
        if sub_school_ids is None or row['class_id'] in in_scope
    )
    section_ids = {s.id for s in sections}
    unsectioned = [c for c in class_rows if not c.sub_school_id]

    def step(key, done, count, total, **extra):
        return {'key': key, 'done': bool(done), 'count': count, 'total': total, **extra}

    from .class_levels import levels_of

    level_rows = list(levels_of(school))
    unleveled = [c for c in class_rows if not c.level_id]
    pupils_by_class = {}
    for row in students_api.student_counts_by_class(school.id):
        pupils_by_class[row['class_id']] = pupils_by_class.get(row['class_id'], 0) + row['total']
    level_counts = []
    for level in level_rows:
        in_level = [c for c in class_rows if c.level_id == level.id]
        level_counts.append({
            'id': str(level.id), 'name': level.name, 'order': level.order, 'cycle': level.cycle,
            'language': level.language, 'is_final': level.is_final,
            'classes': len(in_level),
            'pupils': sum(pupils_by_class.get(str(c.id), 0) for c in in_level),
        })

    n_classes = len(class_rows)
    steps = [
        step('sections', len(section_ids) > 0, len(section_ids), None),
        step('levels', len(level_rows) > 0, len(level_rows), None),
        step('classes', n_classes > 0 and not unsectioned, n_classes, None, unsectioned=len(unsectioned)),
        step('subjects', bool(primary_ids) and primary_ids <= with_subjects,
             len(primary_ids & with_subjects), len(primary_ids)),
        step('teachers', n_classes > 0 and class_ids <= assigned, len(class_ids & assigned), n_classes),
        step('fees', n_classes > 0 and class_ids <= fee_ids, len(class_ids & fee_ids), n_classes),
        step('pupils', pupil_total > 0, pupil_total, None),
    ]
    next_step = next((s['key'] for s in steps if not s['done']), None)

    teacher_load = {}
    for c in class_rows:
        if c.class_master_id:
            teacher_load.setdefault(c.class_master_id, set()).add(c.name)
    for row in ClassTeacherAssignment.objects.filter(school_class_id__in=class_ids, is_lead=True).select_related('school_class'):
        teacher_load.setdefault(row.teacher_id, set()).add(row.school_class.name)
    teachers = [
        {'id': str(u.id), 'name': u.name, 'classes': sorted(teacher_load.get(u.id, [])),
         'load': len(teacher_load.get(u.id, []))}
        for u in User.objects.filter(school=school, role='TEACHER', is_teacher_twin=False).order_by('name')
    ]
    return {
        'education_category': getattr(school, 'education_category', ''),
        'steps': steps,
        'next_step': next_step,
        'complete': next_step is None,
        'teachers': teachers,
        'unsectioned_classes': [{'id': str(c.id), 'name': c.name} for c in unsectioned],
        'levels': level_counts,
        'unleveled_classes': [{'id': str(c.id), 'name': c.name} for c in unleveled],
        'counts': {
            'sections': len(section_ids), 'levels': len(level_rows), 'classes': n_classes, 'pupils': pupil_total,
            'subject_links': ClassSubject.objects.filter(school_class_id__in=class_ids).count(),
        },
    }

"""Guided setup of a SECONDARY / HIGHER school: Section -> Cycle -> Class -> Subjects -> Teachers.

Mirrors ``hierarchy_setup`` (nursery/primary) for the secondary structure: sub-schools are
sections (Anglophone / Francophone / Technical ...), classes carry a cycle (first / second),
every ClassSubject has its own teacher, a class has a class master. Everything here is
idempotent and tenant scoped: the caller passes the school, nothing is created twice and
NOTHING is ever added by default (no default subjects).

Nursery / primary schools are excluded (``is_secondary_like``): they keep ``hierarchy_setup``.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q

from . import hierarchy_setup as basic_setup
from .models import SchoolClass, SubSchool

FIRST = SchoolClass.Cycle.FIRST
SECOND = SchoolClass.Cycle.SECOND

# Standard Cameroon secondary ladders (names only; subjects are never created here).
CLASS_LADDERS = {
    'en': [('Form 1', FIRST), ('Form 2', FIRST), ('Form 3', FIRST), ('Form 4', FIRST), ('Form 5', FIRST),
           ('Lower Sixth', SECOND), ('Upper Sixth', SECOND)],
    'fr': [('6ème', FIRST), ('5ème', FIRST), ('4ème', FIRST), ('3ème', FIRST),
           ('Seconde', SECOND), ('Première', SECOND), ('Terminale', SECOND)],
}
MAX_BULK = 80
TEACHING_ROLES = ('TEACHER', 'SUB_ADMIN', 'SCHOOL_ADMIN')


def is_secondary_like(school) -> bool:
    return bool(school) and getattr(school, 'education_category', None) != basic_setup.BASIC


def ladder_language(school, section=None) -> str:
    """'en' or 'fr' for a section (read from its name) or, failing that, the school subsystem."""
    lang = basic_setup.section_language(getattr(section, 'name', '') or '')
    if lang:
        return lang
    return 'fr' if getattr(school, 'subsystem', 'anglophone') == 'francophone' else 'en'


def ladder_for(language: str, cycles=None) -> list:
    wanted = {c for c in (cycles or [FIRST, SECOND])}
    return [(n, c) for n, c in CLASS_LADDERS['fr' if language == 'fr' else 'en'] if c in wanted]


def bulk_create_classes(school, section, language, cycles=None) -> dict:
    """Create the standard classes of a cycle range in ``section``; reuse names that exist (any case)."""
    created, existing = [], []
    with transaction.atomic():
        by_lower = {c.name.strip().lower(): c for c in SchoolClass.objects.filter(school=school)}
        for name, cycle in ladder_for(language, cycles):
            found = by_lower.get(name.lower())
            if found:
                existing.append(found)
                continue
            klass = SchoolClass.objects.create(school=school, sub_school=section, name=name, cycle=cycle)
            by_lower[name.lower()] = klass
            created.append(klass)
    return {'created': created, 'existing': existing}


def _subject_type(value):
    from apps.grades.models import ClassSubject

    return value if value in ('mandatory', 'optional') else ClassSubject.SubjectType.MANDATORY


def apply_subjects(school, classes, items) -> dict:
    """Attach the typed subjects to each class (idempotent; an existing link is left untouched)."""
    from apps.grades.models import ClassSubject
    from apps.grades.relationships import sync_subject_metadata

    summary, touched = [], {}
    with transaction.atomic():
        for klass in classes:
            created = existing = 0
            for item in items:
                subject, _ = basic_setup.resolve_subject(
                    school, name=item['name'], code=item.get('code', ''), coefficient=item.get('coefficient'),
                    level=klass.name,
                )
                _, made = ClassSubject.objects.get_or_create(
                    school_class=klass, subject=subject, defaults={'type': _subject_type(item.get('type'))},
                )
                touched[subject.id] = subject
                created += 1 if made else 0
                existing += 0 if made else 1
            summary.append({'id': str(klass.id), 'name': klass.name, 'created': created, 'existing': existing})
        for subject in touched.values():
            sync_subject_metadata(subject)
    return _totals(summary)


def copy_subjects(source, targets, *, with_teachers=False) -> dict:
    """Copy the subject list of ``source`` onto each target class. Never removes or overwrites a link."""
    from apps.grades.models import ClassSubject
    from apps.grades.relationships import sync_subject_metadata

    links = list(ClassSubject.objects.filter(school_class=source).select_related('subject'))
    summary = []
    with transaction.atomic():
        for target in targets:
            if target.id == source.id:
                continue
            created = existing = 0
            for link in links:
                defaults = {'type': link.type}
                if with_teachers:
                    defaults['teacher'] = link.teacher
                _, made = ClassSubject.objects.get_or_create(
                    school_class=target, subject=link.subject, defaults=defaults,
                )
                created += 1 if made else 0
                existing += 0 if made else 1
            summary.append({'id': str(target.id), 'name': target.name, 'created': created, 'existing': existing})
        for subject in {l.subject for l in links}:
            sync_subject_metadata(subject)
    return _totals(summary)


def set_subject_teacher(school, subject, teacher, classes) -> dict:
    """Make ``teacher`` (or nobody) teach ``subject`` in every selected class that offers it."""
    from apps.grades.models import ClassSubject
    from apps.grades.relationships import sync_subject_metadata

    updated = unchanged = 0
    skipped = []
    with transaction.atomic():
        links = {l.school_class_id: l for l in ClassSubject.objects.filter(
            subject=subject, school_class__in=classes, school_class__school=school)}
        for klass in classes:
            link = links.get(klass.id)
            if link is None:
                skipped.append({'id': str(klass.id), 'name': klass.name})
            elif link.teacher_id == (teacher.id if teacher else None):
                unchanged += 1
            else:
                link.teacher = teacher
                link.save()
                updated += 1
        sync_subject_metadata(subject)
    return {'updated': updated, 'unchanged': unchanged, 'skipped': skipped}


def _totals(summary) -> dict:
    return {
        'classes': summary,
        'created': sum(r['created'] for r in summary), 'existing': sum(r['existing'] for r in summary),
    }


# ------------------------------------------------------------------ summary

def secondary_summary(school, sub_school_ids=None) -> dict:
    """Counts and per-step completion for the secondary checklist (read only)."""
    from apps.grades.models import ClassSubject
    from apps.students import api as students_api

    User = get_user_model()
    sections = SubSchool.objects.filter(school=school)
    classes = SchoolClass.objects.filter(school=school)
    if sub_school_ids is not None:
        sections = sections.filter(id__in=sub_school_ids)
        classes = classes.filter(sub_school_id__in=sub_school_ids)
    class_rows = list(classes.select_related('sub_school', 'class_master').order_by('name'))
    class_ids = {c.id for c in class_rows}
    section_total = SubSchool.objects.filter(school=school).count()

    links = list(ClassSubject.objects.filter(school_class_id__in=class_ids)
                 .select_related('subject', 'teacher'))
    links_by_class = {}
    for link in links:
        links_by_class.setdefault(link.school_class_id, []).append(link)
    pupils_by_class = {}
    for row in students_api.student_counts_by_class(school.id):
        pupils_by_class[row['class_id']] = pupils_by_class.get(row['class_id'], 0) + row['total']
    fee_ids = basic_setup._fee_class_ids(school) & class_ids

    rows = []
    for c in class_rows:
        mine = links_by_class.get(c.id, [])
        rows.append({
            'id': str(c.id), 'name': c.name, 'cycle': c.cycle,
            'sub_school': str(c.sub_school_id) if c.sub_school_id else None,
            'class_master': str(c.class_master_id) if c.class_master_id else None,
            'class_master_name': c.class_master.name if c.class_master_id else '',
            'subjects': len(mine), 'without_teacher': sum(1 for l in mine if not l.teacher_id),
            'pupils': pupils_by_class.get(str(c.id), 0), 'has_fees': c.id in fee_ids,
        })
    pupil_total = sum(r['pupils'] for r in rows)

    teachers = User.objects.filter(school=school, role='TEACHER', is_teacher_twin=False)
    if sub_school_ids is not None:
        teachers = teachers.filter(
            Q(sub_school_id__in=sub_school_ids) | Q(class_subject_links__school_class_id__in=class_ids))
    teacher_rows = []
    load = {}
    for l in links:
        if l.teacher_id:
            load.setdefault(l.teacher_id, set()).add(l.school_class_id)
    mastered = {}
    for c in class_rows:
        if c.class_master_id:
            mastered.setdefault(c.class_master_id, []).append(c.name)
    for u in teachers.distinct().order_by('name'):
        n_links = sum(1 for l in links if l.teacher_id == u.id)
        teacher_rows.append({
            'id': str(u.id), 'name': u.name, 'subject_links': n_links,
            'classes': len(load.get(u.id, ())), 'class_master_of': sorted(mastered.get(u.id, [])),
            'assigned': bool(n_links or mastered.get(u.id)),
        })

    def step(key, done, count, total, **extra):
        return {'key': key, 'done': bool(done), 'count': count, 'total': total, **extra}

    n_classes = len(rows)
    unsectioned = [r for r in rows if not r['sub_school']] if section_total else []
    with_subjects = sum(1 for r in rows if r['subjects'])
    with_master = sum(1 for r in rows if r['class_master'])
    with_fees = sum(1 for r in rows if r['has_fees'])
    taught = sum(1 for l in links if l.teacher_id)
    steps = [
        # Sections come from the school type (or are added by hand); a single-stream school has none
        # and that is fine, so this step never blocks the others.
        step('sections', True, sections.count(), None, optional=section_total == 0),
        step('classes', n_classes > 0 and not unsectioned, n_classes, None, unsectioned=len(unsectioned)),
        step('subjects', n_classes > 0 and with_subjects == n_classes, with_subjects, n_classes),
        step('teachers', bool(links) and taught == len(links), taught, len(links)),
        step('class_masters', n_classes > 0 and with_master == n_classes, with_master, n_classes),
        step('fees', n_classes > 0 and with_fees == n_classes, with_fees, n_classes),
        step('pupils', pupil_total > 0, pupil_total, None),
    ]
    next_step = next((s['key'] for s in steps if not s['done']), None)
    cycles = {k: sum(1 for r in rows if r['cycle'] == k) for k in (FIRST, SECOND)}
    distinct_subjects = {l.subject_id for l in links}
    return {
        'education_category': getattr(school, 'education_category', ''),
        'steps': steps, 'next_step': next_step, 'complete': next_step is None,
        'classes': rows, 'teachers': teacher_rows,
        'unsectioned_classes': [{'id': r['id'], 'name': r['name']} for r in unsectioned],
        'counts': {
            'sections': sections.count(), 'classes': n_classes, 'first_cycle': cycles[FIRST],
            'second_cycle': cycles[SECOND], 'subjects': len(distinct_subjects), 'subject_links': len(links),
            'teachers': len(teacher_rows),
            'teachers_assigned': sum(1 for t in teacher_rows if t['assigned']),
            'teachers_unassigned': sum(1 for t in teacher_rows if not t['assigned']),
            'pupils': pupil_total,
        },
    }


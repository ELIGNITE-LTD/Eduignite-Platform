"""Year-end promotion and pupil moves for Basic Education (nursery / primary) schools.

The class LEVEL decides where a pupil goes next; the class (stream) only says which group of the
level they are in. ``build_plan`` is a pure read: it proposes, for every pupil, to promote (and to
which class of the next level), repeat, graduate or hold. The head reviews the plan, may override
any pupil, and ``confirm_plan`` applies it atomically and idempotently.

Rules (see the class-levels design note):
* a pupil of the final level graduates; repeaters stay in the same class;
* the next level has ONE class -> everyone goes there;
* the next level has at least as many classes as the current one -> same stream (Class 1 A ->
  Class 2 A), unmatched streams take the remaining classes in order;
* the next level has FEWER classes (but more than one) -> all promoting pupils of the level are
  dealt round-robin over its classes (sorted by gender, class, name, id: balanced +-1 per class
  and per gender, fully deterministic);
* the next level has no class yet -> a "create classes for X first" blocker;
* classes without a level fall back to the older name based ladder.
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.schools import class_levels
from apps.schools.models import SchoolClass

from .models import Student, StudentMoveLog, StudentPromotionRecord

PROMOTE, REPEAT, GRADUATE, HOLD, APPLIED, BLOCKED = 'promote', 'repeat', 'graduate', 'hold', 'already_applied', 'blocked'
_GENDER_ORDER = {'female': 0, 'male': 1}


def _views():
    # Imported lazily: views imports this module.
    from . import views

    return views


def _live_pupils(school, classes):
    from django.db.models import Q

    return (
        Student.objects.filter(school=school, school_class__in=classes)
        .filter(Q(user__isnull=True) | Q(user__is_drafted=False))
        .select_related('user', 'school_class', 'school_class__level')
    )


def _pupil_sort(student):
    klass = student.school_class
    return (
        _GENDER_ORDER.get(student.gender, 2), class_levels.class_sort_key(klass),
        (student.display_name or '').lower(), str(student.pk),
    )


def _class_payload(klass):
    if klass is None:
        return None
    return {'id': str(klass.id), 'name': klass.name, 'level': klass.level.name if klass.level_id else ''}


def distribute(sources, targets, promoters):
    """``{student.pk: target_class}`` for the promoters of one level (pure, deterministic)."""
    if not targets or not promoters:
        return {}
    targets = sorted(targets, key=class_levels.class_sort_key)
    if len(targets) == 1:
        return {s.pk: targets[0] for s in promoters}
    if len(targets) < len(sources):
        ordered = sorted(promoters, key=_pupil_sort)
        return {s.pk: targets[i % len(targets)] for i, s in enumerate(ordered)}
    by_stream = {t.stream.lower(): t for t in targets}
    mapping, used = {}, set()
    ordered_sources = sorted(sources, key=class_levels.class_sort_key)
    for src in ordered_sources:
        match = by_stream.get(src.stream.lower())
        if match is not None and match.pk not in used:
            mapping[src.pk] = match
            used.add(match.pk)
    free = [t for t in targets if t.pk not in used]
    for src in ordered_sources:
        if src.pk not in mapping and free:
            mapping[src.pk] = free.pop(0)
    fallback = targets[0]
    return {s.pk: mapping.get(s.school_class_id, fallback) for s in promoters}


def build_plan(school, academic_year, *, sub_school_ids=None, class_ids=None, overrides=None) -> dict:
    """Read-only proposal for the whole school (or the classes in scope)."""
    views = _views()
    overrides = {str(o.get('student')): o for o in (overrides or []) if isinstance(o, dict)}
    all_classes = list(SchoolClass.objects.filter(school=school).select_related('level', 'sub_school'))
    classes_by_id = {c.id: c for c in all_classes}
    in_scope = [
        c for c in all_classes
        if (sub_school_ids is None or c.sub_school_id in sub_school_ids)
        and (not class_ids or str(c.id) in {str(i) for i in class_ids})
    ]
    pupils = list(_live_pupils(school, [c.id for c in in_scope]))

    applied_ids = {
        r.student_id for r in StudentPromotionRecord.objects.filter(
            school=school, academic_year=academic_year, decided_by__isnull=False,
        ).select_related('student') if r.is_applied
    }
    proposals = {
        r.student_id: r for r in StudentPromotionRecord.objects.filter(
            school=school, academic_year=academic_year, decided_by__isnull=True,
        )
    }
    default_average = views.get_school_promotion_average(school)

    rows, promoters_by_level = {}, defaultdict(list)
    for pupil in pupils:
        klass = classes_by_id.get(pupil.school_class_id) or pupil.school_class
        row = {
            'student': pupil, 'from_class': klass, 'decision': PROMOTE, 'target': None,
            'reason': '', 'average': None, 'no_average': False, 'overridden': False, 'blocker': '',
        }
        rows[pupil.pk] = row
        if pupil.pk in applied_ids:
            row.update(decision=APPLIED, reason='Already decided for this year.')
            continue
        try:
            average = views._annual_average_for_student(pupil, academic_year)
        except Exception:  # noqa: BLE001 - a missing mark must not break the screen
            average = None
        row['average'] = average
        proposal = proposals.get(pupil.pk)
        nursery = klass.level_id and klass.level.cycle == class_levels.NURSERY
        if proposal is not None and proposal.status == StudentPromotionRecord.Status.DISMISSED:
            row.update(decision=HOLD, reason='Marked as dismissed: not moved.')
        elif proposal is not None and proposal.status == StudentPromotionRecord.Status.REPEATED:
            row.update(decision=REPEAT, reason='Marked to repeat the class.')
        elif nursery and views._nursery_promotes_without_marks(pupil):
            row.update(reason='Nursery pupils move up without marks.')
        elif average is None:
            row.update(no_average=True, reason='No average yet: moves up unless you choose to repeat.')
        else:
            threshold = views._promotion_average_for_student(pupil, academic_year, default_average)
            if Decimal(str(average)) < Decimal(str(threshold)):
                row.update(decision=REPEAT, reason=f'Average {average}/20 is below {threshold}/20.')
            else:
                row.update(reason=f'Average {average}/20 reaches {threshold}/20.')

        override = overrides.get(str(pupil.pk))
        if override:
            action = override.get('action')
            if action in (PROMOTE, REPEAT):
                row.update(decision=action, overridden=True, reason='Chosen by the school head.')
            if override.get('target_class'):
                target = classes_by_id.get(_uuid(override['target_class']))
                if target is None:
                    raise ValidationError({'overrides': f'{pupil.display_name}: that class does not belong to this school.'})
                row.update(decision=PROMOTE, target=target, overridden=True, reason='Moved to a class chosen by the school head.')
        if row['decision'] == PROMOTE and row['target'] is None:
            promoters_by_level[klass.level_id].append(pupil)

    blockers = []
    graduating_levels = set()
    for level_id, promoters in promoters_by_level.items():
        sources = [c for c in all_classes if c.level_id == level_id] if level_id else []
        if level_id is None:
            for pupil in promoters:
                row = rows[pupil.pk]
                target = views._next_class_for_student(pupil)
                if target is not None:
                    row.update(target=target, reason=row['reason'] + ' (class has no level: next class read from its name)')
                elif views._is_final_class(pupil, row['from_class'].name):
                    row.update(decision=GRADUATE, reason='Completed the final class.')
                else:
                    row.update(decision=BLOCKED, blocker='no_level', reason='This class has no level: give it one in Hierarchy & Sections.')
            continue
        level = classes_by_id[sources[0].id].level if sources else None
        if level.is_final:
            graduating_levels.add(level_id)
            for pupil in promoters:
                rows[pupil.pk].update(decision=GRADUATE, reason='Completed the final level.')
            continue
        nxt = class_levels.next_level(level)
        if nxt is None:
            blockers.append({'level': level.name, 'next_level': '', 'code': 'no_next_level',
                             'message': f'{level.name} has no next level. Add one, or mark {level.name} as the final level.'})
            for pupil in promoters:
                rows[pupil.pk].update(decision=BLOCKED, blocker='no_next_level', reason=blockers[-1]['message'])
            continue
        targets = [c for c in all_classes if c.level_id == nxt.id]
        if not targets:
            blockers.append({'level': level.name, 'next_level': nxt.name, 'code': 'no_classes',
                             'message': f'Create classes for {nxt.name} first.'})
            for pupil in promoters:
                rows[pupil.pk].update(decision=BLOCKED, blocker='no_classes', reason=blockers[-1]['message'])
            continue
        for pk, target in distribute(sources, targets, promoters).items():
            rows[pk]['target'] = target

    ordered = sorted(
        rows.values(),
        key=lambda r: (r['from_class'].level.order if r['from_class'].level_id else 999,
                       class_levels.class_sort_key(r['from_class']), (r['student'].display_name or '').lower()),
    )
    by_target = defaultdict(lambda: {'male': 0, 'female': 0, 'other': 0, 'total': 0})
    summary = Counter()
    for row in ordered:
        summary[row['decision']] += 1
        if row['decision'] == PROMOTE and row['target'] is not None:
            bucket = by_target[row['target']]
            bucket[row['student'].gender if row['student'].gender in ('male', 'female') else 'other'] += 1
            bucket['total'] += 1
    return {
        'academic_year': academic_year,
        'rows': ordered,
        'blockers': blockers,
        'by_target': [
            {**_class_payload(klass), **counts} for klass, counts in sorted(
                by_target.items(), key=lambda kv: (kv[0].level.order if kv[0].level_id else 999, class_levels.class_sort_key(kv[0])))
        ],
        'summary': {
            'total': len(ordered), 'promote': summary[PROMOTE], 'repeat': summary[REPEAT],
            'graduate': summary[GRADUATE], 'hold': summary[HOLD], 'already_applied': summary[APPLIED],
            'blocked': summary[BLOCKED],
        },
    }


def _uuid(value):
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def serialize_plan(plan, school) -> dict:
    """JSON for the review screen."""
    rows = []
    for row in plan['rows']:
        pupil = row['student']
        rows.append({
            'student': str(pupil.pk), 'name': pupil.display_name, 'gender': pupil.gender,
            'admission_number': pupil.admission_number,
            'from_class': _class_payload(row['from_class']),
            'decision': row['decision'], 'target_class': _class_payload(row['target']),
            'reason': row['reason'], 'average': float(row['average']) if row['average'] is not None else None,
            'no_average': row['no_average'], 'overridden': row['overridden'], 'blocker': row['blocker'],
        })
    return {
        'academic_year': plan['academic_year'], 'rows': rows, 'by_target': plan['by_target'],
        'blockers': plan['blockers'], 'summary': plan['summary'],
        'can_confirm': plan['summary']['blocked'] == 0 and (plan['summary']['promote'] + plan['summary']['repeat'] + plan['summary']['graduate']) > 0,
    }


def confirm_plan(school, academic_year, user, *, sub_school_ids=None, class_ids=None, overrides=None) -> dict:
    """Apply the (reviewed) plan atomically. Safe to repeat: decided pupils are skipped."""
    views = _views()
    scope = list(_live_pupils(school, [c.id for c in SchoolClass.objects.filter(school=school)]).values_list('pk', flat=True))
    notifications = []
    with transaction.atomic():
        # Lock the pupils so two confirmations cannot both move the same child.
        list(Student.objects.select_for_update(of=('self',)).filter(pk__in=scope).values_list('pk', flat=True))
        plan = build_plan(school, academic_year, sub_school_ids=sub_school_ids, class_ids=class_ids, overrides=overrides)
        blocked = [r for r in plan['rows'] if r['decision'] == BLOCKED]
        if blocked:
            raise ValidationError({
                'detail': 'Some pupils have no class to go to. Fix the blockers or choose a class for them.',
                'blockers': plan['blockers'],
                'unresolved': [{'student': str(r['student'].pk), 'name': r['student'].display_name,
                                'from_class': r['from_class'].name, 'reason': r['reason']} for r in blocked],
            })
        counts = Counter()
        now = timezone.now()
        for row in plan['rows']:
            pupil, decision = row['student'], row['decision']
            if decision in (APPLIED, HOLD):
                counts[decision] += 1
                continue
            klass = row['from_class']
            defaults = {
                'school': school, 'current_class': klass, 'current_class_name': klass.name,
                'average_score': row['average'],
                'promotion_average': views._promotion_average_for_student(
                    pupil, academic_year, views.get_school_promotion_average(school)),
                'decided_by': user, 'decided_at': now,
            }
            if decision == PROMOTE:
                target = row['target']
                pupil.school_class = target
                try:
                    pupil.save()
                except Exception as exc:  # noqa: BLE001
                    raise ValidationError({'detail': f'{pupil.display_name} could not be moved: {exc}'})
                defaults.update(promoted_to_class=target, promoted_to_class_name=target.name,
                                status=StudentPromotionRecord.Status.PROMOTED,
                                decision_reason=f'Promoted by the school head. {row["reason"]}'.strip())
                notifications.append((pupil, True, False, klass.name, target.name))
            elif decision == REPEAT:
                defaults.update(promoted_to_class=klass, promoted_to_class_name=klass.name,
                                status=StudentPromotionRecord.Status.REPEATED,
                                decision_reason=f'Repeats the class. {row["reason"]}'.strip())
                notifications.append((pupil, False, False, klass.name, klass.name))
            else:
                defaults.update(promoted_to_class=None, promoted_to_class_name='',
                                status=StudentPromotionRecord.Status.GRADUATED,
                                decision_reason='Completed the final class and graduated.')
                notifications.append((pupil, True, True, klass.name, klass.name))
            StudentPromotionRecord.objects.update_or_create(student=pupil, academic_year=academic_year, defaults=defaults)
            counts[decision] += 1

        def _notify():
            for pupil, promoted, graduated, from_name, to_name in notifications:
                views._notify_promotion_outcome(
                    pupil, promoted=promoted, graduated=graduated, from_class_name=from_name,
                    to_class_name=to_name, academic_year=academic_year, sender=user,
                )

        transaction.on_commit(_notify)
    return {
        'promoted': counts[PROMOTE], 'repeated': counts[REPEAT], 'graduated': counts[GRADUATE],
        'held': counts[HOLD], 'already_applied': counts[APPLIED],
        'detail': f'{counts[PROMOTE]} promoted, {counts[REPEAT]} repeating, {counts[GRADUATE]} graduated. Matricules were preserved.',
    }


def move_pupils(school, user, student_ids, target_class, *, sub_school_ids=None, acknowledge_level_change=False) -> dict:
    """Move chosen pupils to one class of the school (atomic, audited, level crossing needs a yes)."""
    if not isinstance(student_ids, list) or not student_ids:
        raise ValidationError({'student_ids': 'Select at least one pupil.'})
    if target_class.school_id != school.id:
        raise ValidationError({'target_class': 'Pick a class of your school.'})
    if sub_school_ids is not None and target_class.sub_school_id not in sub_school_ids:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied('You can only move pupils inside your own section.')
    with transaction.atomic():
        pupils = list(
            Student.objects.select_for_update(of=('self',))
            .filter(school=school, pk__in=student_ids).select_related('school_class', 'school_class__level', 'user')
        )
        if len(pupils) != len({str(i) for i in student_ids}):
            raise ValidationError({'student_ids': 'Some pupils were not found in your school.'})
        if sub_school_ids is not None:
            for pupil in pupils:
                if pupil.school_class_id and pupil.school_class.sub_school_id not in sub_school_ids:
                    from rest_framework.exceptions import PermissionDenied

                    raise PermissionDenied('You can only move pupils of your own section.')
        movers = [p for p in pupils if p.school_class_id != target_class.id]
        crossing = [
            {'student': str(p.pk), 'name': p.display_name,
             'from_class': p.school_class.name if p.school_class_id else '',
             'from_level': p.school_class.level.name if p.school_class_id and p.school_class.level_id else ''}
            for p in movers
            if (p.school_class.level_id if p.school_class_id else None) != target_class.level_id
        ]
        if crossing and not acknowledge_level_change:
            return {
                'requires_confirmation': True, 'moved': 0,
                'target_class': _class_payload(target_class), 'crossing': crossing,
                'detail': f'{len(crossing)} pupil(s) would change level to {target_class.level.name if target_class.level_id else "no level"}.',
            }
        batch = uuid.uuid4()
        crossed_ids = {c['student'] for c in crossing}
        for pupil in movers:
            previous = pupil.school_class
            pupil.school_class = target_class
            pupil.save()
            StudentMoveLog.objects.create(
                batch_id=batch, school=school, student=pupil, moved_by=user,
                from_class=previous, from_class_name=previous.name if previous else pupil.student_class,
                to_class=target_class, to_class_name=target_class.name, crossed_level=str(pupil.pk) in crossed_ids,
            )
    return {
        'requires_confirmation': False, 'moved': len(movers), 'unchanged': len(pupils) - len(movers),
        'target_class': _class_payload(target_class), 'batch_id': str(batch) if movers else None,
        'crossed_level': len(crossing),
        'detail': f'{len(movers)} pupil(s) moved to {target_class.name}.',
    }

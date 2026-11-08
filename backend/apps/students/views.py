import csv
import re
import unicodedata
import logging
import uuid
from io import StringIO
from decimal import Decimal, InvalidOperation

from django.http import HttpResponse
from django.db.models import Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
import django_filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from apps.schools.models import SchoolClass, SchoolSettings
from apps.platform.access import filter_students_by_platform_access
from .class_sync import enforced_class_fields, infer_class_level, infer_section
from .models import Guardian, Student, StudentGuardian, StudentPromotionRecord, ParentStudentLink, StudentActivationToken
from .serializers import (
    StudentListSerializer, StudentDetailSerializer, StudentCreateSerializer,
    StudentUpdateSerializer, ParentStudentLinkSerializer, HonourRollSerializer,
    StudentActivationTokenSerializer, GuardianSerializer, StudentGuardianSerializer,
    StudentPromotionRecordSerializer,
)
from .parent_accounts import get_or_create_parent_account, sync_parent_student_relationship
from apps.users.matricules import generate_school_user_matricule

User = get_user_model()
logger = logging.getLogger(__name__)


def get_school_honour_roll_threshold(school):
    try:
        return school.settings.honour_roll_threshold
    except Exception:
        return 12.0


def get_school_promotion_average(school):
    try:
        return Decimal(str(school.settings.promotion_average))
    except Exception:
        return Decimal('10.00')


def get_school_dismissal_average(school):
    """Average below which a learner is dismissed rather than asked to repeat.

    Zero — the default — means the school dismisses nobody.
    """
    try:
        return Decimal(str(school.settings.dismissal_average))
    except Exception:
        return Decimal('0.00')


def _current_academic_year_for_school(school):
    try:
        return school.settings.academic_year or ''
    except Exception:
        return ''


def _attendance_summary_for_history(student, promotion_record, sequences):
    from apps.attendance.models import AttendanceRecord

    records = AttendanceRecord.objects.select_related('session').filter(student=student)
    class_filter = Q()
    if promotion_record.current_class_id:
        class_filter |= Q(session__school_class_id=promotion_record.current_class_id)
    if promotion_record.current_class_name:
        class_filter |= Q(session__student_class=promotion_record.current_class_name)
    if class_filter:
        records = records.filter(class_filter)

    sequence_dates = [
        date_value
        for sequence in sequences
        for date_value in [sequence.start_date, sequence.end_date]
        if date_value
    ]
    if sequence_dates:
        records = records.filter(session__date__gte=min(sequence_dates), session__date__lte=max(sequence_dates))

    total = records.count()
    present = records.filter(status='present').count()
    late = records.filter(status='late').count()
    absent = records.filter(status='absent').count()
    excused = records.filter(status='excused').count()
    attendance_rate = Decimal('0.00')
    if total:
        attendance_rate = ((Decimal(present + late) / Decimal(total)) * Decimal('100')).quantize(Decimal('0.01'))

    return {
        'total_sessions': total,
        'present': present,
        'late': late,
        'absent': absent,
        'excused': excused,
        'attendance_percentage': float(attendance_rate),
    }


def _published_report_card_exists(student, promotion_record, *, sequence=None, term=None, academic_year=None):
    from apps.grades.models import ReportCardPublication

    queryset = ReportCardPublication.objects.filter(
        school=student.school,
        is_published=True,
    )
    class_filter = Q(class_name=promotion_record.current_class_name)
    if promotion_record.current_class_id:
        class_filter |= Q(school_class_id=promotion_record.current_class_id)
    queryset = queryset.filter(class_filter)

    if sequence:
        return queryset.filter(
            scope=ReportCardPublication.Scope.SEQUENCE,
            sequence=sequence,
        ).exists()

    return queryset.filter(
        scope=ReportCardPublication.Scope.TERM,
        term=term,
        academic_year=academic_year,
    ).exists()


def _rank_for_history_period(student, promotion_record, sequences):
    from apps.grades.utils import calculate_period_average

    if not sequences:
        return None, 0

    classmates = Student.objects.filter(school=student.school)
    class_filter = Q()
    if promotion_record.current_class_id:
        class_filter |= Q(promotion_records__academic_year=promotion_record.academic_year, promotion_records__current_class_id=promotion_record.current_class_id)
    if promotion_record.current_class_name:
        class_filter |= Q(promotion_records__academic_year=promotion_record.academic_year, promotion_records__current_class_name=promotion_record.current_class_name)
    if class_filter:
        classmates = classmates.filter(class_filter).distinct()
    else:
        classmates = classmates.filter(id=student.id)

    averages = []
    for classmate in classmates:
        average = calculate_period_average(
            classmate,
            sequences,
            school_class=promotion_record.current_class,
            class_name=promotion_record.current_class_name,
        )
        if average > Decimal('0.00'):
            averages.append({'student_id': classmate.id, 'average': average})

    averages.sort(key=lambda row: row['average'], reverse=True)
    for index, row in enumerate(averages, start=1):
        if row['student_id'] == student.id:
            return index, len(averages)
    return None, len(averages)


def _history_record_payload(student, promotion_record):
    from apps.grades.models import Grade, Sequence
    from apps.grades.utils import calculate_period_average

    sequences = list(
        Sequence.objects.filter(
            school=student.school,
            academic_year=promotion_record.academic_year,
        ).order_by('term', 'name')
    )
    sequence_ids = [sequence.id for sequence in sequences]
    grades = Grade.objects.select_related('subject', 'teacher', 'sequence').filter(
        student=student,
        sequence_id__in=sequence_ids,
    )
    class_filter = Q()
    if promotion_record.current_class_id:
        class_filter |= Q(school_class_id=promotion_record.current_class_id)
    if promotion_record.current_class_name:
        class_filter |= Q(class_name_snapshot=promotion_record.current_class_name)
    if class_filter:
        grades = grades.filter(class_filter)
    grades = grades.order_by('sequence__term', 'sequence__name', 'subject__name')

    subject_rows = {}
    for grade in grades:
        row = subject_rows.setdefault(grade.subject_id, {
            'subject_id': str(grade.subject_id),
            'subject_name': grade.subject.name,
            'subject_code': grade.subject.code,
            'teacher_name': grade.teacher.get_full_name() if grade.teacher_id else '',
            'coefficient': float(grade.subject.coefficient),
            'scores': [],
        })
        row['scores'].append({
            'sequence_id': str(grade.sequence_id),
            'sequence_name': grade.sequence.name,
            'term': grade.sequence.term,
            'score': float(grade.score),
            'comment': grade.comment or '',
        })
        if grade.teacher_id:
            row['teacher_name'] = grade.teacher.get_full_name()

    subjects = []
    for row in subject_rows.values():
        scores = [Decimal(str(item['score'])) for item in row['scores']]
        average = (sum(scores, Decimal('0.00')) / Decimal(len(scores))).quantize(Decimal('0.01')) if scores else Decimal('0.00')
        subjects.append({
            **row,
            'average': float(average),
        })

    terms = []
    report_cards = []
    for term in [1, 2, 3]:
        term_sequences = [sequence for sequence in sequences if sequence.term == term]
        if not term_sequences:
            continue
        term_sequence_ids = {sequence.id for sequence in term_sequences}
        if not grades.filter(sequence_id__in=term_sequence_ids).exists():
            continue
        average = calculate_period_average(
            student,
            term_sequences,
            school_class=promotion_record.current_class,
            class_name=promotion_record.current_class_name,
        )
        rank, total_students = _rank_for_history_period(student, promotion_record, term_sequences)
        published = _published_report_card_exists(
            student,
            promotion_record,
            term=term,
            academic_year=promotion_record.academic_year,
        )
        terms.append({
            'term': term,
            'label': f'Term {term}',
            'academic_year': promotion_record.academic_year,
            'average': float(average),
            'rank': rank,
            'total_students': total_students,
            'published': published,
            'sequence_ids': [str(sequence.id) for sequence in term_sequences],
        })
        report_cards.append({
            'scope': 'TERM',
            'term': term,
            'academic_year': promotion_record.academic_year,
            'title': f'Term {term} Report Card',
            'average': float(average),
            'rank': rank,
            'total_students': total_students,
            'published': published,
            'api_path': f'/api/v1/grades/grades/report_card/?student_id={student.id}&term={term}&academic_year={promotion_record.academic_year}',
        })

    for sequence in sequences:
        if not grades.filter(sequence=sequence).exists():
            continue
        average = calculate_period_average(
            student,
            [sequence],
            school_class=promotion_record.current_class,
            class_name=promotion_record.current_class_name,
        )
        rank, total_students = _rank_for_history_period(student, promotion_record, [sequence])
        published = _published_report_card_exists(student, promotion_record, sequence=sequence)
        report_cards.append({
            'scope': 'SEQUENCE',
            'sequence_id': str(sequence.id),
            'sequence_name': sequence.name,
            'term': sequence.term,
            'academic_year': sequence.academic_year,
            'title': f'{sequence.name} Report Card',
            'average': float(average),
            'rank': rank,
            'total_students': total_students,
            'published': published,
            'api_path': f'/api/v1/grades/grades/report_card/?student_id={student.id}&sequence_id={sequence.id}',
        })

    annual_average = promotion_record.average_score
    if annual_average is None and terms:
        annual_average = (
            sum((Decimal(str(term['average'])) for term in terms), Decimal('0.00')) / Decimal(len(terms))
        ).quantize(Decimal('0.01'))

    return {
        'id': str(promotion_record.id),
        'academic_year': promotion_record.academic_year,
        'class_id': str(promotion_record.current_class_id) if promotion_record.current_class_id else None,
        'class_name': promotion_record.current_class_name,
        'sub_school_name': (
            promotion_record.current_class.sub_school.name
            if promotion_record.current_class_id and promotion_record.current_class.sub_school_id
            else 'Main School'
        ),
        'promoted_to_class_name': promotion_record.promoted_to_class_name,
        'status': promotion_record.status,
        'decision_reason': promotion_record.decision_reason,
        'decided_at': promotion_record.decided_at,
        'annual_average': float(annual_average) if annual_average is not None else None,
        'promotion_average': float(promotion_record.promotion_average) if promotion_record.promotion_average is not None else None,
        'attendance': _attendance_summary_for_history(student, promotion_record, sequences),
        'terms': terms,
        'subjects': subjects,
        'report_cards': report_cards,
        'transcript': {
            'academic_year': promotion_record.academic_year,
            'subjects_count': len(subjects),
            'terms_count': len(terms),
            'average': float(annual_average) if annual_average is not None else None,
        },
    }


def _normalize_class_label(value):
    return ''.join(ch for ch in str(value or '').lower() if ch.isalnum())


CLASS_PROMOTION_ORDER = [
    ['form1', 'formi', '6eme', '6e', 'sixieme'],
    ['form2', 'formii', '5eme', '5e', 'cinquieme'],
    ['form3', 'formiii', '4eme', '4e', 'quatrieme'],
    ['form4', 'formiv', '3eme', '3e', 'troisieme'],
    ['form5', 'formv', '2nde', 'seconde'],
    ['lowersixth', 'lower6', 'premiere', '1ere', 'premierea', 'premierec', 'premiered'],
    ['uppersixth', 'upper6', 'terminale', 'tle'],
]


def _class_stage(name):
    label = _normalize_class_label(name)
    for index, aliases in enumerate(CLASS_PROMOTION_ORDER):
        if any(alias in label for alias in aliases):
            return index
    return None


_infer_class_level = infer_class_level
_infer_section = infer_section


# --- Basic Education (nursery / primary) ladder -----------------------------
# Stages 0-2 are Nursery 1-3, stages 3-8 are Class 1-6. The anglophone names
# (Class N / Primary N / Std N) and the francophone ones (SIL, CP, CE1, CE2,
# CM1, CM2) share the same six primary stages. Used ONLY for basic schools; the
# secondary ladder above is untouched.
BASIC_NURSERY_STAGES = 3
BASIC_FINAL_STAGE = 8
_FRENCH_PRIMARY = {'sil': 1, 'cp': 2, 'ce1': 3, 'ce2': 4, 'cm1': 5, 'cm2': 6}
_SECTION_NURSERY = {'petite': 1, 'moyenne': 2, 'grande': 3}
_BASIC_PATTERNS = [
    (re.compile(r'\b(?:nursery|nur|maternelle|mat)\s*-?\s*([1-3])\b'), 'nursery'),
    (re.compile(r'\b(petite|moyenne|grande)\s+section\b'), 'section'),
    (re.compile(r'\b(?:class|classe|primary|primaire|std|standard|p)\s*-?\s*([1-6])\b'), 'primary'),
    (re.compile(r'\b(sil|cp|ce1|ce2|cm1|cm2)\b'), 'french'),
]


def _basic_class_stage(name):
    """(stage, suffix) of a nursery / primary class name, or (None, '').

    ``suffix`` is what follows the class token ("Class 3 A" -> "a") so a pupil
    can stay in the parallel group of the next class.
    """
    label = unicodedata.normalize('NFKD', str(name or '')).encode('ascii', 'ignore').decode().lower()
    for pattern, kind in _BASIC_PATTERNS:
        match = pattern.search(label)
        if not match:
            continue
        token = match.group(1)
        if kind == 'nursery':
            stage = int(token) - 1
        elif kind == 'section':
            stage = _SECTION_NURSERY[token] - 1
        elif kind == 'primary':
            stage = BASIC_NURSERY_STAGES + int(token) - 1
        else:
            stage = BASIC_NURSERY_STAGES + _FRENCH_PRIMARY[token] - 1
        return stage, _normalize_class_label(label[match.end():])
    return None, ''


def _is_basic_student(student):
    return getattr(getattr(student, 'school', None), 'education_category', None) == 'basic'


def _is_final_class(student, class_name):
    """True when ``class_name`` is the last class of the learner's school ladder."""
    if _is_basic_student(student):
        stage, _suffix = _basic_class_stage(class_name)
        if stage is not None:
            return stage == BASIC_FINAL_STAGE
    return _class_stage(class_name) == len(CLASS_PROMOTION_ORDER) - 1


def _nursery_promotes_without_marks(student):
    """Nursery pupils are rated, not marked: promote them by default.

    A basic school can switch this off with
    ``assessment_config['nursery_promote_without_marks'] = False``.
    """
    try:
        config = student.school.settings.assessment_config or {}
    except Exception:  # noqa: BLE001 - no settings row means the default
        return True
    return bool(config.get('nursery_promote_without_marks', True))


def _is_nursery_student(student):
    if not _is_basic_student(student):
        return False
    current_class = student.school_class
    stage, _suffix = _basic_class_stage(current_class.name if current_class else student.student_class)
    return stage is not None and stage < BASIC_NURSERY_STAGES


def _next_basic_class_for_student(student):
    """Next nursery / primary class of the same school, or None."""
    current_class = student.school_class
    stage, suffix = _basic_class_stage(current_class.name if current_class else student.student_class)
    if stage is None or stage >= BASIC_FINAL_STAGE:
        return None
    classes = SchoolClass.objects.filter(school=student.school).select_related('sub_school').order_by('name')
    candidates = [c for c in classes if _basic_class_stage(c.name)[0] == stage + 1]
    if not candidates:
        return None
    # Stay in the same sub-school when the school has them; nursery -> primary
    # may legitimately cross sub-schools, so only narrow when a match exists.
    if current_class and current_class.sub_school_id:
        same = [c for c in candidates if c.sub_school_id == current_class.sub_school_id]
        candidates = same or candidates
    # Keep the parallel group: "Class 3 A" -> "Class 4 A", else plain "Class 4".
    same_suffix = [c for c in candidates if _basic_class_stage(c.name)[1] == suffix]
    return (same_suffix or candidates)[0]


def _next_class_for_student(student):
    if not student.school_id:
        return None
    if _is_basic_student(student):
        basic_current = student.school_class.name if student.school_class else student.student_class
        if _basic_class_stage(basic_current)[0] is not None:
            return _next_basic_class_for_student(student)
    current_class = student.school_class
    current_stage = _class_stage(current_class.name if current_class else student.student_class)
    if current_stage is None:
        return None
    classes = SchoolClass.objects.filter(school=student.school).select_related('sub_school').order_by('name')
    if current_class and current_class.sub_school_id:
        classes = classes.filter(Q(sub_school_id=current_class.sub_school_id) | Q(sub_school__isnull=True))

    candidates = []
    for school_class in classes:
        stage = _class_stage(school_class.name)
        if stage == current_stage + 1:
            candidates.append(school_class)
    if not candidates:
        return None

    # Narrow to the learner's own sub-school first, when they have one.
    if current_class and current_class.sub_school_id:
        same_sub_school = [item for item in candidates if item.sub_school_id == current_class.sub_school_id]
        if same_sub_school:
            candidates = same_sub_school

    # Then keep the learner in their own stream. The candidates are ordered by
    # name, so without this a Form 4 Science learner is promoted into Form 5
    # Arts purely because "Arts" sorts first — they would arrive in the next
    # class with the wrong subjects, timetable and teachers.
    current_section = _infer_section(current_class.name if current_class else student.student_class)
    same_section = [item for item in candidates if _infer_section(item.name) == current_section]
    if same_section:
        return same_section[0]

    return candidates[0]


def _notify_promotion_outcome(student, *, promoted, from_class_name, to_class_name, academic_year, sender=None, graduated=False, dismissed=False):
    """
    Tell the learner and their guardians what was decided about their year.

    Sent only when a decision is actually committed — the draft statuses that
    `_build_promotion_record` recomputes on every recalculation are not a
    decision, and notifying there would re-notify the whole school each time an
    administrator opened the promotions screen.

    Learner and guardians get separate wording: the guardian message names the
    child, matching how attendance already addresses parents. Notifications
    must never block the promotion itself, so every failure is swallowed.
    """
    try:
        from apps.notifications.utils import notify_users
        from . import api as students_api

        student_user = student.user if student.user_id else None
        full_name = student_user.get_full_name() if student_user else (student.name or 'Your child')
        first_name = (full_name or 'Your child').split(' ')[0]

        if dismissed:
            student_title = 'Your place at the school has ended'
            student_message = (
                f'Following the end-of-year review of {academic_year}, your annual average in '
                f'{from_class_name} fell below the level the school requires to continue. '
                f'Please contact the school administration.'
            )
            parent_title = f"{first_name}'s place at the school has ended"
            parent_message = (
                f"Following the end-of-year review of {academic_year}, {full_name}'s annual average in "
                f'{from_class_name} fell below the level the school requires to continue. '
                f'Please contact the school administration to discuss this.'
            )
        elif graduated:
            student_title = 'You have graduated'
            student_message = (
                f'Congratulations! You have completed {from_class_name} and graduated from the school '
                f'at the end of {academic_year}.'
            )
            parent_title = f'{first_name} has graduated'
            parent_message = (
                f'{full_name} has completed {from_class_name} and graduated at the end of {academic_year}.'
            )
        elif promoted:
            student_title = 'You have been promoted'
            student_message = (
                f'Congratulations! You have been promoted from {from_class_name} to {to_class_name} '
                f'for {academic_year}. Your class, timetable and subjects have been updated.'
            )
            parent_title = f'{first_name} has been promoted'
            parent_message = (
                f'{full_name} has been promoted from {from_class_name} to {to_class_name} for {academic_year}.'
            )
        else:
            student_title = 'You are repeating your class'
            student_message = (
                f'After the end-of-year review you will repeat {from_class_name} for {academic_year}. '
                f'Please speak with your school if you have any questions.'
            )
            parent_title = f'{first_name} will repeat {from_class_name}'
            parent_message = (
                f'After the end-of-year review, {full_name} will repeat {from_class_name} for {academic_year}. '
                f'Please contact the school if you would like to discuss this.'
            )

        # The learner is notified on their own — the mirror is turned off so the
        # guardians do not also receive the learner-addressed "you" wording;
        # they get their own child-named message below.
        if student_user:
            notify_users(
                [student_user], student_title, student_message,
                notification_type='academic', sender=sender,
                mirror_to_parents=False,
            )

        guardians = [
            parent for parent in students_api.get_guardian_users(student)
            if parent and getattr(parent, 'is_active', True)
        ]
        if guardians:
            notify_users(
                guardians, parent_title, parent_message,
                notification_type='academic', sender=sender,
            )
    except Exception:  # noqa: BLE001 — a notification must never block a promotion
        logger.exception('Promotion notification failed for student %s', getattr(student, 'pk', None))


def _annual_average_for_student(student, academic_year):
    try:
        from apps.grades.models import AnnualResult

        annual_result = AnnualResult.objects.filter(
            student=student,
            academic_year=academic_year,
        ).order_by('-modified', '-created').first()
        if annual_result:
            return annual_result.annual_average
    except Exception:
        pass

    if student.annual_average is not None:
        return student.annual_average

    # No annual result has been compiled and nothing is stored on the learner,
    # but marks may still have been recorded all year. Averaging those is far
    # better than reporting "Pending" against a learner whose work is on file,
    # which left whole classes undecidable at promotion time.
    try:
        from django.db.models import Avg
        from apps.grades.models import Grade

        grades = Grade.objects.filter(student=student)
        if academic_year:
            grades = grades.filter(sequence__academic_year=academic_year)
        average = grades.aggregate(value=Avg('score')).get('value')
        if average is not None:
            return Decimal(str(round(float(average), 2)))
    except Exception:  # noqa: BLE001 — fall through to "no average yet"
        logger.exception('Grade-average fallback failed for student %s', getattr(student, 'pk', None))

    return None


def _build_promotion_record(student, academic_year, promotion_average):
    average = _annual_average_for_student(student, academic_year)
    next_class = _next_class_for_student(student)
    current_class = student.school_class

    if next_class and _is_nursery_student(student) and _nursery_promotes_without_marks(student):
        # Nursery pupils are rated, not marked: no average is needed to move up.
        status_value = StudentPromotionRecord.Status.PROMOTED
        reason = 'Nursery pupils move up to the next class without marks.'
        target_class = next_class
    elif average is None:
        status_value = StudentPromotionRecord.Status.PENDING
        reason = 'No annual average has been calculated for this academic year yet.'
        target_class = current_class
    elif Decimal(str(average)) >= promotion_average:
        if next_class:
            status_value = StudentPromotionRecord.Status.PROMOTED
            reason = f'Annual average meets the promotion threshold of {promotion_average}/20.'
            target_class = next_class
        else:
            status_value = StudentPromotionRecord.Status.GRADUATED
            reason = 'Annual average meets the threshold and no higher class is configured.'
            target_class = None
    else:
        dismissal_average = get_school_dismissal_average(student.school)
        if dismissal_average > 0 and Decimal(str(average)) < dismissal_average:
            status_value = StudentPromotionRecord.Status.DISMISSED
            reason = f'Annual average is below the dismissal threshold of {dismissal_average}/20.'
            target_class = None
        else:
            status_value = StudentPromotionRecord.Status.REPEATED
            reason = f'Annual average is below the promotion threshold of {promotion_average}/20.'
            target_class = current_class

    record, _ = StudentPromotionRecord.objects.update_or_create(
        student=student,
        academic_year=academic_year,
        defaults={
            'school': student.school,
            'current_class': current_class,
            'current_class_name': current_class.name if current_class else student.student_class,
            'promoted_to_class': target_class,
            'promoted_to_class_name': target_class.name if target_class else '',
            'average_score': average,
            'promotion_average': promotion_average,
            'status': status_value,
            'decision_reason': reason,
        },
    )
    return record


def _promotion_average_for_student(student, academic_year, default_average):
    from .models import ClassPromotionPolicy

    if student.school_class_id:
        policy = ClassPromotionPolicy.objects.filter(
            school=student.school,
            school_class=student.school_class,
            academic_year=academic_year,
        ).first()
        if policy:
            return policy.promotion_average
    return default_average


def _teacher_class_scope(user):
    """Return the registered classes a teacher is allowed to see."""
    if not getattr(user, 'school_id', None):
        return SchoolClass.objects.none()
    from apps.schools.class_teaching import basic_class_ids_for_teacher

    # Basic Education: a teacher assigned to a class (ClassTeacherAssignment or
    # class master) sees that class. Empty for non-basic schools, so the filter
    # below is then exactly the original one.
    basic_class_ids = basic_class_ids_for_teacher(user)
    scope = Q(class_subjects__teacher=user) | Q(class_master=user)
    if basic_class_ids:
        scope |= Q(id__in=basic_class_ids)
    return SchoolClass.objects.filter(scope, school_id=user.school_id).distinct()


class StudentFilterSet(django_filters.FilterSet):
    """Filters for the student list.

    ``school_class`` and ``sub_school`` let a selector ask the server for one
    class / section instead of loading everyone and filtering in the browser.
    """

    sub_school = django_filters.UUIDFilter(field_name='school_class__sub_school')

    class Meta:
        model = Student
        fields = ['class_level', 'section', 'school', 'school_class', 'sub_school']


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.select_related('user', 'school', 'school_class').prefetch_related(
        'parent_links__parent',
        'guardian_links__guardian',
    )
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = StudentFilterSet
    search_fields = ['user__name', 'user__email', 'user__matricule', 'name', 'matricule', 'admission_number', 'student_class']
    ordering_fields = ['admission_date', 'user__name', 'admission_number', 'annual_average']
    ordering = ['user__name']

    def get_serializer_class(self):
        if self.action == 'create':
            return StudentCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return StudentUpdateSerializer
        elif self.action == 'retrieve':
            return StudentDetailSerializer
        elif self.action == 'honour_roll':
            return HonourRollSerializer
        return StudentListSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Student.objects.select_related('user', 'school', 'school_class').prefetch_related(
            'parent_links__parent',
            'guardian_links__guardian',
        ).filter(Q(user__isnull=True) | Q(user__is_drafted=False), school__is_drafted=False)

        if user.role == 'SCHOOL_ADMIN' or user.role == 'SUB_ADMIN':
            # A principal sees every student in their school; a vice principal /
            # sub-admin is scoped to the students of their assigned sub-school(s).
            if not user.school:
                return queryset.none()
            queryset = queryset.filter(Q(school=user.school) | Q(user__school=user.school)).distinct()
            from apps.schools.scoping import managed_sub_school_ids
            sub_ids = managed_sub_school_ids(user)
            if sub_ids is not None:
                queryset = queryset.filter(school_class__sub_school_id__in=sub_ids)
        elif user.role == 'TEACHER':
            # Teachers only see students in classes/subjects they teach.
            if not user.school:
                return queryset.none()
            taught_classes = _teacher_class_scope(user)
            taught_class_ids = list(taught_classes.values_list('id', flat=True))
            taught_class_names = list(taught_classes.values_list('name', flat=True))
            if not taught_class_ids and not taught_class_names:
                return queryset.none()
            queryset = queryset.filter(
                Q(school=user.school) | Q(user__school=user.school)
            ).filter(
                Q(school_class_id__in=taught_class_ids) | Q(student_class__in=taught_class_names)
            ).distinct()
        elif user.role == 'PARENT':
            # Parent sees linked children
            linked_students = ParentStudentLink.objects.filter(parent=user).values_list('student_id', flat=True)
            guardian_linked_students = StudentGuardian.objects.filter(guardian__user=user).values_list('student_id', flat=True)
            queryset = filter_students_by_platform_access(queryset.filter(
                Q(id__in=linked_students) | Q(id__in=guardian_linked_students),
            )).distinct()
        elif user.role == 'STUDENT':
            # Student sees only self
            queryset = queryset.filter(user=user)
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Only school administrators and sub-admins can register students.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Students get no account email: the school hands over their credentials.
        student = serializer.save()
        response_data = StudentDetailSerializer(student, context=self.get_serializer_context()).data
        response_data['student_matricule'] = student.display_matricule
        primary_parent_link = student.parent_links.filter(is_primary=True).select_related('parent').first()
        response_data['parent_matricule'] = getattr(primary_parent_link.parent, 'matricule', None) if primary_parent_link else None
        return Response(response_data, status=status.HTTP_201_CREATED)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        include_qr = str(request.query_params.get('include_qr', '')).lower() in {'1', 'true', 'yes'}

        page = self.paginate_queryset(queryset)
        students = list(page) if page is not None else list(queryset)
        if include_qr:
            for student in students:
                try:
                    student.generate_qr_code()
                except Exception:
                    pass

        serializer = self.get_serializer(students, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=['get'],
        url_path=r'verify/(?P<admission_number>[^/.]+)',
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
    )
    def verify(self, request, admission_number=None):
        """Public, limited student-card verification endpoint for QR scans."""
        from . import api as students_api

        student = students_api.resolve_public_student(
            admission_number, request.query_params.get('school')
        )
        if student is students_api.AMBIGUOUS:
            return Response(
                {'valid': False, 'detail': 'This card number is used by more than one school. Please ask the school for a re-printed card.'},
                status=status.HTTP_409_CONFLICT,
            )
        if student is None:
            return Response(
                {'valid': False, 'detail': 'No valid student card was found for this admission number.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            academic_year = student.school.settings.academic_year
        except Exception:
            academic_year = ''
        admission_year = str(student.admission_date.year) if student.admission_date else ''
        return Response({
            'valid': True,
            'admission_number': student.admission_number,
            'matricule': student.display_matricule,
            'student_name': student.display_name,
            'school_name': student.school.name,
            'school_matricule': student.school.matricule,
            'class_name': student.student_class,
            'section': student.section,
            'admission_year': admission_year,
            'academic_year': academic_year,
            'status': 'ACTIVE' if (student.user.is_active if student.user_id else True) else 'INACTIVE',
        })

    def _flatten_error_messages(self, errors, prefix=""):
        messages = []

        if isinstance(errors, dict):
            for field, value in errors.items():
                field_prefix = f"{prefix}.{field}" if prefix else str(field)
                messages.extend(self._flatten_error_messages(value, field_prefix))
            return messages

        if isinstance(errors, list):
            for value in errors:
                if isinstance(value, (dict, list)):
                    messages.extend(self._flatten_error_messages(value, prefix))
                else:
                    label = prefix.replace("_", " ").strip() if prefix else "error"
                    messages.append(f"{label}: {value}")
            return messages

        label = prefix.replace("_", " ").strip() if prefix else "error"
        messages.append(f"{label}: {errors}")
        return messages

    def _extract_name_from_row(self, row):
        preferred_columns = [
            'name', 'student_name', 'full_name', 'fullname', 'student', 'learner_name',
            'nom', 'noms', 'student names'
        ]
        lowered_map = {str(key).strip().lower(): value for key, value in row.items() if key is not None}

        for column in preferred_columns:
            value = lowered_map.get(column)
            if isinstance(value, str) and value.strip():
                return value.strip()

        for value in row.values():
            if not isinstance(value, str):
                continue
            cleaned = value.strip()
            if not cleaned:
                continue
            if '@' in cleaned:
                continue
            digits = ''.join(char for char in cleaned if char.isdigit())
            if digits and len(digits) >= max(6, len(cleaned) - 2):
                continue
            return cleaned
        return ''

    def _infer_class_level(self, student_class):
        label = (student_class or '').strip().lower()
        normalized = label.replace(' ', '')
        if 'upper sixth' in label or 'upper6' in normalized:
            return 'Upper Sixth'
        if 'lower sixth' in label or 'lower6' in normalized:
            return 'Lower Sixth'
        if 'form1' in normalized:
            return 'Form 1'
        if 'form2' in normalized:
            return 'Form 2'
        if 'form3' in normalized:
            return 'Form 3'
        if 'form4' in normalized:
            return 'Form 4'
        if 'form5' in normalized:
            return 'Form 5'
        return 'Form 1'

    def _infer_section(self, student_class):
        label = (student_class or '').strip().lower()
        if 'bilingual' in label:
            return 'Bilingual'
        if 'technical' in label:
            return 'Technical'
        if 'science' in label:
            return 'Science'
        if 'arts' in label or 'art' in label:
            return 'Arts'
        if 'commercial' in label or 'commerce' in label:
            return 'Commercial'
        if 'french' in label or 'francophone' in label:
            return 'French Section'
        if 'english' in label or 'anglophone' in label:
            return 'English Section'
        return 'General'

    def _generate_activation_matricule(self, school, school_class=None):
        return generate_school_user_matricule(school, 'STUDENT')

    def _render_activation_sheet_document(self, school, generated_tokens, title_suffix):
        rows = ''.join(
            f"""
            <tr>
              <td style="padding:10px;border:1px solid #ddd;">{index}</td>
              <td style="padding:10px;border:1px solid #ddd;">{token.student_name or 'Student activation slot'}</td>
              <td style="padding:10px;border:1px solid #ddd;">{token.matricule}</td>
              <td style="padding:10px;border:1px solid #ddd;">{token.student_class}</td>
              <td style="padding:10px;border:1px solid #ddd;">{token.class_level}</td>
              <td style="padding:10px;border:1px solid #ddd;">{token.section}</td>
            </tr>
            """
            for index, token in enumerate(generated_tokens, start=1)
        )
        return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Student Activation Sheet - {title_suffix}</title></head>
<body style="font-family:Arial,sans-serif;padding:32px;color:#111;">
  <h1 style="margin:0 0 8px;">{school.name}</h1>
  <p style="margin:0 0 24px;">Student activation sheet for {title_suffix}</p>
  <table style="border-collapse:collapse;width:100%;">
    <thead>
      <tr>
        <th style="padding:10px;border:1px solid #ddd;text-align:left;">#</th>
        <th style="padding:10px;border:1px solid #ddd;text-align:left;">Student Name</th>
        <th style="padding:10px;border:1px solid #ddd;text-align:left;">Matricule</th>
        <th style="padding:10px;border:1px solid #ddd;text-align:left;">Class</th>
        <th style="padding:10px;border:1px solid #ddd;text-align:left;">Level</th>
        <th style="padding:10px;border:1px solid #ddd;text-align:left;">Section</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
  <p style="margin-top:24px;">Each matricule can only activate one account. Once used, the platform will reject any second activation attempt.</p>
</body>
</html>"""

    def _iter_upload_rows(self, decoded):
        stripped_lines = [line for line in decoded.splitlines() if line.strip()]
        if not stripped_lines:
            return

        try:
            dialect = csv.Sniffer().sniff('\n'.join(stripped_lines[:5]), delimiters=',;\t|')
        except csv.Error:
            dialect = csv.excel

        try:
            has_header = csv.Sniffer().has_header('\n'.join(stripped_lines[:5]))
        except csv.Error:
            has_header = False

        if has_header:
            reader = csv.DictReader(StringIO('\n'.join(stripped_lines)), dialect=dialect)
            for index, row in enumerate(reader, start=2):
                yield index, row or {}
            return

        for index, line in enumerate(stripped_lines, start=1):
            parts = next(csv.reader([line], dialect=dialect))
            row = {f'column_{position}': value for position, value in enumerate(parts)}
            yield index, row

    @staticmethod
    def _class_master_can_manage(user, student) -> bool:
        """A class master may edit students of their own class when the school
        admin has switched on class_masters_can_edit_students."""
        if getattr(user, 'role', None) != 'TEACHER':
            return False
        try:
            if not user.school.settings.class_masters_can_edit_students:
                return False
        except Exception:  # noqa: BLE001 — settings row may not exist yet
            return False
        return bool(student.school_class_id and student.school_class.class_master_id == user.id)

    def update(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            if not self._class_master_can_manage(request.user, self.get_object()):
                raise PermissionDenied("Only school administrators — or the class master, when the school has allowed it — can update students.")
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='upload-photo')
    def upload_photo(self, request, pk=None):
        """Upload/replace a student's profile photo (school admin or permitted class master)."""
        student = self.get_object()
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN'] and not self._class_master_can_manage(request.user, student):
            raise PermissionDenied("Only school administrators — or the class master, when the school has allowed it — can upload student photos.")

        from core.upload_validation import image_to_data_url, validate_image_upload

        file = request.FILES.get('photo') or request.FILES.get('avatar')
        error = validate_image_upload(file, field_label='student photo')
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        try:
            avatar_data_url = image_to_data_url(file)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not student.user_id:
            return Response(
                {'detail': 'This learner has no login account yet; a photo cannot be stored.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        student.user.avatar = avatar_data_url
        student.user.save(update_fields=['avatar'])
        return Response({'avatar': avatar_data_url, 'detail': 'Student photo updated.'})

    @action(detail=False, methods=['get'])
    def me(self, request):
        """Return the authenticated student's profile."""
        if request.user.role != 'STUDENT':
            raise PermissionDenied("Only students can access their own student profile.")

        student = self.get_queryset().first()
        if not student:
            return Response({'detail': 'Student profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = StudentDetailSerializer(student, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my_class_history')
    def my_class_history(self, request):
        """Return previous class records while keeping the main student account scoped to the current class."""
        if request.user.role != 'STUDENT':
            raise PermissionDenied("Only students can access their own previous class records.")

        student = Student.objects.select_related(
            'user',
            'school',
            'school__settings',
            'school_class',
            'school_class__sub_school',
        ).filter(user=request.user).first()
        if not student:
            return Response({'detail': 'Student profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        current_academic_year = _current_academic_year_for_school(student.school)
        history_records = StudentPromotionRecord.objects.select_related(
            'current_class__sub_school',
            'promoted_to_class',
            'decided_by',
        ).filter(student=student).exclude(
            status=StudentPromotionRecord.Status.PENDING,
        )
        if current_academic_year:
            history_records = history_records.filter(
                Q(academic_year__lt=current_academic_year)
                | ~Q(current_class_id=student.school_class_id)
                | ~Q(current_class_name=student.student_class)
            )
        else:
            history_records = history_records.filter(
                ~Q(current_class_id=student.school_class_id)
                | ~Q(current_class_name=student.student_class)
            )

        history_records = history_records.order_by('-academic_year', '-decided_at', '-modified')

        current_class = student.school_class
        current_subjects = []
        for enrollment in student.subject_enrollments.select_related(
            'class_subject__subject',
            'class_subject__teacher',
            'class_subject__school_class',
        ).filter(is_active=True, class_subject__school_class=student.school_class).order_by('class_subject__subject__name'):
            current_subjects.append({
                'subject_id': str(enrollment.class_subject.subject_id),
                'subject_name': enrollment.class_subject.subject.name,
                'subject_code': enrollment.class_subject.subject.code,
                'teacher_name': enrollment.class_subject.teacher.get_full_name() if enrollment.class_subject.teacher_id else '',
                'type': enrollment.class_subject.type,
            })

        return Response({
            'student': {
                'id': str(student.id),
                'name': student.display_name,
                'matricule': student.display_matricule,
                'admission_number': student.admission_number,
            },
            'current_class': {
                'id': str(current_class.id) if current_class else None,
                'name': current_class.name if current_class else student.student_class,
                'sub_school_name': current_class.sub_school.name if current_class and current_class.sub_school_id else 'Main School',
                'class_level': student.class_level,
                'section': student.section,
                'academic_year': current_academic_year,
                'subjects': current_subjects,
            },
            'history': [
                _history_record_payload(student, record)
                for record in history_records
            ],
        })

    @action(detail=False, methods=['get'])
    def honour_roll(self, request):
        """Get students on honour roll for the requesting user's school"""
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied("Only school staff can view honour roll.")

        school = request.user.school
        honour_roll_threshold = get_school_honour_roll_threshold(school)

        students = Student.objects.filter(
            school=school,
            annual_average__gte=honour_roll_threshold
        )
        if request.user.role == 'TEACHER':
            students = students.filter(id__in=self.get_queryset().values_list('id', flat=True))
        students = students.order_by('-annual_average')

        serializer = self.get_serializer(students, many=True)
        return Response(serializer.data)

    def _promotion_academic_year(self, request):
        academic_year = (
            request.query_params.get('academic_year')
            or request.data.get('academic_year')
            or ''
        ).strip()
        if academic_year:
            return academic_year
        try:
            return request.user.school.settings.academic_year
        except Exception:
            return str(timezone.now().year)

    def _promotion_average_from_request(self, request):
        school = request.user.school
        raw_value = request.data.get('promotion_average', request.data.get('threshold'))
        if raw_value in [None, '']:
            return get_school_promotion_average(school)
        try:
            promotion_average = Decimal(str(raw_value))
        except (InvalidOperation, TypeError, ValueError):
            raise ValidationError({'promotion_average': 'Promotion average must be a number between 0 and 20.'})
        if promotion_average < Decimal('0') or promotion_average > Decimal('20'):
            raise ValidationError({'promotion_average': 'Promotion average must be between 0 and 20.'})
        settings_obj, _ = SchoolSettings.objects.get_or_create(school=school)
        settings_obj.promotion_average = promotion_average
        settings_obj.save(update_fields=['promotion_average'])
        return promotion_average

    def _ensure_promotion_admin(self, request):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied('Only the school principal, school admin, or sub-admin can manage promotions.')
        if not request.user.school_id:
            raise PermissionDenied('Your account is not linked to a school.')

    @action(detail=False, methods=['get'], url_path='promotions')
    def promotions(self, request):
        """Filter the annual promotion registry for the school."""
        self._ensure_promotion_admin(request)
        academic_year = self._promotion_academic_year(request)
        if str(request.query_params.get('refresh', '')).lower() in {'1', 'true', 'yes'}:
            default_average = get_school_promotion_average(request.user.school)
            students = Student.objects.filter(school=request.user.school).select_related('user', 'school_class')
            for student in students:
                promotion_average = _promotion_average_for_student(student, academic_year, default_average)
                _build_promotion_record(student, academic_year, promotion_average)

        queryset = StudentPromotionRecord.objects.filter(
            school=request.user.school,
            academic_year=academic_year,
        ).select_related(
            'student__user',
            'current_class__sub_school',
            'promoted_to_class',
            'decided_by',
        )
        status_filter = (request.query_params.get('status') or '').upper()
        if status_filter:
            aliases = {
                'PROMOTED': StudentPromotionRecord.Status.PROMOTED,
                'REPEATED': StudentPromotionRecord.Status.REPEATED,
                'RETAINED': StudentPromotionRecord.Status.REPEATED,
                'GRADUATED': StudentPromotionRecord.Status.GRADUATED,
                'DISMISSED': StudentPromotionRecord.Status.DISMISSED,
                'EXPELLED': StudentPromotionRecord.Status.DISMISSED,
            }
            queryset = queryset.filter(status=aliases.get(status_filter, status_filter))
        class_id = request.query_params.get('class_id') or request.query_params.get('current_class')
        if class_id:
            queryset = queryset.filter(current_class_id=class_id)
        search = (request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(student__user__name__icontains=search)
                | Q(student__user__matricule__icontains=search)
                | Q(student__name__icontains=search)
                | Q(student__matricule__icontains=search)
                | Q(student__admission_number__icontains=search)
                | Q(current_class_name__icontains=search)
            )

        from .models import ClassPromotionPolicy

        default_promotion_average = get_school_promotion_average(request.user.school)
        class_promotion_average = default_promotion_average
        if class_id:
            class_policy = ClassPromotionPolicy.objects.filter(
                school=request.user.school,
                school_class_id=class_id,
                academic_year=academic_year,
            ).first()
            if class_policy:
                class_promotion_average = class_policy.promotion_average

        summary = {
            'total': queryset.count(),
            'promoted': StudentPromotionRecord.objects.filter(school=request.user.school, academic_year=academic_year, status=StudentPromotionRecord.Status.PROMOTED).count(),
            'repeated': StudentPromotionRecord.objects.filter(school=request.user.school, academic_year=academic_year, status=StudentPromotionRecord.Status.REPEATED).count(),
            'graduated': StudentPromotionRecord.objects.filter(school=request.user.school, academic_year=academic_year, status=StudentPromotionRecord.Status.GRADUATED).count(),
            'dismissed': StudentPromotionRecord.objects.filter(school=request.user.school, academic_year=academic_year, status=StudentPromotionRecord.Status.DISMISSED).count(),
            'promotion_average': float(default_promotion_average),
            'dismissal_average': float(get_school_dismissal_average(request.user.school)),
            'class_promotion_average': float(class_promotion_average),
            'academic_year': academic_year,
        }
        serializer = StudentPromotionRecordSerializer(queryset.order_by('current_class_name', 'student__user__name'), many=True)
        return Response({'summary': summary, 'results': serializer.data, 'count': len(serializer.data)})

    @action(detail=False, methods=['post'], url_path='recalculate-promotions')
    def recalculate_promotions(self, request):
        """Create/update promotion records from annual averages and the school threshold."""
        self._ensure_promotion_admin(request)
        academic_year = self._promotion_academic_year(request)
        raw_average = request.data.get('promotion_average', request.data.get('threshold'))
        default_promotion_average = get_school_promotion_average(request.user.school)
        students = Student.objects.filter(school=request.user.school).select_related('user', 'school_class')
        class_id = request.data.get('class_id')
        if class_id:
            students = students.filter(school_class_id=class_id)
            if raw_average not in [None, '']:
                try:
                    class_promotion_average = Decimal(str(raw_average))
                except (InvalidOperation, TypeError, ValueError):
                    raise ValidationError({'promotion_average': 'Promotion average must be a number between 0 and 20.'})
                if class_promotion_average < Decimal('0') or class_promotion_average > Decimal('20'):
                    raise ValidationError({'promotion_average': 'Promotion average must be between 0 and 20.'})
                school_class = get_object_or_404(SchoolClass, id=class_id, school=request.user.school)
                from .models import ClassPromotionPolicy

                ClassPromotionPolicy.objects.update_or_create(
                    school=request.user.school,
                    school_class=school_class,
                    academic_year=academic_year,
                    defaults={
                        'promotion_average': class_promotion_average,
                        'decided_by': request.user,
                    },
                )
            else:
                class_promotion_average = default_promotion_average
        else:
            class_promotion_average = self._promotion_average_from_request(request) if raw_average not in [None, ''] else default_promotion_average

        records = [
            _build_promotion_record(
                student,
                academic_year,
                _promotion_average_for_student(student, academic_year, class_promotion_average if class_id else default_promotion_average),
            )
            for student in students
        ]
        serializer = StudentPromotionRecordSerializer(records, many=True)
        return Response({
            'detail': f'{len(records)} promotion records recalculated.',
            'academic_year': academic_year,
            'promotion_average': float(class_promotion_average if class_id else default_promotion_average),
            'results': serializer.data,
        })

    @action(detail=False, methods=['post'], url_path='bulk-promote-selected')
    def bulk_promote_selected(self, request):
        """Move selected learners to the next class while preserving matricules."""
        self._ensure_promotion_admin(request)
        academic_year = self._promotion_academic_year(request)
        promotion_ids = request.data.get('promotion_ids') or []
        student_ids = request.data.get('student_ids') or []
        override_class_id = request.data.get('promoted_to_class_id') or request.data.get('target_class_id')

        records = StudentPromotionRecord.objects.filter(school=request.user.school, academic_year=academic_year).select_related(
            'student__user',
            'student__school_class',
            'promoted_to_class',
        )
        if promotion_ids:
            records = records.filter(id__in=promotion_ids)
        elif student_ids:
            records = records.filter(student_id__in=student_ids)
        else:
            return Response({'detail': 'Select at least one student to promote.'}, status=status.HTTP_400_BAD_REQUEST)

        override_class = None
        if override_class_id:
            override_class = get_object_or_404(SchoolClass, id=override_class_id, school=request.user.school)

        promoted = []
        graduated = []
        failed = []
        for record in records:
            student = record.student
            if override_class:
                target_class = override_class
            elif record.status == StudentPromotionRecord.Status.PROMOTED and record.promoted_to_class_id:
                target_class = record.promoted_to_class
            else:
                target_class = _next_class_for_student(student)
            if not target_class:
                # Nothing above the learner's class means they have finished the
                # school, not that the promotion failed. Someone leaving Upper
                # Sixth graduates; only a genuine gap in the middle of the ladder
                # is an error worth reporting.
                current_class_name = (
                    student.school_class.name if student.school_class_id else student.student_class
                )
                if _is_final_class(student, current_class_name):
                    record.promoted_to_class = None
                    record.promoted_to_class_name = ''
                    record.status = StudentPromotionRecord.Status.GRADUATED
                    record.decided_by = request.user
                    record.decided_at = timezone.now()
                    record.decision_reason = 'Completed the final class and graduated.'
                    record.save()
                    graduated.append(record)
                    _notify_promotion_outcome(
                        student,
                        promoted=True,
                        graduated=True,
                        from_class_name=current_class_name,
                        to_class_name=current_class_name,
                        academic_year=academic_year,
                        sender=request.user,
                    )
                    continue
                failed.append({
                    'student': str(student.id),
                    'name': student.display_name,
                    'reason': 'No next class is configured for this learner.',
                })
                continue

            previous_class_name = (
                student.school_class.name if student.school_class_id else student.student_class
            )

            student.school_class = target_class
            # Saving re-points the learner at the new class: Student.save syncs
            # subject enrolments and fee records to it, and the timetable and
            # class lists follow because they are queried by school_class.
            student.save()

            record.promoted_to_class = target_class
            record.promoted_to_class_name = target_class.name
            record.status = StudentPromotionRecord.Status.PROMOTED
            record.decided_by = request.user
            record.decided_at = timezone.now()
            record.decision_reason = 'Manually promoted by school administration after review.'
            record.save()
            promoted.append(record)

            _notify_promotion_outcome(
                student,
                promoted=True,
                from_class_name=previous_class_name,
                to_class_name=target_class.name,
                academic_year=academic_year,
                sender=request.user,
            )

        detail = f'{len(promoted)} student(s) promoted. Matricules were preserved.'
        if graduated:
            detail += f' {len(graduated)} student(s) completed the final class and graduated.'
        return Response({
            'promoted_count': len(promoted),
            'graduated_count': len(graduated),
            'failed_count': len(failed),
            'failed': failed,
            'results': StudentPromotionRecordSerializer(promoted + graduated, many=True).data,
            'detail': detail,
        })

    @action(detail=False, methods=['get'], url_path='performance-report')
    def performance_report(self, request):
        """
        End-of-term or end-of-year performance, ready to read out or print.

        Averages come from the marks actually recorded — every score for the
        year, or only the chosen term's sequences — so the report reflects what
        teachers have entered rather than waiting on a compiled annual result.

        Returns the best and weakest learner in the school, and the top and
        bottom three of every class, each with their average.
        """
        self._ensure_promotion_admin(request)
        school = request.user.school
        academic_year = request.query_params.get('academic_year') or _current_academic_year_for_school(school)
        term = request.query_params.get('term') or ''
        top_n = max(1, min(int(request.query_params.get('top') or 3), 10))

        from django.db.models import Avg, Count
        from apps.grades.models import Grade

        # A learner "passes" the year (or term) when their average reaches the
        # same threshold the school promotes on — so the pass/fail tally lines up
        # with who actually moves up.
        pass_mark = float(get_school_promotion_average(school))

        grades = Grade.objects.filter(student__school=school)
        if academic_year:
            grades = grades.filter(sequence__academic_year=academic_year)
        if term:
            grades = grades.filter(sequence__term=term)

        rows = (
            grades.values(
                'student_id',
                'student__user__name',
                'student__user__matricule',
                'student__name',
                'student__matricule',
                'student__student_class',
                'student__school_class_id',
            )
            .annotate(average=Avg('score'), marks=Count('id'))
            .order_by('-average')
        )

        learners = [
            {
                'student_id': str(row['student_id']),
                'name': row['student__user__name'] or row['student__name'] or '',
                'matricule': row['student__user__matricule'] or row['student__matricule'] or '',
                'class_name': row['student__student_class'] or '',
                'class_id': str(row['student__school_class_id']) if row['student__school_class_id'] else '',
                'average': round(float(row['average'] or 0), 2),
                'marks_recorded': row['marks'],
                'passed': round(float(row['average'] or 0), 2) >= pass_mark,
            }
            for row in rows
        ]

        # An annual report (no term chosen) also reports how many learners were
        # promoted or held back, drawn from the promotion decisions on record for
        # the year — per class and for the school as a whole.
        is_annual = not term
        promoted_by_class = {}
        repeated_by_class = {}
        promoted_total = 0
        repeated_total = 0
        if is_annual and academic_year:
            promotion_rows = (
                StudentPromotionRecord.objects.filter(
                    school=school, academic_year=academic_year,
                )
                .exclude(status=StudentPromotionRecord.Status.PENDING)
                .values('status', 'current_class_name', 'student__student_class')
            )
            for record in promotion_rows:
                class_name = record['current_class_name'] or record['student__student_class'] or 'Unassigned'
                # Graduating learners moved up out of the school, so they count as
                # promoted rather than repeated.
                if record['status'] in (
                    StudentPromotionRecord.Status.PROMOTED,
                    StudentPromotionRecord.Status.GRADUATED,
                ):
                    promoted_by_class[class_name] = promoted_by_class.get(class_name, 0) + 1
                    promoted_total += 1
                elif record['status'] == StudentPromotionRecord.Status.REPEATED:
                    repeated_by_class[class_name] = repeated_by_class.get(class_name, 0) + 1
                    repeated_total += 1

        # Class tables, each ordered best first so top and bottom are just ends.
        by_class = {}
        for learner in learners:
            by_class.setdefault(learner['class_name'] or 'Unassigned', []).append(learner)

        classes = []
        for class_name, members in sorted(by_class.items()):
            ordered = sorted(members, key=lambda item: item['average'], reverse=True)
            averages = [item['average'] for item in ordered]
            passed = sum(1 for item in ordered if item['passed'])
            entry = {
                'class_name': class_name,
                'student_count': len(ordered),
                'passed_count': passed,
                'failed_count': len(ordered) - passed,
                'class_average': round(sum(averages) / len(averages), 2) if averages else 0,
                'top': [dict(item, position=index + 1) for index, item in enumerate(ordered[:top_n])],
                # Weakest first, so the bottom table reads worst to least-worst.
                'bottom': [
                    dict(item, position=len(ordered) - index)
                    for index, item in enumerate(list(reversed(ordered))[:top_n])
                ],
            }
            if is_annual:
                entry['promoted_count'] = promoted_by_class.get(class_name, 0)
                entry['repeated_count'] = repeated_by_class.get(class_name, 0)
            classes.append(entry)

        school_averages = [item['average'] for item in learners]
        passed_total = sum(1 for item in learners if item['passed'])
        payload = {
            'academic_year': academic_year,
            'term': term or 'All terms',
            'scope': 'Term' if term else 'Academic year',
            'is_annual': is_annual,
            'pass_mark': pass_mark,
            'student_count': len(learners),
            'passed_count': passed_total,
            'failed_count': len(learners) - passed_total,
            'school_average': round(sum(school_averages) / len(school_averages), 2) if school_averages else 0,
            'best': learners[0] if learners else None,
            'weakest': learners[-1] if learners else None,
            'classes': classes,
        }
        if is_annual:
            payload['promoted_count'] = promoted_total
            payload['repeated_count'] = repeated_total
        return Response(payload)

    @action(detail=False, methods=['post'], url_path='bulk-repeat-selected')
    def bulk_repeat_selected(self, request):
        """
        Commit the decision that selected learners repeat their current class.

        The mirror of bulk-promote-selected. A repeat leaves the learner where
        they are, so nothing about their class changes — what this adds is the
        moment the decision becomes final, which is what the learner and their
        guardians are told about.
        """
        self._ensure_promotion_admin(request)
        academic_year = self._promotion_academic_year(request)
        promotion_ids = request.data.get('promotion_ids') or []
        student_ids = request.data.get('student_ids') or []

        records = StudentPromotionRecord.objects.filter(
            school=request.user.school, academic_year=academic_year,
        ).select_related('student__user', 'student__school_class', 'current_class')
        if promotion_ids:
            records = records.filter(id__in=promotion_ids)
        elif student_ids:
            records = records.filter(student_id__in=student_ids)
        else:
            return Response(
                {'detail': 'Select at least one student to mark as repeating.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        repeated = []
        for record in records:
            student = record.student
            current_class = student.school_class if student.school_class_id else record.current_class
            current_class_name = current_class.name if current_class else student.student_class

            record.promoted_to_class = current_class
            record.promoted_to_class_name = current_class_name
            record.status = StudentPromotionRecord.Status.REPEATED
            record.decided_by = request.user
            record.decided_at = timezone.now()
            record.decision_reason = 'Marked as repeating by school administration after review.'
            record.save()
            repeated.append(record)

            _notify_promotion_outcome(
                student,
                promoted=False,
                from_class_name=current_class_name,
                to_class_name=current_class_name,
                academic_year=academic_year,
                sender=request.user,
            )

        return Response({
            'repeated_count': len(repeated),
            'results': StudentPromotionRecordSerializer(repeated, many=True).data,
            'detail': f'{len(repeated)} student(s) marked as repeating. Their class is unchanged.',
        })

    @action(detail=False, methods=['get'])
    def registry_summary(self, request):
        """Return school-level student and parent registry counters."""
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied("Only school staff can view student registry summaries.")

        school = request.user.school
        if not school:
            raise PermissionDenied("Your account is not linked to a school.")

        students = Student.objects.filter(
            Q(school=school) | Q(user__school=school)
        ).distinct()
        if request.user.role == 'TEACHER':
            students = self.get_queryset()
        student_accounts = User.objects.filter(
            role='STUDENT'
        ).filter(
            Q(school=school) | Q(student_profile__school=school)
        ).distinct()
        parent_accounts = User.objects.filter(role='PARENT', school=school).distinct()
        linked_students = students.filter(parent_links__isnull=False).distinct()
        honour_roll_threshold = get_school_honour_roll_threshold(school)
        honour_roll_students = students.filter(
            Q(is_on_honour_roll=True) | Q(annual_average__gte=honour_roll_threshold)
        ).distinct()

        return Response(
            {
                'active_enrollment': student_accounts.count(),
                'student_profiles': students.count(),
                'student_accounts': student_accounts.count(),
                'parent_accounts': parent_accounts.count(),
                'students_linked': linked_students.count(),
                'honour_roll_count': honour_roll_students.count(),
            }
        )

    @action(detail=False, methods=['get'])
    def my_children(self, request):
        """For PARENT role, returns linked students"""
        if request.user.role != 'PARENT':
            raise PermissionDenied("Only parents can use this action.")

        linked_links = ParentStudentLink.objects.filter(parent=request.user).select_related(
            'student__user',
            'student__school',
            'student__school_class',
        ).prefetch_related('student__parent_links__parent')
        linked_students = [link.student for link in linked_links]
        guardian_students = [
            link.student
            for link in StudentGuardian.objects.filter(guardian__user=request.user).select_related(
                'student__user',
                'student__school',
                'student__school_class',
            )
        ]
        seen_ids = set()
        students = []
        for student in [*linked_students, *guardian_students]:
            if student.id in seen_ids:
                continue
            seen_ids.add(student.id)
            students.append(student)

        serializer = StudentDetailSerializer(students, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def link_parent(self, request, pk=None):
        """Link a parent user to a student"""
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Only school administrators can link parents.")

        student = self.get_object()
        parent_id = request.data.get('parent_id')
        relationship = request.data.get('relationship')
        is_primary = request.data.get('is_primary', False)
        parent_name = (request.data.get('parent_name') or request.data.get('name') or student.guardian_name or '').strip()
        parent_email = (request.data.get('parent_email') or '').strip()
        parent_phone = (request.data.get('parent_phone') or student.guardian_phone or '').strip()
        parent_whatsapp = (request.data.get('parent_whatsapp') or student.guardian_whatsapp or '').strip()

        if not relationship:
            return Response(
                {'error': 'relationship is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        parent_created = False

        if parent_id:
            try:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                parent = User.objects.get(id=parent_id, role='PARENT', school=student.school)
            except User.DoesNotExist:
                return Response(
                    {'error': 'Parent user not found.'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            try:
                parent, parent_created = get_or_create_parent_account(
                    school=student.school,
                    name=parent_name,
                    email=parent_email,
                    phone=parent_phone,
                    whatsapp=parent_whatsapp,
                )
            except ValidationError as exc:
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        try:
            _, guardian_link, link = sync_parent_student_relationship(
                student=student,
                parent=parent,
                relationship=relationship,
                is_primary=is_primary,
                can_pickup=True,
                emergency_contact=is_primary,
            )
        except ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        serializer = ParentStudentLinkSerializer(link, context=self.get_serializer_context())
        payload = {
            **serializer.data,
            'guardian_link_id': str(guardian_link.id),
            'parent_created': parent_created,
            'parent_matricule': getattr(parent, 'matricule', None),
        }
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def student_card(self, request, pk=None):
        """Returns student ID card data (for QR generation)"""
        student = self.get_object()
        if not student.qr_code:
            student.generate_qr_code()
        admission_year = str(student.admission_date.year) if student.admission_date else ''
        data = {
            'admission_number': student.admission_number,
            'matricule': student.display_matricule,
            'name': student.display_name,
            'class': student.student_class,
            'section': student.section,
            'date_of_birth': student.date_of_birth,
            'gender': student.gender,
            'email': student.display_email,
            'school': str(student.school),
            'school_matricule': student.school.matricule,
            'admission_year': admission_year,
            'academic_year': admission_year,
            'qr_code': student.qr_code if student.qr_code else None,
            # Added for the Basic Education card (all read through display_*
            # helpers so pupils without a login work).
            'class_level': student.class_level,
            'place_of_birth': student.place_of_birth,
            'guardian_name': student.guardian_name,
            'guardian_phone': student.guardian_phone,
            'avatar': student.display_avatar or '',
            'school_logo': student.school.logo or '',
            'academic_year_label': getattr(
                getattr(student.school, 'settings', None), 'academic_year', ''
            ) or '',
        }
        return Response(data)

    @action(detail=True, methods=['get'])
    def admission_form(self, request, pk=None):
        """Download a simple admission document for the student."""
        student = self.get_object()
        school = student.school
        document = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Admission Form - {student.display_name}</title></head>
<body style="font-family:Arial,sans-serif;padding:32px;color:#111;">
  <h1 style="margin:0 0 8px;">{school.name}</h1>
  <p style="margin:0 0 24px;">Student Admission Record</p>
  <table style="border-collapse:collapse;width:100%;max-width:720px;">
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Student Name</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.display_name}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Matricule</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.display_matricule}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Admission Number</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.admission_number}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Class</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.student_class}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Class Level</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.class_level}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Section</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.section}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Email</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.display_email}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Guardian Name</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.guardian_name or '-'}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Guardian Phone</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.guardian_phone or '-'}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Admission Date</strong></td><td style="padding:8px;border:1px solid #ddd;">{student.admission_date}</td></tr>
  </table>
  <p style="margin-top:24px;">This student can activate the account with the matricule above and complete the remaining personal information after first login.</p>
</body>
</html>"""
        response = HttpResponse(document, content_type='text/html')
        response['Content-Disposition'] = f'attachment; filename="admission_{student.display_matricule}.html"'
        return response

    @action(detail=False, methods=['post'])
    def bulk_upload(self, request):
        """Generate student activation matricules for a class or bulk create students from CSV."""
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Only school administrators and sub-admins can bulk register students.")

        generation_count = int(request.data.get('generation_count') or request.data.get('count') or 0)
        sub_school_id = request.data.get('sub_school')
        school_class_id = request.data.get('school_class')
        school_class = None
        hierarchy_has_sub_schools = SchoolClass.objects.filter(school=request.user.school, sub_school__isnull=False).exists()
        if school_class_id:
            school_class = SchoolClass.objects.select_related('sub_school').filter(id=school_class_id, school=request.user.school).first()
            if not school_class:
                return Response({'detail': 'Selected class was not found in your school.'}, status=status.HTTP_400_BAD_REQUEST)
            if sub_school_id and str(school_class.sub_school_id or '') != str(sub_school_id):
                return Response({'detail': 'Selected class does not belong to the selected sub-school.'}, status=status.HTTP_400_BAD_REQUEST)
        elif sub_school_id and generation_count:
            return Response({'detail': 'Select a class inside the chosen sub-school before generating matricules.'}, status=status.HTTP_400_BAD_REQUEST)
        student_class = (school_class.name if school_class else request.data.get('student_class', '').strip())
        if school_class:
            # A registered class decides its own level and section.
            derived = enforced_class_fields(school_class)
            class_level = derived['class_level']
            section = derived.get('section') or request.data.get('section', '') or 'General'
        else:
            class_level = request.data.get('class_level', '') or self._infer_class_level(student_class)
            section = request.data.get('section', '') or self._infer_section(student_class)
        department = request.data.get('department', '').strip()
        stream = request.data.get('stream', '').strip()
        batch_name = request.data.get('batch_name', '').strip() or student_class

        if generation_count:
            if hierarchy_has_sub_schools and not sub_school_id:
                return Response(
                    {'detail': 'Select the sub-school first so matricules stay tied to the correct hierarchy.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if SchoolClass.objects.filter(school=request.user.school).exists() and not school_class:
                return Response(
                    {'detail': 'Select the registered class before generating matricules.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not student_class:
                return Response(
                    {'detail': 'student_class is required for matricule generation.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if generation_count < 1:
                return Response(
                    {'detail': 'generation_count must be at least 1.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if generation_count > 500:
                return Response(
                    {'detail': 'generation_count cannot exceed 500 in one batch.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from django.utils import timezone as _tz
            import datetime as _dt

            helper = StudentCreateSerializer()
            generated_tokens = []
            for _ in range(generation_count):
                token = StudentActivationToken.objects.create(
                    school=request.user.school,
                    school_class=school_class,
                    matricule=self._generate_activation_matricule(request.user.school, school_class),
                    student_class=student_class,
                    class_level=class_level,
                    section=section,
                    department=department,
                    stream=stream,
                    batch_name=batch_name,
                    generated_by=request.user,
                )
                # Create a live, ACTIVE account immediately so the student exists in
                # the system (report cards, ID cards, fees) without self-activation.
                # The password stays unusable until the student activates with this
                # matricule to set their own password (ActivateAccountView handles it).
                try:
                    account = User.objects.create_user(
                        matricule=token.matricule,
                        name=f'Student {token.matricule}',
                        email=helper._generate_placeholder_email(token.matricule),
                        role='STUDENT',
                        school=request.user.school,
                        password=None,
                    )
                    student = Student.objects.create(
                        user=account,
                        school=request.user.school,
                        school_class=school_class,
                        student_class=student_class,
                        class_level=class_level,
                        section=section,
                        guardian_name='',
                        guardian_phone='',
                        guardian_whatsapp='',
                        admission_number=helper._generate_admission_number(request.user.school),
                        admission_date=_dt.date.today(),
                        gender='other',
                    )
                    try:
                        student.generate_qr_code()
                    except Exception:  # noqa: BLE001
                        pass
                    token.is_used = True
                    token.used_at = _tz.now()
                    token.used_by = account
                    token.save(update_fields=['is_used', 'used_at', 'used_by', 'modified'])
                except Exception:  # noqa: BLE001 — a single failed account must not abort the batch
                    logger.exception("Auto-account creation failed for matricule %s", token.matricule)
                generated_tokens.append(token)

            return Response(
                {
                    'created_count': len(generated_tokens),
                    'failed_count': 0,
                    'detail': f'{len(generated_tokens)} activation matricules generated for {student_class}.',
                    'generated_students': StudentActivationTokenSerializer(generated_tokens, many=True).data,
                    'document_html': self._render_activation_sheet_document(
                        request.user.school,
                        generated_tokens,
                        batch_name or student_class,
                    ),
                },
                status=status.HTTP_201_CREATED,
            )

        upload = request.FILES.get('file')
        if not upload:
            return Response(
                {'detail': 'Provide generation_count to generate matricules or upload a CSV file.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            decoded = upload.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response({'detail': 'Unable to read the uploaded file. Use UTF-8 CSV.'}, status=status.HTTP_400_BAD_REQUEST)

        created_students = []
        failed_rows = []

        base_payload = {
            'school_class': str(school_class.id) if school_class else None,
            'student_class': student_class,
            'class_level': class_level,
            'section': section,
            'admission_date': request.data.get('admission_date') or timezone.now().date(),
            'guardian_name': request.data.get('guardian_name', ''),
            'guardian_phone': request.data.get('guardian_phone', ''),
            'guardian_whatsapp': request.data.get('guardian_whatsapp', ''),
        }

        if not base_payload['student_class']:
            return Response(
                {'detail': 'student_class is required for bulk upload.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for index, row in self._iter_upload_rows(decoded):
            if not any(str(value).strip() for value in row.values()):
                continue

            normalized_row = {str(key).strip().lower(): value for key, value in row.items() if key is not None}

            row_payload = {
                **base_payload,
                'name': self._extract_name_from_row(normalized_row),
                'email': (normalized_row.get('email') or normalized_row.get('student_email') or '').strip(),
                'phone': (normalized_row.get('phone') or normalized_row.get('telephone') or '').strip(),
                'whatsapp': (normalized_row.get('whatsapp') or normalized_row.get('whatsapp_number') or '').strip(),
                'admission_number': (normalized_row.get('admission_number') or normalized_row.get('admission_no') or '').strip(),
                'class_level': (
                    (normalized_row.get('class_level') or normalized_row.get('level') or normalized_row.get('form') or '').strip()
                    or base_payload['class_level']
                    or self._infer_class_level(base_payload['student_class'])
                ),
                'section': (
                    (normalized_row.get('section') or normalized_row.get('department') or normalized_row.get('stream') or '').strip().lower()
                    or base_payload['section']
                    or self._infer_section(base_payload['student_class'])
                ),
                'guardian_name': (normalized_row.get('guardian_name') or normalized_row.get('parent_name') or base_payload['guardian_name'] or '').strip(),
                'guardian_phone': (normalized_row.get('guardian_phone') or normalized_row.get('parent_phone') or base_payload['guardian_phone'] or '').strip(),
                'guardian_whatsapp': (normalized_row.get('guardian_whatsapp') or normalized_row.get('parent_whatsapp') or base_payload['guardian_whatsapp'] or '').strip(),
            }

            serializer = StudentCreateSerializer(data=row_payload, context=self.get_serializer_context())
            if serializer.is_valid():
                student = serializer.save()
                created_students.append({
                    'id': str(student.id),
                    'name': student.display_name,
                    'matricule': student.display_matricule,
                    'admission_number': student.admission_number,
                })
            else:
                readable_errors = self._flatten_error_messages(serializer.errors)
                failed_rows.append({
                    'row': index,
                    'name': row_payload['name'],
                    'reason': " | ".join(readable_errors) if readable_errors else "This row failed validation.",
                    'errors': serializer.errors,
                })

        detail_message = (
            f"{len(created_students)} students created. {len(failed_rows)} rows failed."
            if failed_rows
            else f"{len(created_students)} students created successfully."
        )

        return Response(
            {
                'created_count': len(created_students),
                'failed_count': len(failed_rows),
                'created_students': created_students,
                'failed_rows': failed_rows,
                'detail': detail_message,
                'activation_sheet_url': f'/api/v1/students/students/activation_sheet/?class_name={base_payload["student_class"]}',
            },
            status=status.HTTP_201_CREATED if created_students else status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=False, methods=['get'])
    def activation_sheet(self, request):
        """Download activation list containing student names and matricules."""
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied("Only school staff can download activation sheets.")

        class_name = request.query_params.get('class_name')
        token_queryset = StudentActivationToken.objects.filter(school=request.user.school)
        if class_name:
            token_queryset = token_queryset.filter(student_class=class_name)

        generated_tokens = list(token_queryset.order_by('student_class', 'matricule'))
        if generated_tokens:
            document = self._render_activation_sheet_document(
                request.user.school,
                generated_tokens,
                class_name or 'All Classes',
            )
            response = HttpResponse(document, content_type='text/html')
            filename_suffix = (class_name or 'all_classes').replace(' ', '_')
            response['Content-Disposition'] = f'attachment; filename="student_activation_sheet_{filename_suffix}.html"'
            return response

        students = self.get_queryset()
        if class_name:
            students = students.filter(student_class=class_name)

        lines = ['name,matricule,admission_number,class_name']
        for student in students.select_related('user').order_by('student_class', 'user__name'):
            lines.append(
                f'"{student.display_name}","{student.display_matricule}","{student.admission_number}","{student.student_class}"'
            )

        response = HttpResponse('\n'.join(lines), content_type='text/csv')
        filename_suffix = (class_name or 'all_classes').replace(' ', '_')
        response['Content-Disposition'] = f'attachment; filename="student_activation_sheet_{filename_suffix}.csv"'
        return response

    @action(detail=False, methods=['get'])
    def class_list(self, request):
        """All students in a specified class"""
        class_name = request.query_params.get('class_name')
        if not class_name:
            return Response(
                {'error': 'class_name query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied("Only school staff can view class lists.")

        students = self.get_queryset().filter(Q(student_class=class_name) | Q(school_class__name=class_name)).distinct()
        serializer = self.get_serializer(students, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def class_options(self, request):
        """The classes the caller can pick a student from, for Class -> Student selectors.

        Built from the same scoped queryset as the student list, so a teacher is
        only offered the classes they teach and a sub-admin only their
        sub-school's classes. Students still carrying only a legacy class name
        (no registered class) are grouped under that name.
        """
        rows = (
            self.get_queryset()
            .order_by()
            # 'id' keeps one row per student: the scoped queryset is DISTINCT,
            # which would otherwise fold a whole class into a single row.
            .values('id', 'school_class_id', 'school_class__name', 'student_class')
        )
        classes = {}
        for row in rows:
            class_id = row['school_class_id']
            name = (row['school_class__name'] if class_id else row['student_class']) or ''
            if not name.strip():
                continue
            key = str(class_id) if class_id else f'name:{name}'
            entry = classes.setdefault(key, {
                'id': str(class_id) if class_id else None,
                'name': name,
                'student_count': 0,
            })
            entry['student_count'] += 1
        return Response(sorted(classes.values(), key=lambda item: item['name'].lower()))

    @action(detail=False, methods=['get'])
    def picker(self, request):
        """A light list of the students in one class: id, name and admission number.

        Staff must narrow to a class (``school_class`` id, or ``class_name`` for
        students without a registered class) so a selector never pulls the whole
        school. Parents and students are already scoped to a handful of records.
        ``search`` matches name or admission number.
        """
        queryset = self.get_queryset()
        class_id = (request.query_params.get('school_class') or '').strip()
        class_name = (request.query_params.get('class_name') or '').strip()
        if class_id:
            try:
                queryset = queryset.filter(school_class_id=uuid.UUID(class_id))
            except ValueError:
                raise ValidationError({'school_class': 'Invalid class id.'})
        elif class_name:
            queryset = queryset.filter(school_class__isnull=True, student_class=class_name)
        elif request.user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise ValidationError({'school_class': 'Choose a class first.'})

        search = (request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(Q(user__name__icontains=search) | Q(name__icontains=search) | Q(admission_number__icontains=search))

        rows = queryset.order_by('user__name', 'admission_number').values(
            'id', 'user__name', 'name', 'admission_number', 'school_class_id', 'school_class__name', 'student_class',
        )
        return Response([
            {
                'id': str(row['id']),
                'full_name': row['user__name'] or row['name'] or '',
                'admission_number': row['admission_number'] or '',
                'school_class_id': str(row['school_class_id']) if row['school_class_id'] else None,
                'class_name': row['school_class__name'] or row['student_class'] or '',
            }
            for row in rows
        ])


class ParentStudentLinkViewSet(viewsets.ModelViewSet):
    queryset = ParentStudentLink.objects.select_related('parent', 'student')
    serializer_class = ParentStudentLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = ParentStudentLink.objects.select_related('parent', 'student')

        if user.role == 'SCHOOL_ADMIN' or user.role == 'SUB_ADMIN':
            queryset = queryset.filter(student__school=user.school)
        elif user.role == 'PARENT':
            queryset = queryset.filter(parent=user)
        elif user.role == 'STUDENT':
            queryset = queryset.filter(student__user=user)
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Only school administrators can create parent-student links.")
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Only school administrators can delete parent-student links.")
        return super().destroy(request, *args, **kwargs)


def _student_guardian_access_error(request, school_id, write=False):
    user = request.user
    if user.is_platform_executive:
        return None
    if getattr(user, 'school_id', None) != school_id:
        return Response({'detail': 'You can only access guardians in your own school.'}, status=status.HTTP_403_FORBIDDEN)
    if write and user.role not in {'SCHOOL_ADMIN', 'SUB_ADMIN'}:
        return Response({'detail': 'Only school administrators can manage guardian links.'}, status=status.HTTP_403_FORBIDDEN)
    return None


class StudentGuardianCollectionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, school_id, student_id):
        student = get_object_or_404(
            Student.objects.select_related('school', 'user').prefetch_related('guardian_links__guardian'),
            id=student_id,
            school_id=school_id,
        )
        error = _student_guardian_access_error(request, student.school_id)
        if error:
            return error
        serializer = StudentGuardianSerializer(student.guardian_links.select_related('guardian').all(), many=True)
        return Response(serializer.data)

    def post(self, request, school_id, student_id):
        student = get_object_or_404(Student.objects.select_related('school', 'user'), id=student_id, school_id=school_id)
        error = _student_guardian_access_error(request, student.school_id, write=True)
        if error:
            return error

        guardian_id = request.data.get('guardian_id')
        parent_user_id = request.data.get('user_id') or request.data.get('parent_user_id') or request.data.get('parent_id')
        relationship = request.data.get('relationship') or 'legal_guardian'
        if relationship not in dict(Guardian.RELATIONSHIP_CHOICES):
            return Response({'relationship': 'Choose a valid relationship.'}, status=status.HTTP_400_BAD_REQUEST)

        if guardian_id:
            guardian = get_object_or_404(Guardian.objects.select_related('user'), id=guardian_id)
        elif parent_user_id:
            parent_user = get_object_or_404(User, id=parent_user_id, role='PARENT')
            if parent_user.school_id and str(parent_user.school_id) != str(student.school_id):
                return Response(
                    {'parent_user_id': 'Selected parent does not belong to this school.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not parent_user.school_id:
                parent_user.school = student.school
                parent_user.save(update_fields=['school'])
            guardian, _ = Guardian.objects.update_or_create(
                user=parent_user,
                defaults={
                    'name': parent_user.get_full_name() or parent_user.name or parent_user.email,
                    'phone': parent_user.phone or request.data.get('phone', '') or '',
                    'whatsapp': parent_user.whatsapp or request.data.get('whatsapp', '') or '',
                    'email': parent_user.email or request.data.get('email', '') or '',
                    'national_id': request.data.get('national_id', '') or '',
                    'occupation': request.data.get('occupation', '') or '',
                },
            )
        else:
            serializer = GuardianSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            guardian = serializer.save()

        is_primary = str(request.data.get('is_primary', '')).lower() in {'true', '1', 'yes', 'on'}
        link, created = StudentGuardian.objects.update_or_create(
            student=student,
            guardian=guardian,
            defaults={
                'relationship': relationship,
                'is_primary': is_primary,
                'can_pickup': str(request.data.get('can_pickup', 'true')).lower() in {'true', '1', 'yes', 'on'},
                'emergency_contact': str(request.data.get('emergency_contact', '')).lower() in {'true', '1', 'yes', 'on'},
            },
        )

        if guardian.user_id and guardian.user.role == 'PARENT':
            parent_relationship = relationship if relationship in dict(ParentStudentLink.RELATIONSHIP_CHOICES) else 'guardian'
            ParentStudentLink.objects.update_or_create(
                parent=guardian.user,
                student=student,
                defaults={'relationship': parent_relationship, 'is_primary': is_primary},
            )

        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(StudentGuardianSerializer(link).data, status=status_code)


class StudentGuardianDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, school_id, student_id, guardian_id):
        student = get_object_or_404(Student, id=student_id, school_id=school_id)
        error = _student_guardian_access_error(request, student.school_id, write=True)
        if error:
            return error
        StudentGuardian.objects.filter(student=student, guardian_id=guardian_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GuardianStudentsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, guardian_id=None):
        parent_linked_students = []
        if guardian_id is None:
            guardian = Guardian.objects.filter(user=request.user).first()
            if request.user.role == 'PARENT':
                parent_linked_students = [
                    link.student
                    for link in ParentStudentLink.objects.filter(parent=request.user).select_related(
                        'student__user',
                        'student__school',
                        'student__school_class',
                    )
                ]
        else:
            guardian = get_object_or_404(Guardian, id=guardian_id)
            if not request.user.is_platform_executive and guardian.user_id != request.user.id:
                return Response({'detail': 'You can only view your own linked students.'}, status=status.HTTP_403_FORBIDDEN)

        guardian_students = []
        if guardian:
            guardian_students = [
                link.student
                for link in StudentGuardian.objects.filter(guardian=guardian).select_related(
                    'student__user',
                    'student__school',
                    'student__school_class',
                )
            ]

        seen_ids = set()
        students = []
        for student in [*parent_linked_students, *guardian_students]:
            if student.id in seen_ids:
                continue
            seen_ids.add(student.id)
            students.append(student)
        return Response(StudentDetailSerializer(students, many=True).data)

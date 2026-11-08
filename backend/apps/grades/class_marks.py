"""One-screen class marks grid for Basic Education class teachers.

A primary class teacher enters the marks of ALL subjects of his/her class in a
single table (rows = pupils, per subject a CA box and an Exam box). No parallel
marks table: the existing ``Grade`` rows (student, subject, sequence) are the
storage. A term of the school's calendar has (at least) two sequences; the
first one is the "CA" column and the second one the "Exam" column. The subject
average is the mean of the available marks, the overall average is weighted by
the subject coefficient and the grade comes from the school's assessment
config, exactly like ``calculate_period_average`` / the report card does.

Basic schools only; class teachers reach only the classes of
``apps.schools.class_teaching.basic_class_ids_for_teacher``.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.registry.permissions import RequiresApp
from apps.schools.class_teaching import basic_class_ids_for_teacher, is_basic_school
from apps.schools.models import SchoolClass
from apps.students import api as students_api

from .assessment_config import get_assessment_config
from .models import ClassSubject, Grade, Sequence, StudentSubjectEnrollment
from .serializers import validate_teacher_active_term
from .views import _current_academic_year_for_school, _student_platform_charge_is_paid

CENT = Decimal('0.01')
FIELDS = ('ca', 'exam')


def _q2(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def _num(value):
    """JSON-friendly number (None stays None)."""
    return None if value is None else float(value)


def _require_class_teacher(request):
    user = request.user
    if user.role != 'TEACHER' or not getattr(user, 'school_id', None):
        raise PermissionDenied('Only class teachers can use the class marks grid.')
    if not is_basic_school(user.school):
        raise PermissionDenied('The class marks grid is only available for basic education schools.')
    return user


def _teacher_class(user, class_id):
    """Class of the teacher's own school that he/she teaches as a whole."""
    allowed = basic_class_ids_for_teacher(user)
    if not class_id:
        if len(allowed) == 1:
            class_id = next(iter(allowed))
        else:
            raise ValidationError({'class_id': 'Choose a class.'})
    try:
        school_class = SchoolClass.objects.get(id=class_id, school_id=user.school_id)
    except (SchoolClass.DoesNotExist, ValueError, TypeError, DjangoValidationError):
        raise PermissionDenied('You are not the class teacher of this class.')
    if school_class.id not in allowed:
        raise PermissionDenied('You are not the class teacher of this class.')
    return school_class


def _current_academic_year(school):
    active = Sequence.objects.filter(school=school, is_active=True).order_by('-academic_year').first()
    if active:
        return active.academic_year
    year = _current_academic_year_for_school(school)
    if year:
        return year
    latest = Sequence.objects.filter(school=school).order_by('-academic_year').first()
    return latest.academic_year if latest else ''


def _term_number(raw, school, academic_year):
    if raw in (None, ''):
        active = Sequence.objects.filter(school=school, academic_year=academic_year, is_active=True).first()
        return active.term if active else 1
    try:
        term = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({'term': 'Term must be 1, 2 or 3.'})
    if term not in (1, 2, 3):
        raise ValidationError({'term': 'Term must be 1, 2 or 3.'})
    return term


def _term_sequences(school, academic_year, term):
    """(ca_sequence, exam_sequence) of a term: first and second sequence by date."""
    sequences = list(
        Sequence.objects.filter(school=school, academic_year=academic_year, term=term).order_by('start_date', 'name')
    )
    if not sequences:
        raise ValidationError({'term': 'This term has no assessment period yet. Ask your administrator to set up the school calendar.'})
    return sequences[0], (sequences[1] if len(sequences) > 1 else None)


def _class_students(school_class):
    students = students_api.list_students(school=school_class.school_id).filter(
        Q(school_class_id=school_class.id)
        | Q(school_class__isnull=True, student_class=school_class.name)
    )
    return sorted(students, key=lambda s: (s.display_name or '').lower())


def _class_subjects(school_class):
    return list(
        ClassSubject.objects.select_related('subject')
        .filter(school_class=school_class, subject__is_active=True)
        .order_by('subject__name')
    )


def _competition_ranks(averages):
    """{key: rank}; equal averages share a rank, the next rank is skipped."""
    ordered = sorted((v, k) for k, v in averages.items() if v is not None)
    ranks = {}
    for value, key in ordered:
        ranks[key] = 1 + sum(1 for other, _ in ordered if other > value)
    return ranks


def build_grid(user, school_class, term, academic_year=None):
    school = user.school
    config = get_assessment_config(school)
    academic_year = academic_year or _current_academic_year(school)
    ca_seq, exam_seq = _term_sequences(school, academic_year, term)
    sequences = [s for s in (ca_seq, exam_seq) if s]
    students = _class_students(school_class)
    class_subjects = _class_subjects(school_class)
    subject_ids = [cs.subject_id for cs in class_subjects]

    grades = Grade.objects.filter(
        student__in=[s.id for s in students],
        subject_id__in=subject_ids,
        sequence__in=sequences,
    ).filter(Q(school_class_id=school_class.id) | Q(class_name_snapshot=school_class.name))
    marks = {}
    for grade in grades:
        slot = 'ca' if grade.sequence_id == ca_seq.id else 'exam'
        marks[(grade.student_id, grade.subject_id, slot)] = Decimal(str(grade.score))

    inactive = set(
        StudentSubjectEnrollment.objects.filter(
            student__in=[s.id for s in students], class_subject__in=class_subjects, is_active=False
        ).values_list('student_id', 'class_subject__subject_id')
    )

    overall = {}
    rows = []
    for student in students:
        weighted = Decimal('0')
        total_coefficient = Decimal('0')
        cells = {}
        for cs in class_subjects:
            ca = marks.get((student.id, cs.subject_id, 'ca'))
            exam = marks.get((student.id, cs.subject_id, 'exam'))
            present = [v for v in (ca, exam) if v is not None]
            subject_average = (sum(present, Decimal('0')) / len(present)) if present else None
            if subject_average is not None:
                coefficient = config.coefficient(cs.subject)
                weighted += subject_average * coefficient
                total_coefficient += coefficient
            cells[str(cs.subject_id)] = {
                'ca': _num(ca),
                'exam': _num(exam),
                'average': _num(_q2(subject_average)) if subject_average is not None else None,
                'locked': (student.id, cs.subject_id) in inactive,
            }
        average = _q2(weighted / total_coefficient) if total_coefficient > 0 else None
        overall[student.id] = average
        rows.append({
            '_sid': student.id,
            'id': str(student.id),
            'name': student.display_name,
            'admission_number': student.admission_number,
            'has_login': bool(student.user_id),
            'marks': cells,
            'average': average,
        })

    ranks = _competition_ranks(overall) if config.show_rank else {}
    graded = [v for v in overall.values() if v is not None]
    for row in rows:
        average = row['average']
        row['rank'] = ranks.get(row.pop('_sid'))
        row['grade'] = config.label(average) if average is not None else None
        row['remark'] = config.remark(average) if average is not None else None
        row['passed'] = config.is_pass(average) if average is not None else None
        row['average'] = _num(average)

    try:
        validate_teacher_active_term(user, ca_seq)
        can_edit = True
    except Exception:  # noqa: BLE001 - previous/future terms are view-only
        can_edit = False

    return {
        'class': {'id': str(school_class.id), 'name': school_class.name},
        'academic_year': academic_year,
        'term': term,
        'terms': [1, 2, 3],
        'max_score': _num(config.max_score),
        'pass_mark': _num(config.pass_mark),
        'show_rank': config.show_rank,
        'ca_sequence': {'id': str(ca_seq.id), 'name': ca_seq.name},
        'exam_sequence': {'id': str(exam_seq.id), 'name': exam_seq.name} if exam_seq else None,
        'can_edit': can_edit,
        'subjects': [
            {
                'id': str(cs.subject_id),
                'class_subject_id': str(cs.id),
                'name': cs.subject.name,
                'code': cs.subject.code,
                'coefficient': _num(config.coefficient(cs.subject)),
            }
            for cs in class_subjects
        ],
        'students': rows,
        'class_average': _num(_q2(sum(graded, Decimal('0')) / len(graded))) if graded else None,
    }


def _teacher_classes_payload(user):
    ids = basic_class_ids_for_teacher(user)
    return [
        {'id': str(c.id), 'name': c.name}
        for c in SchoolClass.objects.filter(id__in=ids, school_id=user.school_id).order_by('name')
    ]


class ClassMarksGridView(APIView):
    """GET ?class_id=&term=1|2|3 -> pupils x subjects grid with computed average/rank/grade."""

    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]

    def get(self, request):
        user = _require_class_teacher(request)
        classes = _teacher_classes_payload(user)
        if not request.query_params.get('class_id') and not classes:
            return Response({'classes': [], 'grid': None})
        school_class = _teacher_class(user, request.query_params.get('class_id'))
        academic_year = _current_academic_year(user.school)
        term = _term_number(request.query_params.get('term'), user.school, academic_year)
        grid = build_grid(user, school_class, term, academic_year)
        return Response({'classes': classes, 'grid': grid})


class ClassMarksSaveView(APIView):
    """POST {class_id, term, entries:[{student, subject, field:'ca'|'exam', score|null}]}.

    Autosave friendly: one or many cells. A null/empty score clears the cell.
    Returns the refreshed grid so ranks and averages are always current.
    """

    permission_classes = [permissions.IsAuthenticated, RequiresApp('grades')]

    def post(self, request):
        user = _require_class_teacher(request)
        school_class = _teacher_class(user, request.data.get('class_id'))
        academic_year = _current_academic_year(user.school)
        term = _term_number(request.data.get('term'), user.school, academic_year)
        ca_seq, exam_seq = _term_sequences(user.school, academic_year, term)
        validate_teacher_active_term(user, ca_seq)

        entries = request.data.get('entries')
        if not isinstance(entries, list) or not entries:
            raise ValidationError({'entries': 'At least one mark is required.'})

        config = get_assessment_config(user.school)
        maximum = config.max_score
        max_label = f'{maximum.normalize():f}'
        students = {str(s.id): s for s in _class_students(school_class)}
        class_subjects = {str(cs.subject_id): cs for cs in _class_subjects(school_class)}

        cleaned = []
        errors = []
        for index, entry in enumerate(entries, start=1):
            if not isinstance(entry, dict):
                errors.append(f'Row {index}: invalid entry.')
                continue
            student = students.get(str(entry.get('student')))
            class_subject = class_subjects.get(str(entry.get('subject')))
            field = entry.get('field')
            if student is None:
                errors.append(f'Row {index}: pupil not found in this class.')
                continue
            if class_subject is None:
                errors.append(f'Row {index}: subject is not taught in this class.')
                continue
            if field not in FIELDS:
                errors.append(f'Row {index}: field must be "ca" or "exam".')
                continue
            sequence = ca_seq if field == 'ca' else exam_seq
            if sequence is None:
                errors.append(f'Row {index}: this term has no exam period.')
                continue
            raw = entry.get('score')
            if raw is None or (isinstance(raw, str) and not raw.strip()):
                score = None
            else:
                try:
                    score = Decimal(str(raw).strip().replace(',', '.'))
                    if not score.is_finite():
                        raise InvalidOperation
                except (InvalidOperation, ValueError):
                    errors.append(f'Row {index}: mark must be a number between 0 and {max_label}.')
                    continue
                if score < 0 or score > maximum:
                    errors.append(f'Row {index}: mark must be between 0 and {max_label}.')
                    continue
            if not _student_platform_charge_is_paid(student):
                errors.append(f'Row {index}: {student.display_name} has unpaid platform charges.')
                continue
            if StudentSubjectEnrollment.objects.filter(
                student=student, class_subject=class_subject, is_active=False
            ).exists():
                errors.append(f'Row {index}: this optional subject was removed for {student.display_name}.')
                continue
            cleaned.append((student, class_subject, sequence, score))
        if errors:
            raise ValidationError({'entries': errors})

        with transaction.atomic():
            for student, class_subject, sequence, score in cleaned:
                lookup = dict(student=student, subject=class_subject.subject, sequence=sequence)
                if score is None:
                    Grade.objects.filter(**lookup).delete()
                    continue
                Grade.objects.update_or_create(
                    **lookup,
                    defaults={
                        'school': user.school,
                        'school_class': school_class,
                        'class_name_snapshot': school_class.name,
                        'score': score,
                        'teacher': user,
                    },
                )

        grid = build_grid(user, school_class, term, academic_year)
        return Response({'saved': len(cleaned), 'grid': grid}, status=status.HTTP_200_OK)

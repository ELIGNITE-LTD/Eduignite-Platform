from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Q, Avg
from apps.students import api as students_api
from .assessment_config import get_assessment_config
from .models import AssessmentArea, AssessmentRating, Grade, TermResult, Sequence


def _resolve_class_scope(student, school_class=None, class_name=None):
    if school_class is None and class_name is None:
        school_class = getattr(student, 'school_class', None)
        class_name = (
            school_class.name
            if getattr(student, 'school_class_id', None) and school_class
            else getattr(student, 'student_class', '') or ''
        )
    class_id = getattr(school_class, 'id', None) or school_class
    return class_id, class_name or ''


def _class_scoped_grades(queryset, student, school_class=None, class_name=None):
    class_id, resolved_name = _resolve_class_scope(student, school_class, class_name)
    class_filter = Q()
    if class_id:
        class_filter |= Q(school_class_id=class_id)
    if resolved_name:
        class_filter |= Q(class_name_snapshot=resolved_name)
    if class_filter:
        return queryset.filter(class_filter)
    return queryset


def _class_cohort(student, school_class=None, class_name=None):
    class_id, resolved_name = _resolve_class_scope(student, school_class, class_name)
    cohort = students_api.list_students(school=student.school)
    class_filter = Q()
    if class_id:
        class_filter |= Q(school_class_id=class_id)
    if resolved_name:
        class_filter |= Q(student_class=resolved_name)
    return cohort.filter(class_filter).distinct() if class_filter else cohort.filter(id=student.id)


def calculate_sequence_average(student, sequence, school_class=None, class_name=None):
    """Calculate weighted average for a student in a sequence"""
    grades = Grade.objects.filter(student=student, sequence=sequence).select_related('subject')
    grades = _class_scoped_grades(grades, student, school_class, class_name)

    if not grades.exists():
        return Decimal('0.00')

    config = get_assessment_config(student.school)
    total_weighted = Decimal('0.00')
    total_coefficient = Decimal('0.00')

    for grade in grades:
        coefficient = config.coefficient(grade.subject)
        score = Decimal(str(grade.score))
        total_weighted += score * coefficient
        total_coefficient += coefficient

    if total_coefficient == 0:
        return Decimal('0.00')

    average = total_weighted / total_coefficient
    return average.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def calculate_term_average(student, term, academic_year, school_class=None, class_name=None):
    """Calculate term average from all sequences in a Cameroon term."""
    sequences = Sequence.objects.filter(
        school=student.school,
        term=term,
        academic_year=academic_year
    )
    return calculate_period_average(student, sequences, school_class=school_class, class_name=class_name)


def calculate_period_average(student, sequences, school_class=None, class_name=None):
    """Calculate weighted average for a set of sequences.

    Cameroon secondary term reports combine two sequence marks. For each subject,
    use the average of the student's available sequence marks, then apply the
    subject coefficient to compute the period average on the school's configured
    scale (0-20 by default; coefficients are ignored when the school turns them off).
    """
    config = get_assessment_config(getattr(student, 'school', None))
    sequence_ids = [sequence.id for sequence in sequences]
    if not sequence_ids:
        return Decimal('0.00')

    grades = Grade.objects.filter(
        student=student,
        sequence_id__in=sequence_ids,
    ).select_related('subject')
    grades = _class_scoped_grades(grades, student, school_class, class_name)

    subject_scores = {}
    for grade in grades:
        bucket = subject_scores.setdefault(grade.subject_id, {
            'subject': grade.subject,
            'scores': [],
        })
        bucket['scores'].append(Decimal(str(grade.score)))

    total_weighted = Decimal('0.00')
    total_coefficient = Decimal('0.00')
    for item in subject_scores.values():
        scores = item['scores']
        if not scores:
            continue
        coefficient = config.coefficient(item['subject'])
        subject_average = sum(scores, Decimal('0.00')) / Decimal(len(scores))
        total_weighted += subject_average * coefficient
        total_coefficient += coefficient

    if total_coefficient == 0:
        return Decimal('0.00')

    return (total_weighted / total_coefficient).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def calculate_annual_average(student, academic_year):
    """Calculate annual average from all term averages"""
    term_results = TermResult.objects.filter(
        student=student,
        academic_year=academic_year
    ).exclude(average=Decimal('0.00'))

    if not term_results.exists():
        return Decimal('0.00')

    total = sum([Decimal(str(tr.average)) for tr in term_results])
    count = term_results.count()

    annual_avg = total / count
    return annual_avg.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def compute_rank(student, sequence, school_class=None, class_name=None):
    """Compute rank in class for a sequence"""
    student_average = calculate_sequence_average(student, sequence, school_class=school_class, class_name=class_name)

    if student_average == 0:
        return None

    cohort = _class_cohort(student, school_class=school_class, class_name=class_name)

    rank = sum(
        1
        for classmate in cohort
        if classmate.id != student.id and calculate_sequence_average(
            classmate,
            sequence,
            school_class=school_class,
            class_name=class_name,
        ) > student_average
    )

    return rank + 1


def compute_period_rank(student, sequences, school_class=None, class_name=None):
    """Compute class rank for a term/period from the period average."""
    student_average = calculate_period_average(student, sequences, school_class=school_class, class_name=class_name)

    if student_average == 0:
        return None

    cohort = _class_cohort(student, school_class=school_class, class_name=class_name)

    rank = sum(
        1
        for classmate in cohort
        if classmate.id != student.id and calculate_period_average(
            classmate,
            sequences,
            school_class=school_class,
            class_name=class_name,
        ) > student_average
    )

    return rank + 1


def _school_payload(school):
    return {
        'id': str(school.id),
        'name': school.name,
        'short_name': school.short_name,
        'motto': school.motto,
        'logo': school.logo,
        'region': school.region,
        'division': school.division,
        'department': school.division,
        'sub_division': school.sub_division,
        'location': school.location,
        'address': school.address,
        'postal_code': getattr(school, 'postal_code', '') or '',
        'phone': getattr(school, 'phone', '') or '',
        'email': getattr(school, 'email', '') or '',
        'matricule': school.matricule,
        'principal': school.principal,
        'academic_year': getattr(getattr(school, 'settings', None), 'academic_year', ''),
    }


def _class_teacher_name(school_class, school):
    """Class teacher shown on report cards.

    Basic Education: the lead assigned class teacher, then any assigned one, then the
    class master. Everyone else: the class master (unchanged).
    """
    if school_class is None:
        return ''
    if getattr(school, 'education_category', None) == 'basic':
        try:
            assignment = (
                school_class.teacher_assignments.select_related('teacher')
                .order_by('-is_lead', 'teacher__name').first()
            )
        except Exception:  # noqa: BLE001
            assignment = None
        if assignment and assignment.teacher_id:
            return assignment.teacher.get_full_name()
    class_master = getattr(school_class, 'class_master', None)
    return class_master.get_full_name() if class_master else ''


def _student_payload(student):
    school_class = getattr(student, 'school_class', None)
    class_master = getattr(school_class, 'class_master', None) if school_class else None
    return {
        'id': str(student.id),
        'name': student.display_name,
        'admission_number': student.admission_number,
        'matricule': student.display_matricule,
        'class': school_class.name if school_class else student.student_class,
        'student_class': school_class.name if school_class else student.student_class,
        'class_name': school_class.name if school_class else student.student_class,
        'school_class': {
            'id': str(school_class.id),
            'name': school_class.name,
            'cycle': school_class.cycle,
            'cycle_label': school_class.get_cycle_display(),
            'sub_school_name': school_class.sub_school.name if school_class.sub_school_id else '',
        } if school_class else None,
        'cycle': school_class.cycle if school_class else '',
        'cycle_label': school_class.get_cycle_display() if school_class else '',
        'class_master': class_master.get_full_name() if class_master else '',
        'class_teacher': _class_teacher_name(school_class, student.school),
        'level': student.class_level,
        'section': student.section,
        'gender': student.get_gender_display() if hasattr(student, 'get_gender_display') else student.gender,
        'sex': student.gender,
        'date_of_birth': student.date_of_birth.isoformat() if student.date_of_birth else '',
        'place_of_birth': getattr(student, 'place_of_birth', ''),
        'admission_date': student.admission_date.isoformat() if student.admission_date else '',
        'guardian_name': student.guardian_name,
        'guardian_phone': student.guardian_phone,
        'avatar': student.display_avatar,
        'photo': student.display_avatar,
        'school': _school_payload(student.school),
    }


def _attendance_payload(student, sequences=None):
    try:
        from apps.attendance import api as attendance_api
    except Exception:
        return {}

    sequence_list = list(sequences or [])
    sequence_dates = [
        date_value
        for sequence in sequence_list
        for date_value in [sequence.start_date, sequence.end_date]
        if date_value
    ]
    # Basic Education uses the daily class register: one record is one school day.
    counts = attendance_api.attendance_summary(
        student,
        start=min(sequence_dates) if sequence_dates else None,
        end=max(sequence_dates) if sequence_dates else None,
        daily_only=getattr(student.school, 'education_category', None) == 'basic',
    )
    present = counts['present']
    absent = counts['absent']
    excused = counts['excused']
    late = counts['late']
    return {
        'present': present,
        'present_days': present,
        'days_present': present,
        'absent': absent,
        'absent_days': absent,
        'days_absent': absent,
        'unjustified_absences': absent,
        'excused': excused,
        'excused_days': excused,
        'justified_absences': excused,
        'late': late,
        'late_coming': late,
        'warning': '',
        'reprimand': '',
        'suspension_days': '',
        'conduct_remark': '',
    }


def _class_profile_stats(student, average_function, average_args, school_class=None, class_name=None):
    config = get_assessment_config(student.school)
    if not config.show_average:
        return {'class_average': '', 'min_average': '', 'max_average': '', 'success_rate': ''}
    cohort = list(_class_cohort(student, school_class=school_class, class_name=class_name))
    averages = [
        average_function(classmate, *average_args, school_class=school_class, class_name=class_name)
        for classmate in cohort
    ]
    ranked = [average for average in averages if average > Decimal('0.00')]
    if not ranked:
        return {
            'class_average': '',
            'min_average': '',
            'max_average': '',
            'success_rate': '',
        }
    class_average = (sum(ranked, Decimal('0.00')) / Decimal(len(ranked))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    min_average = min(ranked).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    max_average = max(ranked).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    pass_count = sum(1 for average in ranked if config.is_pass(average))
    success_rate = (Decimal(pass_count) / Decimal(len(ranked)) * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return {
        'class_average': float(class_average),
        'min_average': float(min_average),
        'max_average': float(max_average),
        'success_rate': int(success_rate),
    }


def build_report_card_verification(student, academic_year, term=None, sequence=None):
    """Build the public verify URL for a report card and a scannable QR data URL.

    The QR encodes a link to the school platform's public verification page, so
    anyone scanning the printed card sees the same report card online, anytime.
    """
    from django.conf import settings
    from urllib.parse import quote

    # Point the QR at the public FRONTEND verify page (exactly like the student
    # ID card QR does), so a scan opens the report card on the website — not the
    # raw API.
    frontend = getattr(settings, 'FRONTEND_URL', 'https://eduignite.online').rstrip('/')
    adm = quote(str(student.admission_number or ''), safe='')
    # Academic years like "2025/2026" contain a slash; encoded as %2F it gets
    # decoded back by proxies and splits the URL path, producing a 404 on scan.
    # Use a dash slug instead — the verify endpoints accept both forms.
    year = quote(str(academic_year or '').replace('/', '-'), safe='')
    key = f'seq-{sequence.id}' if sequence is not None else f'term-{term}'
    verify_url = f'{frontend}/verify/report-card/{adm}/{year}/{key}'
    # Admission numbers repeat across schools, so the scan must say which school.
    school_ref = getattr(student.school, 'matricule', None) or getattr(student, 'school_id', '')
    if school_ref:
        verify_url += f'?school={quote(str(school_ref), safe="")}'

    qr_data_url = ''
    try:
        import base64 as _b64
        from io import BytesIO
        import qrcode

        qr = qrcode.QRCode(version=None, box_size=8, border=2)
        qr.add_data(verify_url)
        qr.make(fit=True)
        image = qr.make_image(fill_color='black', back_color='white').convert('RGB')
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        qr_data_url = 'data:image/png;base64,' + _b64.b64encode(buffer.getvalue()).decode('ascii')
    except Exception:  # noqa: BLE001
        pass

    return {'verify_url': verify_url, 'qr_code': qr_data_url}


def get_grade_letter(score, config=None):
    """Convert a mark to its grade (letter, or label for descriptive grading).

    With no ``config`` this is the Cameroon 0-20 scale: >=16 A, >=14 B, >=12 C, >=10 D, else F.
    """
    return (config or get_assessment_config(None)).label(score)


def get_remark(score, config=None):
    """Word remark shown in the report card's Remark column."""
    return (config or get_assessment_config(None)).remark(score)


def _auto_principal_remark(average, config=None):
    """A sensible default principal's remark based on the general average.

    The cutoffs are the 0-20 ones; other scales are mapped by percentage.
    """
    average = float(average or 0)
    if config is not None and config.max_score != 20:
        average = float(config.percent(average) * 20 / 100)
    if average >= 16:
        return 'Brilliant performance. You are a model student.'
    if average >= 14:
        return 'Keep up the excellent performance and continue working hard for greater success.'
    if average >= 12:
        return 'Impressive work this term. Keep aiming higher.'
    if average >= 10:
        return 'A satisfactory term. More effort will bring even better results.'
    return 'Results are below expectation. Serious effort is required next term.'


def _subject_positions(student, sequence_ids, cohort_ids):
    """Rank of `student` within the class for every subject, averaged across the
    given sequences. Returns { subject_id(str): rank(int) }."""
    if not sequence_ids or not cohort_ids:
        return {}
    rows = (
        Grade.objects.filter(student_id__in=cohort_ids, sequence_id__in=sequence_ids)
        .values('student_id', 'subject_id')
        .annotate(avg=Avg('score'))
    )
    by_subject = {}
    for row in rows:
        by_subject.setdefault(str(row['subject_id']), []).append((str(row['student_id']), float(row['avg'] or 0)))
    target = str(student.id)
    positions = {}
    for subject_id, entries in by_subject.items():
        entries.sort(key=lambda item: item[1], reverse=True)
        for index, (student_id, _avg) in enumerate(entries, start=1):
            if student_id == target:
                positions[subject_id] = index
                break
    return positions


def _subject_class_averages(sequence_ids, cohort_ids):
    """Class mean per subject across the given sequences. Returns { subject_id(str): float }."""
    if not sequence_ids or not cohort_ids:
        return {}
    rows = (
        Grade.objects.filter(student_id__in=cohort_ids, sequence_id__in=sequence_ids)
        .values('subject_id')
        .annotate(avg=Avg('score'))
    )
    return {
        str(row['subject_id']): float(Decimal(str(row['avg'])).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
        for row in rows if row['avg'] is not None
    }


def _honour_roll_threshold(school):
    """Minimum general average to qualify for the honour roll."""
    try:
        value = getattr(getattr(school, 'settings', None), 'honour_roll_threshold', None)
        if value is not None:
            return get_assessment_config(school).scale_from_20(Decimal(str(value)))
    except Exception:  # noqa: BLE001
        pass
    return get_assessment_config(school).scale_from_20(Decimal('16.00'))


def report_layout(student):
    """'nursery' | 'primary' | 'secondary', from the class cycle (basic schools without one: primary)."""
    cycle = getattr(getattr(student, 'school_class', None), 'cycle', '') or ''
    if cycle == 'nursery':
        return 'nursery'
    if cycle == 'primary':
        return 'primary'
    return 'primary' if getattr(student.school, 'education_category', None) == 'basic' else 'secondary'


def _nursery_areas_payload(student, config, term, academic_year):
    """Developmental areas with the pupil's level for the term (nursery layout)."""
    levels = list(config.nursery_scale)
    ratings = {}
    if term and academic_year:
        ratings = {
            r.area_id: r.level
            for r in AssessmentRating.objects.filter(student=student, academic_year=academic_year, term=term)
        }
    areas = []
    for area in AssessmentArea.objects.filter(school=student.school, active=True):
        level = ratings.get(area.id)
        label, label_fr = levels[level - 1] if level and 1 <= level <= len(levels) else ('', '')
        areas.append({
            'id': str(area.id),
            'name': area.name,
            'name_fr': area.name_fr,
            'order': area.order_index,
            'level': level,
            'label': label,
            'label_fr': label_fr,
        })
    return {
        'areas': areas,
        'nursery_scale': [{'level': i, 'label': l, 'label_fr': fr} for i, (l, fr) in enumerate(levels, start=1)],
    }


def _apply_display_toggles(data, config):
    """Blank the sections a school has switched off (showSubjectPosition, showClassAverage, ...)."""
    if not config.show_subject_position:
        for row in data.get('grades', []):
            row['position'] = None
    if not config.show_class_average:
        for key in ('class_average', 'min_average', 'max_average', 'success_rate'):
            if key in data:
                data[key] = ''
    if not config.show_attendance:
        data['attendance'] = {}
    if not config.show_conduct:
        if 'conduct' in data:
            data['conduct'] = ''
    if not config.show_promotion:
        data['promotion_status'] = ''
        if 'is_promoted' in data:
            data['is_promoted'] = None
    return data


def _report_extras(student, config, average, total_score, total_coefficient, academic_year, term,
                   teacher_comment='', headmaster_comment=''):
    """Additive report-card fields shared by the sequence and term builders.

    Covers the Basic Education report-card checklist (grading scale, label,
    totals, class/section/year, teacher and headmaster comments, signature
    placeholders). Existing keys are never replaced.
    """
    payload = _student_payload(student)
    school = student.school
    return {
        'assessment': config.to_dict(),
        'grading_style': config.grading_style,
        'max_score': float(config.max_score),
        'pass_mark': float(config.pass_mark),
        'show_rank': config.show_rank,
        'use_coefficients': config.use_coefficients,
        'show_average': config.show_average,
        'average_label': config.label(average) if average else '',
        'average_label_fr': config.descriptive_label_fr(average) if (average and config.is_descriptive) else '',
        'assessment_mode': config.assessment_mode,
        'total_marks': float(total_score.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)) if config.show_average else None,
        'total_coefficient': float(total_coefficient),
        'academic_year': academic_year or '',
        'term_number': term,
        'class_name': payload.get('class_name', ''),
        'section': payload.get('section', ''),
        'education_category': getattr(school, 'education_category', ''),
        'layout': report_layout(student),
        'branding': {'color': config.brand_color, 'language': config.report_language},
        'promotion_decision': None,
        'show_coefficients': config.show_coefficients,
        'show_subject_position': config.show_subject_position,
        'show_class_average': config.show_class_average,
        'show_attendance': config.show_attendance,
        'show_conduct': config.show_conduct,
        'show_promotion': config.show_promotion,
        'teacher_comment': teacher_comment or '',
        'headmaster_comment': headmaster_comment or '',
        'signatures': {
            'class_teacher': {'name': payload.get('class_teacher', ''), 'signature': ''},
            'headmaster': {'name': school.principal or '', 'signature': ''},
            'parent': {'name': payload.get('guardian_name', '') or '', 'signature': ''},
        },
    }


def generate_report_card_data(student, sequence, school_class=None, class_name=None):
    """Generate complete report card data for a student in a sequence"""
    config = get_assessment_config(student.school)
    grades = Grade.objects.filter(student=student, sequence=sequence).select_related('subject')
    grades = _class_scoped_grades(grades, student, school_class, class_name)

    grades_data = []
    total_score = Decimal('0.00')
    total_coefficient = Decimal('0.00')

    # Per-subject class position + remark, exactly like the term/period card, so
    # the sequence report card also shows each subject's position and remark.
    cohort_students = _class_cohort(student, school_class=school_class, class_name=class_name)
    cohort_ids = [str(pk) for pk in cohort_students.values_list('id', flat=True)]
    subject_positions = _subject_positions(student, [sequence.id], cohort_ids)
    subject_averages = _subject_class_averages([sequence.id], cohort_ids) if config.show_class_average else {}

    for grade in grades:
        coefficient = config.coefficient(grade.subject)
        score = Decimal(str(grade.score))
        total_score += score * coefficient
        total_coefficient += coefficient

        grades_data.append({
            'subject_id': str(grade.subject_id),
            'subject_name': grade.subject.name,
            'subject_code': grade.subject.code,
            'teacher_name': grade.teacher.get_full_name() if grade.teacher_id else '',
            'score': float(grade.score),
            'grade_letter': grade.get_grade_letter(config=config),
            'grade_label': grade.get_grade_letter(config=config),
            'grade_label_fr': config.label_fr(grade.score),
            'coefficient': float(coefficient),
            'total': float((score * coefficient).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            # Remarks are system-generated from the mark; the old hand-typed
            # per-subject comment is no longer shown on report cards.
            'comment': '',
            'remark': get_remark(score, config),
            'position': subject_positions.get(str(grade.subject_id)) if config.show_rank else None,
            'class_average': subject_averages.get(str(grade.subject_id)),
        })

    average = Decimal('0.00')
    if total_coefficient > 0:
        average = (total_score / total_coefficient).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    rank = compute_rank(student, sequence, school_class=school_class, class_name=class_name) if config.show_rank else None
    class_students = _class_cohort(student, school_class=school_class, class_name=class_name)

    total_students = class_students.count()
    profile_stats = _class_profile_stats(
        student,
        calculate_sequence_average,
        (sequence,),
        school_class=school_class,
        class_name=class_name,
    )

    data = {
        'school': _school_payload(student.school),
        'student': _student_payload(student),
        'sequence': {
            'name': sequence.name,
            'academic_year': sequence.academic_year,
            'term': sequence.term,
        },
        'grades': grades_data,
        'average': float(average) if config.show_average else None,
        'rank': rank,
        'total_students': total_students,
        'promotion_status': 'Promoted' if config.is_pass(average) else 'Requires Review',
        'attendance': _attendance_payload(student, [sequence]),
        # Honour-roll eligibility against the school's admin-set threshold, so
        # sequence report cards flag it exactly like term cards do.
        'honour_roll': bool(average >= _honour_roll_threshold(student.school)),
        'honor_roll': bool(average >= _honour_roll_threshold(student.school)),
        **profile_stats,
        **_report_extras(student, config, average, total_score, total_coefficient,
                         sequence.academic_year, sequence.term),
    }
    return _apply_display_toggles(data, config)


def generate_period_report_card_data(student, sequences, period_label, term=None, academic_year=None, school_class=None, class_name=None):
    """Generate report-card data for a Cameroon term or custom period."""
    config = get_assessment_config(student.school)
    sequence_list = list(sequences)
    sequence_ids = [sequence.id for sequence in sequence_list]
    grades = Grade.objects.filter(
        student=student,
        sequence_id__in=sequence_ids,
    ).select_related('subject', 'teacher', 'sequence')
    grades = _class_scoped_grades(grades, student, school_class, class_name)

    # Position of each sequence inside its term (0 = first evaluation: Test/CA, 1 = Exam ...).
    evaluation_index_by_sequence = {}
    _seen_in_term = {}
    for sequence in sorted(sequence_list, key=lambda item: (item.term, item.name)):
        evaluation_index_by_sequence[sequence.id] = _seen_in_term.get(sequence.term, 0)
        _seen_in_term[sequence.term] = _seen_in_term.get(sequence.term, 0) + 1

    subject_rows = {}
    for grade in grades:
        row = subject_rows.setdefault(grade.subject_id, {
            'subject_id': str(grade.subject_id),
            'subject_name': grade.subject.name,
            'subject_code': grade.subject.code,
            'teacher_name': grade.teacher.get_full_name() if grade.teacher_id else '',
            'coefficient': float(config.coefficient(grade.subject)),
            'scores': [],
            'sequence_scores': [],
            'comment': '',
        })
        score = Decimal(str(grade.score))
        row['scores'].append(score)
        evaluation_index = evaluation_index_by_sequence.get(grade.sequence_id, 0)
        row['sequence_scores'].append({
            'sequence_id': str(grade.sequence_id),
            'sequence_name': grade.sequence.name,
            'score': float(grade.score),
            'evaluation_label': config.evaluation_label(evaluation_index),
            'evaluation_label_fr': config.evaluation_label(evaluation_index, french=True),
        })
        if grade.teacher_id:
            row['teacher_name'] = grade.teacher.get_full_name()

    class_students = _class_cohort(student, school_class=school_class, class_name=class_name)
    cohort_ids = [str(pk) for pk in class_students.values_list('id', flat=True)]
    subject_positions = _subject_positions(student, sequence_ids, cohort_ids)
    subject_averages = _subject_class_averages(sequence_ids, cohort_ids) if config.show_class_average else {}

    grades_data = []
    total_score = Decimal('0.00')
    total_coefficient = Decimal('0.00')
    for row in subject_rows.values():
        scores = row.pop('scores')
        coefficient = Decimal(str(row['coefficient']))
        score = (sum(scores, Decimal('0.00')) / Decimal(len(scores))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        total_score += score * coefficient
        total_coefficient += coefficient
        row['score'] = float(score)
        row['average'] = float(score)
        row['grade_letter'] = get_grade_letter(score, config)
        row['grade_label'] = row['grade_letter']
        row['grade_label_fr'] = config.label_fr(score)
        row['remark'] = get_remark(score, config)
        row['position'] = subject_positions.get(row['subject_id']) if config.show_rank else None
        row['total'] = float((score * coefficient).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
        row['class_average'] = subject_averages.get(row['subject_id'])
        if not config.show_average:
            # Descriptive reports show the competency label only, no numeric marks.
            for key in ('score', 'average', 'total'):
                row[key] = None
            for item in row['sequence_scores']:
                item['score'] = None
        grades_data.append(row)

    average = Decimal('0.00')
    if total_coefficient > 0:
        average = (total_score / total_coefficient).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    rank = compute_period_rank(student, sequence_list, school_class=school_class, class_name=class_name) if config.show_rank else None
    profile_stats = _class_profile_stats(
        student,
        calculate_period_average,
        (sequence_list,),
        school_class=school_class,
        class_name=class_name,
    )

    # Term-level conduct / principal's remark, if the class master set one.
    term_result = None
    year = academic_year or (sequence_list[0].academic_year if sequence_list else '')
    if term and year:
        term_result = TermResult.objects.filter(student=student, term=term, academic_year=year).first()
    conduct = (term_result.conduct if term_result and term_result.conduct else 'Excellent')
    principal_remark = (
        term_result.principal_remark if term_result and term_result.principal_remark
        else _auto_principal_remark(average, config)
    )
    honour_roll = average >= _honour_roll_threshold(student.school)
    is_promoted = None
    if term_result and term_result.is_promoted is not None:
        is_promoted = term_result.is_promoted

    student_payload = _student_payload(student)

    data = {
        'school': _school_payload(student.school),
        'student': student_payload,
        'sequence': {
            'name': period_label,
            'academic_year': year,
            'term': term,
            'type': 'TERM',
            'sequences': [
                {
                    'id': str(sequence.id),
                    'name': sequence.name,
                    'term': sequence.term,
                    'academic_year': sequence.academic_year,
                }
                for sequence in sequence_list
            ],
        },
        'grades': grades_data,
        'average': float(average) if config.show_average else None,
        'rank': rank,
        'class_position': rank,
        'total_students': class_students.count(),
        'enrollment': class_students.count(),
        'cycle': student_payload.get('cycle', ''),
        'cycle_label': student_payload.get('cycle_label', ''),
        'class_master': student_payload.get('class_master', ''),
        'conduct': conduct,
        'principal_remark': principal_remark,
        'honour_roll': bool(honour_roll),
        'honor_roll': bool(honour_roll),
        'is_promoted': is_promoted,
        'promotion_status': ('Promoted' if (is_promoted if is_promoted is not None else config.is_pass(average)) else 'Requires Review'),
        'period_type': 'term',
        'attendance': _attendance_payload(student, sequence_list),
        **profile_stats,
        **_report_extras(
            student, config, average, total_score, total_coefficient, year, term,
            teacher_comment=(term_result.teacher_comment if term_result else ''),
            headmaster_comment=principal_remark,
        ),
    }
    if data['layout'] == 'nursery' and term:
        data.update(_nursery_areas_payload(student, config, term, year))
    return _apply_display_toggles(data, config)


def _promotion_decision(data, config, term):
    """'promoted' | 'repeat' | 'pending' on the final term, None otherwise.

    The school's own decision (TermResult.is_promoted) wins; otherwise a numeric
    report promotes when the annual average (term 3 average outside term-based mode)
    reaches the pass mark. Reports without a numeric average stay 'pending'.
    """
    if int(term) != 3:
        return None
    if data.get('is_promoted') is True:
        return 'promoted'
    if data.get('is_promoted') is False:
        return 'repeat'
    figure = data.get('annual_average') if config.is_term_based else data.get('average')
    if figure in (None, '') or not figure:
        return 'pending'
    return 'promoted' if Decimal(str(figure)) >= config.pass_mark else 'repeat'


def _term_based_annual_summary(student, academic_year, config, school_class, class_name, term):
    """Per-term averages and the annual average (mean of the three term averages)."""
    term_averages = {}
    for number in (1, 2, 3):
        sequences = Sequence.objects.filter(
            school=student.school, term=number, academic_year=academic_year,
        )
        term_averages[number] = calculate_period_average(
            student, sequences, school_class=school_class, class_name=class_name,
        )
    counted = [value for value in term_averages.values() if value > Decimal('0.00')]
    annual = Decimal('0.00')
    if counted:
        annual = (sum(counted, Decimal('0.00')) / Decimal(len(counted))).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP,
        )
    show = config.show_average
    return {
        'term_averages': {str(k): (float(v) if show else None) for k, v in term_averages.items()},
        'annual_average': float(annual) if show and annual > 0 else None,
        'annual_label': config.label(annual) if annual > 0 else '',
        'annual_label_fr': config.descriptive_label_fr(annual) if (annual > 0 and config.is_descriptive) else '',
    }


def generate_term_report_card_data(student, term, academic_year, school_class=None, class_name=None):
    """Generate a Cameroon term report card.

    Terms 1 and 2 use their own two sequences. Term 3 is the end-of-year report:
    it aggregates ALL sequences of the year (the six sequences) and carries the
    promotion status, matching the official third-term / annual card.
    """
    term = int(term)
    config = get_assessment_config(student.school)
    # Term-based mode (Basic Education): every term, including the third, is built
    # from its own evaluations; the annual average is the mean of the 3 term averages.
    if term == 3 and not config.is_term_based:
        sequences = Sequence.objects.filter(
            school=student.school,
            academic_year=academic_year,
        ).order_by('term', 'name')
    else:
        sequences = Sequence.objects.filter(
            school=student.school,
            term=term,
            academic_year=academic_year,
        ).order_by('name')
    data = generate_period_report_card_data(
        student,
        sequences,
        'Third Term Report' if term == 3 else f'Term {term} Report',
        term=term,
        academic_year=academic_year,
        school_class=school_class,
        class_name=class_name,
    )
    if config.is_term_based:
        data.update(_term_based_annual_summary(student, academic_year, config, school_class, class_name, term))
    data['promotion_decision'] = _promotion_decision(data, config, term)
    if not config.show_promotion:
        data['promotion_decision'] = None
    return data

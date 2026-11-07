from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Q, Avg
from apps.students import api as students_api
from .models import Grade, TermResult, Sequence


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

    total_weighted = Decimal('0.00')
    total_coefficient = Decimal('0.00')

    for grade in grades:
        coefficient = Decimal(str(grade.subject.coefficient))
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
    subject coefficient to compute the period average on the 0-20 scale.
    """
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
        coefficient = Decimal(str(item['subject'].coefficient))
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
        from apps.attendance.models import AttendanceRecord
    except Exception:
        return {}

    records = AttendanceRecord.objects.filter(student=student).select_related('session')
    sequence_list = list(sequences or [])
    sequence_dates = [
        date_value
        for sequence in sequence_list
        for date_value in [sequence.start_date, sequence.end_date]
        if date_value
    ]
    if sequence_dates:
        records = records.filter(session__date__gte=min(sequence_dates), session__date__lte=max(sequence_dates))

    present = records.filter(status='present').count()
    absent = records.filter(status='absent').count()
    excused = records.filter(status='excused').count()
    late = records.filter(status='late').count()
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
    pass_count = sum(1 for average in ranked if average >= Decimal('10.00'))
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


def get_grade_letter(score):
    """Convert numerical score to letter grade (Cameroon scale 0-20)"""
    score = float(score)
    if score >= 16:
        return 'A'
    elif score >= 14:
        return 'B'
    elif score >= 12:
        return 'C'
    elif score >= 10:
        return 'D'
    else:
        return 'F'


def get_remark(score):
    """Word remark shown in the report card's Remark column."""
    score = float(score)
    if score >= 16:
        return 'Excellent'
    if score >= 14:
        return 'Very Good'
    if score >= 12:
        return 'Good'
    if score >= 10:
        return 'Average'
    if score >= 8:
        return 'Poor'
    return 'Very Poor'


def _auto_principal_remark(average):
    """A sensible default principal's remark based on the general average."""
    average = float(average or 0)
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


def _honour_roll_threshold(school):
    """Minimum general average to qualify for the honour roll."""
    try:
        value = getattr(getattr(school, 'settings', None), 'honour_roll_threshold', None)
        if value is not None:
            return Decimal(str(value))
    except Exception:  # noqa: BLE001
        pass
    return Decimal('16.00')


def generate_report_card_data(student, sequence, school_class=None, class_name=None):
    """Generate complete report card data for a student in a sequence"""
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

    for grade in grades:
        coefficient = Decimal(str(grade.subject.coefficient))
        score = Decimal(str(grade.score))
        total_score += score * coefficient
        total_coefficient += coefficient

        grades_data.append({
            'subject_id': str(grade.subject_id),
            'subject_name': grade.subject.name,
            'subject_code': grade.subject.code,
            'teacher_name': grade.teacher.get_full_name() if grade.teacher_id else '',
            'score': float(grade.score),
            'grade_letter': grade.get_grade_letter(),
            'coefficient': float(grade.subject.coefficient),
            'total': float((score * coefficient).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
            'comment': grade.comment,
            'remark': get_remark(score),
            'position': subject_positions.get(str(grade.subject_id)),
        })

    average = Decimal('0.00')
    if total_coefficient > 0:
        average = (total_score / total_coefficient).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    rank = compute_rank(student, sequence, school_class=school_class, class_name=class_name)
    class_students = _class_cohort(student, school_class=school_class, class_name=class_name)

    total_students = class_students.count()
    profile_stats = _class_profile_stats(
        student,
        calculate_sequence_average,
        (sequence,),
        school_class=school_class,
        class_name=class_name,
    )

    return {
        'school': _school_payload(student.school),
        'student': _student_payload(student),
        'sequence': {
            'name': sequence.name,
            'academic_year': sequence.academic_year,
            'term': sequence.term,
        },
        'grades': grades_data,
        'average': float(average),
        'rank': rank,
        'total_students': total_students,
        'promotion_status': 'Promoted' if average >= 10 else 'Requires Review',
        'attendance': _attendance_payload(student, [sequence]),
        # Honour-roll eligibility against the school's admin-set threshold, so
        # sequence report cards flag it exactly like term cards do.
        'honour_roll': bool(average >= _honour_roll_threshold(student.school)),
        'honor_roll': bool(average >= _honour_roll_threshold(student.school)),
        **profile_stats,
    }


def generate_period_report_card_data(student, sequences, period_label, term=None, academic_year=None, school_class=None, class_name=None):
    """Generate report-card data for a Cameroon term or custom period."""
    sequence_list = list(sequences)
    sequence_ids = [sequence.id for sequence in sequence_list]
    grades = Grade.objects.filter(
        student=student,
        sequence_id__in=sequence_ids,
    ).select_related('subject', 'teacher', 'sequence')
    grades = _class_scoped_grades(grades, student, school_class, class_name)

    subject_rows = {}
    for grade in grades:
        row = subject_rows.setdefault(grade.subject_id, {
            'subject_id': str(grade.subject_id),
            'subject_name': grade.subject.name,
            'subject_code': grade.subject.code,
            'teacher_name': grade.teacher.get_full_name() if grade.teacher_id else '',
            'coefficient': float(grade.subject.coefficient),
            'scores': [],
            'sequence_scores': [],
            'comment': grade.comment or '',
        })
        score = Decimal(str(grade.score))
        row['scores'].append(score)
        row['sequence_scores'].append({
            'sequence_id': str(grade.sequence_id),
            'sequence_name': grade.sequence.name,
            'score': float(grade.score),
        })
        if grade.teacher_id:
            row['teacher_name'] = grade.teacher.get_full_name()
        if grade.comment:
            row['comment'] = grade.comment

    class_students = _class_cohort(student, school_class=school_class, class_name=class_name)
    cohort_ids = [str(pk) for pk in class_students.values_list('id', flat=True)]
    subject_positions = _subject_positions(student, sequence_ids, cohort_ids)

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
        row['grade_letter'] = get_grade_letter(score)
        row['remark'] = get_remark(score)
        row['position'] = subject_positions.get(row['subject_id'])
        row['total'] = float((score * coefficient).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
        grades_data.append(row)

    average = Decimal('0.00')
    if total_coefficient > 0:
        average = (total_score / total_coefficient).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    rank = compute_period_rank(student, sequence_list, school_class=school_class, class_name=class_name)
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
        else _auto_principal_remark(average)
    )
    honour_roll = average >= _honour_roll_threshold(student.school)
    is_promoted = None
    if term_result and term_result.is_promoted is not None:
        is_promoted = term_result.is_promoted

    student_payload = _student_payload(student)

    return {
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
        'average': float(average),
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
        'promotion_status': ('Promoted' if (is_promoted if is_promoted is not None else average >= 10) else 'Requires Review'),
        'period_type': 'term',
        'attendance': _attendance_payload(student, sequence_list),
        **profile_stats,
    }


def generate_term_report_card_data(student, term, academic_year, school_class=None, class_name=None):
    """Generate a Cameroon term report card.

    Terms 1 and 2 use their own two sequences. Term 3 is the end-of-year report:
    it aggregates ALL sequences of the year (the six sequences) and carries the
    promotion status, matching the official third-term / annual card.
    """
    term = int(term)
    if term == 3:
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
    return generate_period_report_card_data(
        student,
        sequences,
        'Third Term Report' if term == 3 else f'Term {term} Report',
        term=term,
        academic_year=academic_year,
        school_class=school_class,
        class_name=class_name,
    )

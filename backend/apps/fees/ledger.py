from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q
from django.utils import timezone


MONEY_ZERO = Decimal('0.00')


def quantize_money(value):
    decimal_value = Decimal(value or 0)
    return decimal_value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def determine_school_fee_status(total_amount, amount_paid):
    total = quantize_money(total_amount)
    paid = quantize_money(amount_paid)
    balance = max(total - paid, MONEY_ZERO)

    if total <= MONEY_ZERO or paid >= total:
        return 'paid', balance
    if paid > MONEY_ZERO:
        return 'incomplete', balance
    return 'unpaid', balance


def apply_school_fee_status(record):
    total = quantize_money(record.total_amount or MONEY_ZERO)
    paid = quantize_money(record.amount_paid or MONEY_ZERO)
    status, balance = determine_school_fee_status(total, paid)
    record.total_amount = total
    record.amount_paid = paid
    record.balance = balance
    record.status = status
    return record


def get_students_for_assignment(assignment):
    from apps.students import api as students_api

    queryset = students_api.list_students(school=assignment.school)
    if assignment.school_class_id:
        queryset = queryset.filter(
            Q(school_class=assignment.school_class) | Q(student_class=assignment.school_class.name)
        )
    return queryset.select_related('user', 'school_class').distinct()


def sync_class_fee_assignment_records(assignment):
    from .models import StudentSchoolFeeRecord

    student_ids = []
    for student in get_students_for_assignment(assignment):
        student_ids.append(student.id)
        record, created = StudentSchoolFeeRecord.objects.get_or_create(
            fee_assignment=assignment,
            student=student,
            defaults={
                'school': assignment.school,
                'total_amount': assignment.amount,
                'amount_paid': MONEY_ZERO,
                'notes': assignment.notes or '',
                'is_active': True,
            },
        )
        changed_fields = []
        if record.school_id != assignment.school_id:
            record.school = assignment.school
            changed_fields.append('school')
        if record.total_amount != assignment.amount:
            record.total_amount = assignment.amount
            changed_fields.append('total_amount')
        if created:
            changed_fields.extend(['amount_paid', 'notes', 'is_active'])
        elif not record.is_active:
            record.is_active = True
            changed_fields.append('is_active')
        if changed_fields:
            record.save()
        else:
            record.save(update_fields=['total_amount', 'amount_paid', 'balance', 'status', 'school', 'modified'])

    StudentSchoolFeeRecord.objects.filter(fee_assignment=assignment).exclude(student_id__in=student_ids).update(is_active=False)


def sync_student_school_fee_records(student):
    from .models import SchoolFeeAssignment, StudentSchoolFeeRecord

    if not student.school_id:
        return

    assignment_queryset = SchoolFeeAssignment.objects.filter(school=student.school, is_active=True)
    if student.school_class_id:
        assignment_queryset = assignment_queryset.filter(school_class=student.school_class)
    elif student.student_class:
        assignment_queryset = assignment_queryset.filter(school_class__name=student.student_class)
    else:
        assignment_queryset = assignment_queryset.none()

    assignment_ids = list(assignment_queryset.values_list('id', flat=True))

    if assignment_ids:
        for assignment in assignment_queryset.select_related('school_class'):
            record, created = StudentSchoolFeeRecord.objects.get_or_create(
                fee_assignment=assignment,
                student=student,
                defaults={
                    'school': assignment.school,
                    'total_amount': assignment.amount,
                    'amount_paid': MONEY_ZERO,
                    'notes': assignment.notes or '',
                    'is_active': True,
                },
            )
            if record.total_amount != assignment.amount or not record.is_active or record.school_id != assignment.school_id:
                record.total_amount = assignment.amount
                record.school = assignment.school
                record.is_active = True
                record.save()
            elif created:
                record.save()
            else:
                record.save(update_fields=['total_amount', 'amount_paid', 'balance', 'status', 'school', 'modified'])

    StudentSchoolFeeRecord.objects.filter(student=student, school=student.school).exclude(
        fee_assignment_id__in=assignment_ids
    ).update(is_active=False)

def credit_payment_to_school_fees(payment, actor=None):
    """Puts a confirmed payment onto the student's fee ledger.

    The ledger is what the Fee Records tab shows, and what tells a bursar
    who still owes. Until this existed a payment was recorded, a receipt was
    printed, and the ledger went on saying the student had paid nothing:
    the money and the record of it lived in two places that never met.

    The amount is applied to the student's unpaid records, oldest first, so
    last year's balance is cleared before this year's. Anything left over
    once every record is settled stays on the payment itself, which remains
    the record of what was actually handed over.
    """
    # Through the students API, not its models: Student Management owns its
    # own internals and core/tests/test_module_boundaries.py enforces it.
    from apps.students import api as students_api

    from .models import StudentSchoolFeeRecord

    # A platform subscription is not a school fee and has no ledger row.
    if not payment.fee_structure_id or not payment.payer_id:
        return []

    student = students_api.get_student_for_user(payment.payer)
    if student is None:
        return []

    remaining = quantize_money(payment.amount)
    if remaining <= MONEY_ZERO:
        return []

    records = (
        StudentSchoolFeeRecord.objects.filter(student=student, is_active=True)
        .exclude(status=StudentSchoolFeeRecord.STATUS_PAID)
        .order_by('fee_assignment__academic_year', 'created')
    )

    credited = []
    for record in records:
        if remaining <= MONEY_ZERO:
            break
        room = quantize_money(record.total_amount) - quantize_money(record.amount_paid)
        if room <= MONEY_ZERO:
            continue
        applied = min(room, remaining)
        record.amount_paid = quantize_money(record.amount_paid) + applied
        record.last_recorded_at = timezone.now()
        if actor is not None and getattr(actor, "is_authenticated", False):
            record.updated_by = actor
        apply_school_fee_status(record)
        record.save()
        credited.append(record)
        remaining -= applied

    return credited

def fee_payment_state(payer, fee_structure):
    """What is already paid against one fee for one person, and what is left.

    Pending payments count. A payment that has been recorded but not yet
    confirmed is still money taken, and leaving it out would let the same
    fee be recorded twice in the minutes before anyone confirms the first.
    Rejected and refunded ones do not count: that money came back.
    """
    from django.db.models import Sum

    from .models import Payment

    total = quantize_money(getattr(fee_structure, 'amount', MONEY_ZERO))
    paid = quantize_money(
        Payment.objects.filter(
            payer=payer,
            fee_structure=fee_structure,
            status__in=['pending', 'confirmed'],
        ).aggregate(total=Sum('amount')).get('total') or MONEY_ZERO
    )
    outstanding = max(total - paid, MONEY_ZERO)
    return {
        'total': total,
        'paid': paid,
        'outstanding': outstanding,
        'status': determine_school_fee_status(total, paid)[0],
    }

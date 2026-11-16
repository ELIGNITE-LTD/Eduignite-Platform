"""Fees, payments and balances for higher education (amounts in XAF)."""

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from .models import Enrolment, FeePayment, TuitionFee


def fees_for(enrolment):
    return TuitionFee.objects.filter(
        school=enrolment.school, programme_year=enrolment.programme_year, academic_year=enrolment.academic_year)


def billed(enrolment):
    return fees_for(enrolment).aggregate(t=Sum('amount'))['t'] or 0


def paid(enrolment):
    return FeePayment.objects.filter(enrolment=enrolment, is_void=False).aggregate(t=Sum('amount'))['t'] or 0


def balance_row(enrolment, billed_total=None, paid_total=None):
    owed = billed(enrolment) if billed_total is None else billed_total
    settled = paid(enrolment) if paid_total is None else paid_total
    outstanding = max(owed - settled, 0)
    status = 'no_fees' if owed == 0 else 'paid' if outstanding == 0 else 'partial' if settled else 'unpaid'
    student = enrolment.student
    return {
        'enrolment': str(enrolment.pk),
        'student': str(student.pk),
        'student_name': getattr(student, 'name', '') or getattr(student.user, 'name', ''),
        'matricule': (getattr(student.user, 'matricule', '') if student.user_id else '') or getattr(student, 'matricule', ''),
        'programme': enrolment.programme.name,
        'level': enrolment.programme_year.number,
        'academic_year': enrolment.academic_year.label,
        'billed': owed, 'paid': settled, 'balance': outstanding,
        'overpaid': max(settled - owed, 0), 'status': status,
    }


def balances(school, academic_year, **filters):
    """One row per active enrolment of the year, with what is billed, paid and still owed."""
    enrolments = (Enrolment.objects.filter(school=school, academic_year=academic_year)
                  .exclude(status__in=[Enrolment.WITHDRAWN])
                  .select_related('student', 'student__user', 'programme', 'programme_year', 'academic_year'))
    for key in ('programme', 'programme_year'):
        if filters.get(key):
            enrolments = enrolments.filter(**{key: filters[key]})
    fee_totals = {}
    for row in TuitionFee.objects.filter(school=school, academic_year=academic_year).values(
            'programme_year').annotate(t=Sum('amount')):
        fee_totals[row['programme_year']] = row['t']
    paid_totals = {row['enrolment']: row['t'] for row in FeePayment.objects.filter(
        school=school, enrolment__academic_year=academic_year, is_void=False).values('enrolment').annotate(t=Sum('amount'))}
    rows = [balance_row(e, fee_totals.get(e.programme_year_id, 0), paid_totals.get(e.pk, 0)) for e in enrolments]
    term = (filters.get('q') or '').strip().lower()
    if term:
        rows = [r for r in rows if term in r['student_name'].lower() or term in (r['matricule'] or '').lower()]
    if filters.get('status'):
        rows = [r for r in rows if r['status'] == filters['status']]
    return rows


def summary(rows):
    return {
        'students': len(rows),
        'billed': sum(r['billed'] for r in rows),
        'collected': sum(r['paid'] for r in rows),
        'outstanding': sum(r['balance'] for r in rows),
        'fully_paid': sum(1 for r in rows if r['status'] == 'paid'),
        'defaulters': sum(1 for r in rows if r['balance'] > 0),
    }


def next_receipt_number(school):
    year = timezone.now().year
    prefix = f'REC-{year}-'
    last = (FeePayment.objects.select_for_update().filter(school=school, receipt_number__startswith=prefix)
            .order_by('-receipt_number').values_list('receipt_number', flat=True).first())
    number = int(last.rsplit('-', 1)[1]) + 1 if last else 1
    return f'{prefix}{number:06d}'


@transaction.atomic
def record_payment(user, enrolment, *, amount, method, paid_on, reference='', note=''):
    if enrolment.school_id != user.school_id:
        raise serializers.ValidationError({'enrolment': 'Student not found.'})
    if amount is None or int(amount) <= 0:
        raise serializers.ValidationError({'amount': 'Enter an amount above zero.'})
    if method not in dict(FeePayment.METHOD_CHOICES):
        raise serializers.ValidationError({'method': 'Choose cash, MTN Mobile Money, Orange Money or bank.'})
    if method in (FeePayment.MTN_MOMO, FeePayment.ORANGE_MONEY, FeePayment.BANK) and not (reference or '').strip():
        raise serializers.ValidationError({'reference': 'Enter the transaction or deposit reference.'})
    if paid_on > timezone.localdate():
        raise serializers.ValidationError({'paid_on': 'The payment date cannot be in the future.'})
    return FeePayment.objects.create(
        school=user.school, enrolment=enrolment, amount=int(amount), method=method, paid_on=paid_on,
        reference=(reference or '').strip(), note=(note or '').strip(), received_by=user,
        receipt_number=next_receipt_number(user.school))


def void_payment(payment, reason):
    if payment.is_void:
        raise serializers.ValidationError({'detail': 'This payment is already cancelled.'})
    if not (reason or '').strip():
        raise serializers.ValidationError({'reason': 'Say why the payment is cancelled.'})
    payment.is_void = True
    payment.voided_at = timezone.now()
    payment.void_reason = reason.strip()[:200]
    payment.save(update_fields=['is_void', 'voided_at', 'void_reason', 'updated_at'])
    return payment


def payment_data(payment):
    enrolment = payment.enrolment
    row = balance_row(enrolment)
    return {
        'id': str(payment.pk), 'receipt_number': payment.receipt_number, 'amount': payment.amount,
        'method': payment.method, 'method_label': payment.get_method_display(), 'reference': payment.reference,
        'paid_on': payment.paid_on.isoformat(), 'note': payment.note, 'is_void': payment.is_void,
        'void_reason': payment.void_reason, 'enrolment': str(enrolment.pk),
        'student_name': row['student_name'], 'matricule': row['matricule'], 'programme': row['programme'],
        'level': row['level'], 'academic_year': row['academic_year'],
        'received_by': getattr(payment.received_by, 'name', '') if payment.received_by_id else '',
    }

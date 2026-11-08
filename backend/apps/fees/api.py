"""Public read API of the fees app for other apps."""

from decimal import Decimal


def school_fee_totals(school_ids) -> dict:
    """``{school_id: {'billed', 'collected', 'outstanding', 'records'}}`` in ONE query.

    Sums the active per-pupil school-fee records (what the school billed its
    pupils, what was paid, what is still owed). Amounts are Decimal.
    """
    from django.db.models import Count, Sum

    from .models import StudentSchoolFeeRecord

    zero = Decimal('0')
    result = {sid: {'billed': zero, 'collected': zero, 'outstanding': zero, 'records': 0} for sid in school_ids}
    rows = (
        StudentSchoolFeeRecord.objects
        .filter(school_id__in=list(school_ids), is_active=True)
        .order_by()
        .values('school_id')
        .annotate(billed=Sum('total_amount'), collected=Sum('amount_paid'), outstanding=Sum('balance'), n=Count('id'))
    )
    for row in rows:
        result[row['school_id']] = {
            'billed': row['billed'] or zero,
            'collected': row['collected'] or zero,
            'outstanding': row['outstanding'] or zero,
            'records': row['n'],
        }
    return result

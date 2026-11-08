"""Platform fee per student: what EduIgnite bills each school.

Rules (single source of truth, used by the bill endpoints, the Fapshi payment
path and the school access lock):

* Billable pupils: learners enrolled in a class of the school, with or without
  a login, excluding drafted accounts (``apps.students.api.count_billable_pupils``).
* Rate: ``per_student_fee_by_category[<school.education_category>]`` when > 0,
  else the default ``per_student_fee``. A rate of 0 means "not configured": the
  school is not billed this way and nothing is locked.
* Deadline: ``payment_deadline_by_category[<category>]`` else ``payment_deadline``.
* Total = pupils x rate, rounded to whole XAF. Paid = sum of confirmed
  (processed, SUCCESS) Fapshi transactions tied to the bill, in the current
  gateway environment. Balance = max(total - paid, 0).
* A bill belongs to a billing cycle (``PlatformSettings.billing_cycle`` or the
  deadline's year), so moving the deadline never resets what was paid.

Amounts are always computed here on the server; nothing a client sends is trusted.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db.models import Sum
from django.utils import timezone

from .models import PlatformSettings, SchoolPlatformBill

logger = logging.getLogger(__name__)

CATEGORIES = ('basic', 'secondary', 'higher')

STATUS_NOT_CONFIGURED = 'not_configured'
STATUS_NO_CHARGE = 'no_charge'
STATUS_PAID = 'paid'
STATUS_DUE = 'due'
STATUS_OVERDUE = 'overdue'


def _dec(value) -> Decimal:
    try:
        amount = Decimal(str(value if value is not None else '0'))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal('0')
    return amount if amount > 0 else Decimal('0')


def _category(school) -> str:
    value = str(getattr(school, 'education_category', '') or 'secondary').lower()
    return value if value in CATEGORIES else 'secondary'


def effective_rate(settings: PlatformSettings, category: str) -> Decimal:
    by_category = settings.per_student_fee_by_category or {}
    rate = _dec(by_category.get(category))
    return rate if rate > 0 else _dec(settings.per_student_fee)


def effective_deadline(settings: PlatformSettings, category: str) -> date | None:
    raw = (settings.payment_deadline_by_category or {}).get(category)
    if raw:
        try:
            return date.fromisoformat(str(raw)[:10])
        except ValueError:
            pass
    return settings.payment_deadline


def current_cycle(settings: PlatformSettings, category: str) -> str:
    label = (settings.billing_cycle or '').strip()
    if label:
        return label[:20]
    deadline = effective_deadline(settings, category)
    return str((deadline or timezone.localdate()).year)


def _current_environment() -> str:
    from apps.fees import fapshi

    return fapshi.current_environment()


def _txns(bill):
    from apps.fees.models import GatewayTransaction

    return GatewayTransaction.objects.filter(
        platform_bill=bill,
        purpose=GatewayTransaction.PURPOSE_SCHOOL,
        status=GatewayTransaction.STATUS_SUCCESS,
        processed=True,
        environment=_current_environment(),
    )


def paid_amount(bill) -> Decimal:
    if bill is None:
        return Decimal('0')
    return _txns(bill).aggregate(total=Sum('amount'))['total'] or Decimal('0')


def _status(total: Decimal, balance: Decimal, deadline, rate: Decimal) -> str:
    if rate <= 0:
        return STATUS_NOT_CONFIGURED
    if total <= 0:
        return STATUS_NO_CHARGE
    if balance <= 0:
        return STATUS_PAID
    if deadline and timezone.localdate() > deadline:
        return STATUS_OVERDUE
    return STATUS_DUE


def _figures(school, settings=None, pupils=None):
    from apps.students import api as students_api

    settings = settings or PlatformSettings.load()
    category = _category(school)
    rate = effective_rate(settings, category)
    count = students_api.count_billable_pupils(school) if pupils is None else pupils
    total = (Decimal(count) * rate).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return settings, category, rate, count, total


def build_bill(school, *, create=False, settings=None, pupils=None, bill=None) -> dict:
    """The school's current bill as a plain dict. ``create`` persists the row."""
    settings, category, rate, count, total = _figures(school, settings, pupils)
    deadline = effective_deadline(settings, category)
    cycle = current_cycle(settings, category)
    if bill is None:
        bill = SchoolPlatformBill.objects.filter(school=school, cycle=cycle).first()
    if create and bill is None and rate > 0:
        bill, _ = SchoolPlatformBill.objects.get_or_create(
            school=school, cycle=cycle,
            defaults={'pupil_count': count, 'rate': rate, 'total_amount': total, 'deadline': deadline},
        )
    paid = paid_amount(bill)
    balance = max(total - paid, Decimal('0'))
    status = _status(total, balance, deadline, rate)
    if create and bill is not None:
        changed = (bill.pupil_count, bill.rate, bill.total_amount, bill.deadline) != (count, rate, total, deadline)
        bill.pupil_count, bill.rate, bill.total_amount, bill.deadline = count, rate, total, deadline
        fields = ['pupil_count', 'rate', 'total_amount', 'deadline', 'updated_at'] if changed else []
        if status == STATUS_PAID and bill.settled_at is None:
            bill.settled_at = timezone.now()
            fields.append('settled_at')
        if fields:
            bill.save(update_fields=fields)
    return {
        'configured': rate > 0,
        'status': status,
        'cycle': cycle,
        'education_category': category,
        'pupil_count': count,
        'rate': float(rate),
        'currency': getattr(school, 'subscription_currency', None) or 'XAF',
        'total': float(total),
        'paid': float(paid),
        'balance': float(balance),
        'deadline': deadline.isoformat() if deadline else None,
        'days_to_deadline': (deadline - timezone.localdate()).days if deadline else None,
        'bill_id': bill.id if bill else None,
        '_bill': bill,
    }


def public_bill(school, *, create=False) -> dict:
    data = build_bill(school, create=create)
    data.pop('_bill', None)
    return data


def history(school) -> list[dict]:
    """Past and current cycles with their confirmed payments (receipts)."""
    out = []
    current = current_cycle(PlatformSettings.load(), _category(school))
    for bill in SchoolPlatformBill.objects.filter(school=school).order_by('-created_at'):
        payments = []
        for txn in _txns(bill).select_related('payment').order_by('-created'):
            payment = txn.payment
            payments.append({
                'transaction_id': txn.transaction_id,
                'amount': float(txn.amount),
                'currency': txn.currency,
                'paid_at': txn.modified.isoformat() if txn.modified else None,
                'receipt_number': getattr(payment, 'receipt_number', None),
                'reference_number': getattr(payment, 'reference_number', None),
                'payment_id': str(payment.id) if payment is not None else None,
            })
        paid = sum(Decimal(str(p['amount'])) for p in payments)
        out.append({
            'cycle': bill.cycle,
            'is_current': bill.cycle == current,
            'pupil_count': bill.pupil_count,
            'rate': float(bill.rate),
            'total': float(bill.total_amount),
            'paid': float(paid),
            'balance': float(max(bill.total_amount - paid, Decimal('0'))),
            'deadline': bill.deadline.isoformat() if bill.deadline else None,
            'settled_at': bill.settled_at.isoformat() if bill.settled_at else None,
            'payments': payments,
        })
    return out


def is_overdue(school) -> bool:
    """True when this school's bill is overdue (the caller handles explicit grace).

    Fails open: any problem resolves to "not overdue", because locking a school
    that may have paid is worse than briefly leaving an unpaid one open.
    """
    try:
        if school is None:
            return False
        settings = PlatformSettings.load()
        category = _category(school)
        if effective_rate(settings, category) <= 0:
            return False
        deadline = effective_deadline(settings, category)
        if not deadline or timezone.localdate() <= deadline:
            return False
        return build_bill(school, settings=settings)['status'] == STATUS_OVERDUE
    except Exception:  # noqa: BLE001
        logger.exception('Platform bill overdue check failed for %s', getattr(school, 'id', None))
        return False


def apply_payment(txn) -> bool:
    """Credit one confirmed transaction to its bill; settle the school if cleared.

    Runs inside ``apply_successful_transaction``'s atomic block, after the
    caller has locked the transaction row, so a retried webhook (already
    ``processed``) never gets here twice. Returns True when the bill is cleared.
    """
    from apps.schools.models import School

    bill = txn.platform_bill
    school = School.objects.filter(id=txn.school_id).first()
    if bill is None or school is None:
        return False
    data = build_bill(school, bill=bill)
    before = Decimal(str(data['balance']))
    # ``txn`` is not yet marked processed, so it is not in ``paid``: add it.
    balance = max(before - txn.amount, Decimal('0'))
    if before <= 0:
        logger.warning('Platform bill %s was already settled; txn %s overpays it.', bill.id, txn.transaction_id)
    if balance > 0:
        return False
    now = timezone.now()
    if bill.settled_at is None:
        bill.settled_at = now
        bill.save(update_fields=['settled_at', 'updated_at'])
    school.subscription_status = School.SUBSCRIPTION_PAID
    school.subscription_paid_at = now
    school.subscription_expires_on = timezone.localdate() + timedelta(days=365)
    school.save(update_fields=['subscription_status', 'subscription_paid_at',
                               'subscription_expires_on', 'updated_at'])
    return True


def pending_txn(bill, within_minutes=10):
    """A still-pending prompt for this bill, so a second one is not raised."""
    from apps.fees.models import GatewayTransaction

    since = timezone.now() - timedelta(minutes=within_minutes)
    return GatewayTransaction.objects.filter(
        platform_bill=bill, status=GatewayTransaction.STATUS_PENDING, created__gte=since,
    ).order_by('-created').first()


def schools_overview(status_filter: str | None = None) -> list[dict]:
    """Founders' view: every school's billing status. Pupil counts are one grouped query."""
    from apps.schools.models import School
    from apps.students import api as students_api

    settings = PlatformSettings.load()
    counts = students_api.count_billable_pupils_by_school()
    rows = []
    for school in School.objects.filter(is_drafted=False).order_by('name'):
        data = build_bill(school, settings=settings, pupils=counts.get(school.id, 0))
        data.pop('_bill', None)
        if status_filter and data['status'] != status_filter:
            continue
        rows.append({'school_id': str(school.id), 'school_name': school.name,
                     'subscription_status': school.subscription_status, **data})
    return rows

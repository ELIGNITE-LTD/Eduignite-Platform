from celery import shared_task
from django.utils import timezone
from decimal import Decimal
from .models import Payment
from django.contrib.auth import get_user_model

User = get_user_model()

@shared_task
def remind_unpaid_subscription_parents():
    """Daily reminder: notify parents (per child, by name) and students while a
    child's platform subscription is set (> 0) and still unpaid."""
    from apps.notifications.utils import notify_users
    from apps.platform.access import get_role_platform_fee
    from apps.students import api as students_api

    fee = get_role_platform_fee('STUDENT')
    if fee <= 0:
        return 'Subscription is free — no reminders sent.'

    amount_label = f"{float(fee):,.0f} XAF"
    unpaid_students = (
        User.objects.filter(role='STUDENT', is_license_paid=False, is_drafted=False)
        .select_related('school')
    )

    notified_parents = 0
    notified_students = 0
    for student_user in unpaid_students.iterator():
        first_name = (student_user.name or 'Your child').split(' ')[0]
        student = students_api.get_student_for_user(student_user)
        parents = [
            p
            for p in students_api.get_guardian_users(student)
            if p and getattr(p, 'is_active', True)
        ]
        if parents:
            notify_users(
                parents,
                f"{first_name}'s subscription is unpaid",
                f"{student_user.name}'s EduIgnite platform subscription ({amount_label}) has not been paid. "
                "You can pay it from your Subscription tab.",
                notification_type='fee_payment',
            )
            notified_parents += len(parents)
        if getattr(student_user, 'is_active', True):
            notify_users(
                [student_user],
                'Your subscription is unpaid',
                f'Your EduIgnite platform subscription ({amount_label}) has not been paid. '
                'Pay it from your Subscription tab to keep full access.',
                notification_type='fee_payment',
            )
            notified_students += 1

    return f'Subscription reminders sent to {notified_parents} parent(s) and {notified_students} student(s).'

@shared_task
def generate_monthly_revenue_report():
    """Generate monthly revenue summary"""
    from apps.schools.models import School

    today = timezone.now().date()
    month_start = today.replace(day=1)

    schools = School.objects.all()

    for school in schools:
        payments = Payment.objects.filter(
            school=school,
            status='confirmed',
            payment_date__gte=month_start,
            payment_date__lte=today
        )

        if not payments.exists():
            continue

        total_revenue = payments.aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')

        # By method
        method_breakdown = {}
        for method, _ in Payment.PAYMENT_METHOD_CHOICES:
            amount = payments.filter(payment_method=method).aggregate(
                total=Sum('amount')
            )['total'] or Decimal('0.00')
            if amount > 0:
                method_breakdown[method] = amount

        # By fee type
        fee_breakdown = {}
        for fee in payments.values('fee_structure__name').annotate(total=Sum('amount')):
            if fee['fee_structure__name']:
                fee_breakdown[fee['fee_structure__name']] = fee['total']

        report_data = {
            'school': school.name,
            'period': f"{month_start.strftime('%B %Y')}",
            'total_revenue': total_revenue,
            'payment_count': payments.count(),
            'by_method': method_breakdown,
            'by_fee_type': fee_breakdown,
        }

        # Store or send report
        # This can be extended to save to a report model or send email to bursars

    return f"Monthly revenue report generated for {schools.count()} schools"

from django.db.models import Sum

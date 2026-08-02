from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from .models import BookLoan
from apps.notifications.models import Notification


@shared_task
def check_overdue_loans():
    """Mark overdue loans and calculate fines"""
    today = timezone.now().date()
    overdue_loans = BookLoan.objects.filter(
        due_date__lt=today,
        returned_date__isnull=True,
        status='Active'
    )

    for loan in overdue_loans:
        loan.status = 'Overdue'
        loan.fine_amount = loan.calculate_fine()
        loan.save()

        Notification.objects.create(
            user=loan.borrower,
            title='Book Overdue',
            message=f"Your loan for '{loan.book.title}' is overdue. Fine amount: {loan.fine_amount}",
            notification_type='warning'
        )

    return f"Processed {overdue_loans.count()} overdue loans"


@shared_task
def notify_due_tomorrow():
    """Send reminders for books due tomorrow"""
    tomorrow = timezone.now().date() + timedelta(days=1)
    due_tomorrow = BookLoan.objects.filter(
        due_date=tomorrow,
        returned_date__isnull=True,
        status='Active'
    )

    for loan in due_tomorrow:
        Notification.objects.create(
            user=loan.borrower,
            title='Book Due Tomorrow',
            message=f"Your loan for '{loan.book.title}' is due tomorrow",
            notification_type='info'
        )

    return f"Sent {due_tomorrow.count()} reminders"

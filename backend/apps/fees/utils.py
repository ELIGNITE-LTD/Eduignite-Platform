import secrets
from datetime import datetime


def generate_reference_number():
    """Generate unique payment reference number"""
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    random_suffix = secrets.token_hex(3).upper()
    return f"PAY-{timestamp}-{random_suffix}"


def generate_receipt_number():
    """Generate sequential receipt number"""
    from .models import Invoice
    today = datetime.now().strftime('%Y%m%d')

    # Get last receipt for today
    last_receipt = Invoice.objects.filter(
        invoice_number__startswith=f"REC-{today}"
    ).order_by('-invoice_number').first()

    if last_receipt:
        # Extract sequence number and increment
        seq = int(last_receipt.invoice_number.split('-')[-1])
        seq += 1
    else:
        seq = 1

    return f"REC-{today}-{seq:05d}"


def generate_invoice_number():
    """Generate sequential invoice number"""
    from .models import Invoice
    from django.utils import timezone

    today = timezone.now().strftime('%Y%m%d')
    count = Invoice.objects.filter(
        invoice_number__startswith=f"INV-{today}"
    ).count()
    return f"INV-{today}-{count + 1:05d}"

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


# ---------------------------------------------------------------------------
# Public receipt verification (QR on the printed receipt)
# ---------------------------------------------------------------------------
RECEIPT_VERIFY_SALT = 'eduignite.fee-receipt.verify.v1'


def receipt_verify_token(payment):
    """A signed, unguessable token for one payment.

    Receipt numbers are sequential (REC-20261107-00001), so they cannot be the
    public handle: anyone could walk the sequence. The token is the payment id
    signed with the server secret, so only receipts the school actually printed
    can be looked up.
    """
    from django.core.signing import Signer

    return Signer(salt=RECEIPT_VERIFY_SALT, sep='.').sign(payment.pk.hex)


def resolve_receipt_token(token):
    """Return the Payment a valid token points at, or None."""
    import uuid
    from django.core.signing import BadSignature, Signer
    from .models import Payment

    try:
        raw = Signer(salt=RECEIPT_VERIFY_SALT, sep='.').unsign(str(token or ''))
        payment_id = uuid.UUID(raw)
    except (BadSignature, ValueError):
        return None
    return Payment.objects.select_related('school', 'fee_structure').filter(pk=payment_id).first()


def receipt_verification(payment):
    """``{'verify_url', 'qr_code'}`` for a confirmed, numbered receipt, else empty strings."""
    empty = {'verify_url': '', 'qr_code': ''}
    if payment is None or payment.status != 'confirmed' or not payment.receipt_number:
        return empty

    from core.verification import build_verify_url, qr_png_data_url

    verify_url = build_verify_url('receipt', token=receipt_verify_token(payment))
    qr_code = qr_png_data_url(verify_url)
    return {'verify_url': verify_url, 'qr_code': qr_code}

"""One place that decides where a printed QR code points.

Every document EduIgnite prints with a QR (student ID card, report card, fee
receipt) encodes a PUBLIC verification URL on the website. Those URLs used to
be assembled by hand in three different modules, each with its own default
domain, which is how a scan ended on "Page Not Found".

Rules
-----
* The base URL comes from ``settings.FRONTEND_URL`` (env ``FRONTEND_URL``) and
  nowhere else. In production it must be the public website, e.g.
  ``https://eduignite.online`` - not the API host and not a dashboard sub-domain.
* Paths are listed in ``VERIFY_ROUTES``. The matching Next.js pages live under
  ``apps/website/src/app/verify`` (a test keeps the two in step).
* Public verification answers carry ``result`` (``valid`` / ``not_valid`` /
  ``revoked``) plus ``document_type``; ``valid`` stays a boolean for old clients.
"""
from __future__ import annotations

import base64
import hmac
from io import BytesIO
from urllib.parse import quote

from django.conf import settings
from django.utils.crypto import salted_hmac
from rest_framework.throttling import AnonRateThrottle

DEFAULT_PUBLIC_SITE = 'https://eduignite.online'

RESULT_VALID = 'valid'
RESULT_NOT_VALID = 'not_valid'
RESULT_REVOKED = 'revoked'

DOC_ID_CARD = 'id_card'
DOC_REPORT_CARD = 'report_card'
DOC_FEE_RECEIPT = 'fee_receipt'

# kind -> path template served by the website. Keep in step with
# apps/website/src/app/verify/** (see backend/core/tests/test_verification_routes.py).
VERIFY_ROUTES = {
    'student': '/verify/student/{admission}',
    'report-card': '/verify/report-card/{admission}/{year}/{key}',
    'receipt': '/verify/receipt/{token}',
}


def public_site_base() -> str:
    """Public website origin used inside QR codes, without a trailing slash."""
    base = (getattr(settings, 'FRONTEND_URL', '') or '').strip().rstrip('/')
    if not base:
        return DEFAULT_PUBLIC_SITE
    if not base.startswith(('http://', 'https://')):
        base = 'https://' + base
    return base


def build_verify_url(kind: str, query: dict | None = None, **parts) -> str:
    """Absolute public verification URL for ``kind`` (a key of ``VERIFY_ROUTES``).

    Every path part is percent-encoded with no safe characters so a slash inside
    an admission number or academic year can never split the path.
    """
    template = VERIFY_ROUTES[kind]
    encoded = {name: quote(str(value if value is not None else ''), safe='') for name, value in parts.items()}
    url = public_site_base() + template.format(**encoded)
    pairs = [(k, v) for k, v in (query or {}).items() if v not in (None, '')]
    if pairs:
        url += '?' + '&'.join(f'{quote(str(k), safe="")}={quote(str(v), safe="")}' for k, v in pairs)
    return url


def qr_png_data_url(text: str, box_size: int = 8, border: int = 2) -> str:
    """PNG data URL of a QR for ``text``; '' if the QR library is unavailable."""
    try:
        import qrcode

        qr = qrcode.QRCode(version=None, box_size=box_size, border=border)
        qr.add_data(text)
        qr.make(fit=True)
        buffer = BytesIO()
        qr.make_image(fill_color='black', back_color='white').convert('RGB').save(buffer, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')
    except Exception:  # noqa: BLE001 - a missing QR image must never block the document
        return ''


def verification_response(result: str, document_type: str, **facts) -> dict:
    """Uniform body for every public verification endpoint."""
    return {
        'valid': result == RESULT_VALID,
        'result': result,
        'document_type': document_type,
        **facts,
    }


class PublicVerifyThrottle(AnonRateThrottle):
    """Per-IP limit for the public, login-free verification endpoints."""

    scope = 'public_verify'


# ---------------------------------------------------------------------------
# Unguessable credentials for documents that reveal more than header facts
# ---------------------------------------------------------------------------
_MAC_BYTES = 16


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


def _mac(salt: str, raw: bytes) -> bytes:
    return salted_hmac(salt, raw, algorithm='sha256').digest()[:_MAC_BYTES]


def sign_token(salt: str, raw: bytes) -> str:
    """Short URL-safe token: ``b64(raw).b64(HMAC(raw))``. No expiry on purpose."""
    return f'{_b64(raw)}.{_b64(_mac(salt, raw))}'


def unsign_token(salt: str, token) -> bytes | None:
    """Return the signed bytes, or None for anything forged or malformed.

    The signature is compared in constant time; every failure looks the same.
    """
    try:
        body, sig = str(token or '').split('.')
        raw = _unb64(body)
        given = _unb64(sig)
    except (ValueError, TypeError):
        return None
    if not raw or not hmac.compare_digest(given, _mac(salt, raw)):
        return None
    return raw


def private_response_headers(response):
    """Detailed verification answers are for the card holder: never cached or indexed."""
    response['Cache-Control'] = 'no-store, private'
    response['Pragma'] = 'no-cache'
    response['X-Robots-Tag'] = 'noindex, nofollow, noarchive'
    return response

"""Builds and signs License Certificates per the wire contract.

Certificate shape (contract "License Certificate" section)::

    {
      "payload": {
        "certVersion": 1,
        "schoolId": "SCH-00125",
        "deviceId": "HW-F398-84D2",
        "plan": "first_year_free",
        "issuedAt": "2026-09-01T00:00:00Z",
        "expiresAt": "2027-09-01T00:00:00Z"
      },
      "signature": "<base64 DER ECDSA signature over canonical JSON of payload>"
    }
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from .crypto import sign_payload

CERT_VERSION = 1

PLAN_FIRST_YEAR_FREE = 'first_year_free'
PLAN_ANNUAL = 'annual'
PLAN_CHOICES = (PLAN_FIRST_YEAR_FREE, PLAN_ANNUAL)

# Both plans currently run a 365-day term; kept as a helper so a future plan
# with a different term length has one obvious place to branch.
PLAN_TERM_DAYS = {
    PLAN_FIRST_YEAR_FREE: 365,
    PLAN_ANNUAL: 365,
}


def _iso(dt) -> str:
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def build_certificate(*, school_id: str, device_id: str, plan: str, issued_at=None, expires_at=None):
    """Build and sign a license certificate.

    ``issued_at``/``expires_at`` may be supplied (e.g. to carry over an
    existing expiry on device replacement); otherwise ``issued_at`` defaults
    to now and ``expires_at`` to ``issued_at + PLAN_TERM_DAYS[plan]``.

    Returns ``(certificate, issued_at, expires_at)`` where ``certificate`` is
    the exact `{payload, signature}` dict the wire contract specifies, and
    the two datetimes are returned alongside for the caller to persist
    (they are not part of the signed payload's wire representation).
    """
    if plan not in PLAN_CHOICES:
        raise ValueError(f'Unknown plan: {plan!r}')

    issued_at = issued_at or timezone.now()
    expires_at = expires_at or (issued_at + timedelta(days=PLAN_TERM_DAYS[plan]))

    payload = {
        'certVersion': CERT_VERSION,
        'schoolId': school_id,
        'deviceId': device_id,
        'plan': plan,
        'issuedAt': _iso(issued_at),
        'expiresAt': _iso(expires_at),
    }
    signature = sign_payload(payload)
    certificate = {'payload': payload, 'signature': signature}
    return certificate, issued_at, expires_at

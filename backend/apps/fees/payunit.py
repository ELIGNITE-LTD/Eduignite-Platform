"""Low-level PayUnit gateway client.

The frontend never sees PayUnit credentials — it only calls our own endpoints,
which use this client. Every gateway request carries three credentials:
  * x-api-key      : the application token (sand_xxx / live_xxx)
  * Authorization  : Basic base64(api_user:api_password)
  * mode           : sandbox | live

Docs: https://developer.payunit.net (make-payment, get-payment-status).
"""

import base64
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class PayunitError(Exception):
    """Raised when PayUnit cannot be reached or returns an error."""


# Operator -> PayUnit gateway shortcode (Cameroon).
# MTN is CM_MTNMOMO (not CM_MTN); Orange is CM_ORANGE — per the account's
# /api/gateway/initialize providers list.
GATEWAYS = {
    'mtn': 'CM_MTNMOMO',
    'mtn_momo': 'CM_MTNMOMO',
    'cm_mtn': 'CM_MTNMOMO',
    'cm_mtnmomo': 'CM_MTNMOMO',
    'orange': 'CM_ORANGE',
    'orange_money': 'CM_ORANGE',
    'cm_orange': 'CM_ORANGE',
}


def _config():
    return getattr(settings, 'PAYUNIT', {}) or {}


def is_configured():
    cfg = _config()
    return bool(cfg.get('API_TOKEN') and cfg.get('API_USER') and cfg.get('API_PASSWORD'))


def resolve_gateway(operator):
    return GATEWAYS.get(str(operator or '').lower(), 'CM_MTN')


def _headers():
    cfg = _config()
    basic = base64.b64encode(
        f"{cfg.get('API_USER', '')}:{cfg.get('API_PASSWORD', '')}".encode('utf-8')
    ).decode('ascii')
    return {
        'x-api-key': cfg.get('API_TOKEN', ''),
        'Authorization': f'Basic {basic}',
        'mode': cfg.get('MODE', 'sandbox'),
        'Content-Type': 'application/json',
    }


def _safe_json(response):
    try:
        return response.json() or {}
    except ValueError:
        return {}


def normalize_status(data):
    """Return one of PENDING / SUCCESS / FAILED / CANCELLED from any response shape."""
    if not isinstance(data, dict):
        return 'PENDING'
    payload = data.get('data') if isinstance(data.get('data'), dict) else data
    raw = (
        payload.get('transaction_status')
        or payload.get('payment_status')
        or data.get('status')
        or ''
    )
    value = str(raw).upper()
    if value in ('SUCCESS', 'SUCCESSFUL', 'SUCCESSFULL', 'COMPLETED'):
        return 'SUCCESS'
    if value in ('FAILED', 'FAILURE', 'ERROR', 'DECLINED'):
        return 'FAILED'
    if value in ('CANCELLED', 'CANCELED'):
        return 'CANCELLED'
    return 'PENDING'


def _error_message(data, fallback):
    msg = data.get('message') if isinstance(data, dict) else None
    if isinstance(msg, (list, tuple)):
        msg = '; '.join(str(item) for item in msg)
    return str(msg) if msg else fallback


def initialize(*, amount, transaction_id, return_url=None, notify_url=None, payment_country='CM'):
    """Create the PayUnit transaction. Required before charging with make_payment."""
    if not is_configured():
        raise PayunitError('PayUnit is not configured on the server.')
    cfg = _config()
    payload = {
        'total_amount': int(round(float(amount))),
        'currency': cfg.get('DEFAULT_CURRENCY', 'XAF'),
        'transaction_id': transaction_id,
        'return_url': return_url or cfg.get('RETURN_URL', ''),
        'payment_country': payment_country,
    }
    notify = notify_url or cfg.get('NOTIFY_URL', '')
    if notify:
        payload['notify_url'] = notify
    try:
        response = requests.post(
            f"{cfg.get('BASE_URL', '')}/api/gateway/initialize",
            json=payload,
            headers=_headers(),
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.warning('PayUnit initialize network error: %s', exc)
        raise PayunitError('Could not reach the mobile money service. Please try again.')
    data = _safe_json(response)
    if response.status_code >= 400 or str(data.get('status', '')).upper() not in ('SUCCESS', 'SUCCESSFUL'):
        logger.warning('PayUnit initialize %s: %s', response.status_code, data)
        raise PayunitError(_error_message(data, f'PayUnit could not start the payment ({response.status_code}).'))
    return data


def make_payment(*, amount, phone, gateway, transaction_id, return_url=None, notify_url=None, description=''):
    """Charge a mobile-money line. PayUnit requires initialize first, then makepayment
    with the same transaction_id. Returns the raw makepayment response dict."""
    if not is_configured():
        raise PayunitError('PayUnit is not configured on the server.')
    cfg = _config()
    amount_int = int(round(float(amount)))
    return_final = return_url or cfg.get('RETURN_URL', '')
    notify = notify_url or cfg.get('NOTIFY_URL', '')

    # Step 1 — create the transaction.
    initialize(amount=amount_int, transaction_id=transaction_id, return_url=return_final, notify_url=notify)

    # Step 2 — charge the chosen mobile-money provider.
    payload = {
        'gateway': gateway,
        'transaction_id': transaction_id,
        'phone_number': str(phone),
        'amount': amount_int,
        'currency': cfg.get('DEFAULT_CURRENCY', 'XAF'),
        'paymentType': 'button',
        'return_url': return_final,
    }
    if notify:
        payload['notify_url'] = notify
    if description:
        payload['description'] = description

    try:
        response = requests.post(
            f"{cfg.get('BASE_URL', '')}/api/gateway/makepayment",
            json=payload,
            headers=_headers(),
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.warning('PayUnit make_payment network error: %s', exc)
        raise PayunitError('Could not reach the mobile money service. Please try again.')

    data = _safe_json(response)
    if response.status_code >= 400:
        logger.warning('PayUnit make_payment %s: %s', response.status_code, data)
        raise PayunitError(_error_message(data, f'PayUnit rejected the payment ({response.status_code}).'))
    return data


def get_status(transaction_id):
    """Query the authoritative status of a transaction by our transaction_id."""
    if not is_configured():
        raise PayunitError('PayUnit is not configured on the server.')
    cfg = _config()
    try:
        response = requests.get(
            f"{cfg.get('BASE_URL', '')}/api/gateway/paymentstatus/{transaction_id}",
            headers=_headers(),
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.warning('PayUnit get_status network error: %s', exc)
        raise PayunitError('Could not reach the mobile money service. Please try again.')
    return _safe_json(response)

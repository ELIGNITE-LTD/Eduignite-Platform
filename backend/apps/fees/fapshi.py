"""Fapshi: the mobile money gateway EduIgnite collects through.

Credentials never leave the server, and nothing here trusts anything a client
or a webhook says. Every decision that moves money is taken from a fresh
`payment-status` call against Fapshi, which is the only authority on whether a
payment happened.

Three facts from Fapshi's documentation shape this module, and each one is a
way payments get lost or duplicated if ignored:

  * **A webhook is sent once.** "Fapshi sends only one webhook request per
    event, regardless of whether your server responds or not." There is no
    retry. A deploy, a restart or a dropped connection at the wrong moment
    means the notification is gone for good, so webhooks can never be the only
    way a payment is noticed - see `reconcile_fapshi_payments`.

  * **Status calls are rate limited** to six per minute per transaction, so
    polling has to be paced rather than eager.

  * **The transaction id is theirs, not ours.** We send `externalId`, they
    return `transId`, and `payment-status` only accepts `transId`. Losing it
    means losing the ability to ever confirm that payment, so it is stored
    before the payer is even prompted.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

SANDBOX_URL = 'https://sandbox.fapshi.com'
LIVE_URL = 'https://live.fapshi.com'

# Fapshi refuses anything smaller.
MINIMUM_AMOUNT = 100

TIMEOUT = 30

MEDIUM_MTN = 'mobile money'
MEDIUM_ORANGE = 'orange money'


class FapshiError(Exception):
    """Fapshi could not be reached, or refused the request."""


def _config():
    return {
        'API_USER': getattr(settings, 'FAPSHI_API_USER', '') or '',
        'API_KEY': getattr(settings, 'FAPSHI_API_KEY', '') or '',
        'BASE_URL': (getattr(settings, 'FAPSHI_BASE_URL', '') or SANDBOX_URL).rstrip('/'),
        'WEBHOOK_SECRET': getattr(settings, 'FAPSHI_WEBHOOK_SECRET', '') or '',
    }


def is_configured():
    cfg = _config()
    return bool(cfg['API_USER'] and cfg['API_KEY'])


def is_live():
    return _config()['BASE_URL'].startswith(LIVE_URL)


def webhook_secret():
    return _config()['WEBHOOK_SECRET']


def _headers():
    cfg = _config()
    return {
        'apiuser': cfg['API_USER'],
        'apikey': cfg['API_KEY'],
        'Content-Type': 'application/json',
    }


def resolve_medium(operator):
    """The payer's network, as Fapshi names it.

    Left unset when unknown: Fapshi then works it out from the number itself,
    which is more reliable than a guess from a dropdown.
    """
    value = str(operator or '').strip().lower()
    if value in ('orange', 'orange money', 'om', 'orange_money'):
        return MEDIUM_ORANGE
    if value in ('mtn', 'mtn momo', 'momo', 'mobile money', 'mtn_momo', 'mobile_money'):
        return MEDIUM_MTN
    return None


def _request(method, path, payload=None):
    if not is_configured():
        raise FapshiError('Mobile money is not configured on the server.')

    cfg = _config()
    url = f"{cfg['BASE_URL']}{path}"
    try:
        response = requests.request(
            method,
            url,
            json=payload,
            headers=_headers(),
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        # The request may still have reached Fapshi. The caller must treat this
        # as unknown, never as a failure, or a payment the payer has already
        # approved would be written off.
        raise FapshiError(f'Fapshi could not be reached: {exc}') from exc

    try:
        data = response.json()
    except ValueError:
        data = {}

    if response.status_code >= 400:
        message = data.get('message') if isinstance(data, dict) else None
        raise FapshiError(str(message) if message else f'Fapshi returned {response.status_code}.')

    return data if isinstance(data, dict) else {}


def direct_pay(*, amount, phone, external_id, medium=None, name='', email='', user_id='', message=''):
    """Prompt a payer's mobile money line directly.

    Returns Fapshi's `transId`, which is the only handle that can confirm this
    payment afterwards.
    """
    payload = {
        'amount': int(amount),
        'phone': str(phone),
        'externalId': str(external_id),
    }
    if medium:
        payload['medium'] = medium
    if name:
        payload['name'] = name
    if email:
        payload['email'] = email
    if user_id:
        payload['userId'] = str(user_id)
    if message:
        payload['message'] = message[:200]

    return _request('POST', '/direct-pay', payload)


def initiate_pay(*, amount, external_id, email='', user_id='', redirect_url='', message=''):
    """Create a hosted checkout link, for a payer who is not at a phone prompt."""
    payload = {
        'amount': int(amount),
        'externalId': str(external_id),
    }
    if email:
        payload['email'] = email
    if user_id:
        payload['userId'] = str(user_id)
    if redirect_url:
        payload['redirectUrl'] = redirect_url
    if message:
        payload['message'] = message[:200]

    return _request('POST', '/initiate-pay', payload)


def payment_status(trans_id):
    """Fapshi's own word on a transaction. The only thing worth acting on."""
    if not trans_id:
        raise FapshiError('No Fapshi transaction id to check.')
    return _request('GET', f'/payment-status/{trans_id}')


def expire_pay(trans_id):
    """Close a transaction that must not be payable any more."""
    return _request('POST', '/expire-pay', {'transId': str(trans_id)})


# Fapshi's states, mapped onto the ones GatewayTransaction already uses.
#
# EXPIRED becomes CANCELLED rather than FAILED: nothing went wrong, the payer
# simply never completed it, and the two read differently to whoever is looking
# at the record afterwards.
_STATUS_MAP = {
    'CREATED': 'PENDING',
    'PENDING': 'PENDING',
    'SUCCESSFUL': 'SUCCESS',
    'FAILED': 'FAILED',
    'EXPIRED': 'CANCELLED',
}


def normalize_status(data):
    """PENDING / SUCCESS / FAILED / CANCELLED from a Fapshi transaction object.

    Anything unrecognised is PENDING. An unknown state must never be read as
    success, and reading it as failure would write off a payment that may yet
    complete; PENDING leaves it to be resolved by the next status call.
    """
    if not isinstance(data, dict):
        return 'PENDING'
    raw = str(data.get('status') or '').strip().upper()
    return _STATUS_MAP.get(raw, 'PENDING')


def amount_of(data):
    """What Fapshi says was actually paid, as an integer, or None."""
    if not isinstance(data, dict):
        return None
    try:
        return int(data.get('amount'))
    except (TypeError, ValueError):
        return None

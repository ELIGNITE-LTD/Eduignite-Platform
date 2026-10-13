"""Secure, expiring tokens for the partner account-creation link.

Stateless: the token is a signed payload of the application id, so there is no
server-side token row to leak or forget to expire. Django's signer ties it to
SECRET_KEY, and `max_age` enforces expiry on read.
"""

from django.conf import settings
from django.core import signing

_SALT = 'partners.account-creation'
# How long an approval link stays valid.
ACCOUNT_LINK_MAX_AGE_SECONDS = 7 * 24 * 60 * 60  # 7 days


def make_account_token(application_id) -> str:
    return signing.dumps({'app': str(application_id)}, salt=_SALT)


def read_account_token(token: str):
    """Return the application id in a valid, unexpired token, or None."""
    try:
        data = signing.loads(token, salt=_SALT, max_age=ACCOUNT_LINK_MAX_AGE_SECONDS)
    except signing.SignatureExpired:
        return None
    except signing.BadSignature:
        return None
    return data.get('app')


def account_creation_url(application_id) -> str:
    base = getattr(settings, 'FRONTEND_URL', 'https://eduignite.online').rstrip('/')
    return f'{base}/partners/create-account?token={make_account_token(application_id)}'

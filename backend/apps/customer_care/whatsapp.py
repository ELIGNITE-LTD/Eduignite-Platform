"""WhatsApp for Customer Care: phone normalisation and the provider abstraction.

Only ``ClickToChatProvider`` is implemented. It opens a pre-filled chat in the
executive's WhatsApp; a person must press send. So the system can never know the
message was sent, delivered or read, and never claims it (see
``models.Message.transition``). ``OfficialApiProvider`` is a stub that reports its
configuration state; it sends nothing until it is built and verified.
"""

import hashlib
import hmac
import re
from urllib.parse import quote

from django.conf import settings

DEFAULT_COUNTRY_CODE = '237'  # Cameroon

STATE_CLICK_TO_CHAT = 'click_to_chat_available'
STATE_API_NOT_CONFIGURED = 'official_api_not_configured'
STATE_API_VERIFIED = 'official_api_configured_verified'
STATE_API_ATTENTION = 'official_api_requires_attention'


class InvalidPhoneNumber(ValueError):
    pass


def normalize_phone(raw, default_country=DEFAULT_COUNTRY_CODE) -> str:
    """Return international digits without '+' or raise ``InvalidPhoneNumber``.

    Cameroon default: a 9-digit mobile starting with 6 gets 237 in front. Anything
    ambiguous is rejected rather than guessed.
    """
    text = str(raw or '').strip()
    if not text:
        raise InvalidPhoneNumber('No phone number is stored for this customer.')
    if re.search(r'[A-Za-z]', text):
        raise InvalidPhoneNumber('The phone number contains letters.')
    has_plus = text.startswith('+')
    digits = re.sub(r'\D', '', text)
    if not has_plus and digits.startswith('00'):
        digits, has_plus = digits[2:], True
    if not digits or len(set(digits)) == 1:
        raise InvalidPhoneNumber('The phone number is not valid.')
    if not has_plus:
        if len(digits) == 9 and digits.startswith('6'):
            digits = default_country + digits
        elif digits.startswith('0'):
            raise InvalidPhoneNumber('Add the country code to this number (a leading 0 is ambiguous).')
        elif not (11 <= len(digits) <= 15):
            raise InvalidPhoneNumber('The phone number is not valid for international use.')
    if not (8 <= len(digits) <= 15) or digits.startswith('0'):
        raise InvalidPhoneNumber('The phone number is not valid for international use.')
    if digits.startswith(default_country):
        if len(digits) != len(default_country) + 9 or digits[len(default_country)] != '6':
            raise InvalidPhoneNumber('Not a valid Cameroon mobile number for WhatsApp.')
    return digits


def build_click_to_chat_text(*, customer_name, sender_name, sender_role, body) -> str:
    """Plain-text, branded WhatsApp message (no HTML)."""
    role = sender_role or 'Customer Care Executive'
    return (
        'EduIgnite | Official Customer Care\n\n'
        f'Hello {customer_name},\n\n'
        f'My name is {sender_name}, Customer Care Executive at EduIgnite.\n\n'
        f'{body.strip()}\n\n'
        'Kind regards,\n'
        f'{sender_name}\n'
        f'{role}\n'
        'EduIgnite'
    )


class WhatsAppProvider:
    """Base class: one subclass per way of reaching WhatsApp."""

    key = 'base'
    supports_delivery_reports = False

    def config_state(self) -> str:  # pragma: no cover - abstract
        raise NotImplementedError

    def prepare(self, *, phone_digits: str, text: str) -> dict:  # pragma: no cover - abstract
        raise NotImplementedError


class ClickToChatProvider(WhatsAppProvider):
    key = 'click_to_chat'

    def config_state(self):
        return STATE_CLICK_TO_CHAT

    def prepare(self, *, phone_digits, text):
        return {'url': f'https://wa.me/{phone_digits}?text={quote(text, safe="")}', 'manual': True}


class OfficialApiProvider(WhatsAppProvider):
    """Stub for the WhatsApp Business Cloud API. Sends nothing yet."""

    key = 'official_api'
    supports_delivery_reports = True
    WINDOW_NOTE = ('Official API: free-form messages only within 24 hours of the last customer '
                   'message; otherwise an approved template and recorded opt-in are required.')

    def _credentials(self):
        from apps.platform.models import IntegrationSecrets

        row = IntegrationSecrets.load()
        return (row.whatsapp_api_token or '', row.whatsapp_phone_number_id or '',
                row.whatsapp_webhook_secret or '', bool(row.whatsapp_api_verified))

    def config_state(self):
        token, phone_id, secret, verified = self._credentials()
        if not token and not phone_id and not secret:
            return STATE_API_NOT_CONFIGURED
        if token and phone_id and secret and verified:
            return STATE_API_VERIFIED
        return STATE_API_ATTENTION

    def prepare(self, *, phone_digits, text):
        raise NotImplementedError('The official WhatsApp API provider is not implemented yet.')

    def verify_signature(self, raw_body: bytes, header_value: str) -> bool:
        """X-Hub-Signature-256 check (HMAC-SHA256 of the raw body with the app secret)."""
        _token, _phone_id, secret, _verified = self._credentials()
        if not secret or not header_value or not header_value.startswith('sha256='):
            return False
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, header_value.split('=', 1)[1])


def whatsapp_status() -> dict:
    """Founder-facing configuration status. Never contains a secret."""
    api = OfficialApiProvider()
    return {
        'click_to_chat': {'state': STATE_CLICK_TO_CHAT, 'available': True,
                          'note': 'Opens WhatsApp with a prepared message. A person must press send; '
                                  'delivery cannot be confirmed.'},
        'official_api': {'state': api.config_state(), 'note': api.WINDOW_NOTE,
                         'webhook_path': '/api/v1/customer-care/webhooks/whatsapp/'},
    }

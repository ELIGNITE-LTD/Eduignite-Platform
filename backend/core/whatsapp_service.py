"""Sending WhatsApp messages through the WhatsApp Business Cloud API (Meta).

The access token and phone-number id are the ones the founders already enter on the Integrations page
(``IntegrationSecrets``); the environment variables ``WHATSAPP_API_TOKEN`` / ``WHATSAPP_PHONE_NUMBER_ID`` are the fallback.

WhatsApp only lets a business START a conversation with an approved *template* message. Free text is delivered only
to someone who wrote to the number in the last 24 hours. So for outreach to schools that have never written to us,
set ``OUTREACH_WHATSAPP_TEMPLATE`` to the name of an approved template whose body has two variables: {{1}} the school
name and {{2}} the message. Without a template the message is sent as plain text, which works only inside that 24-hour window.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

GRAPH = 'https://graph.facebook.com/v20.0'
TIMEOUT = 20

_FRIENDLY = {
    131047: 'WhatsApp only lets us message people who wrote to us in the last 24 hours. Set an approved message template (OUTREACH_WHATSAPP_TEMPLATE) to contact new schools.',
    131026: 'This number is not on WhatsApp.',
    131030: 'This number is not on the allowed list yet (test numbers must be added in the WhatsApp developer console).',
    131048: 'WhatsApp is limiting messages from this business (spam rate limit). Try again later.',
    131056: 'Too many messages sent to this number too fast. Try again later.',
    132000: 'The message template needs a different number of variables.',
    132001: 'The message template does not exist or is not approved in this language.',
    190: 'The WhatsApp access token has expired or is not valid. Enter a new one on the Integrations page.',
}


def credentials():
    """(token, phone_number_id) from the Integrations page, else the environment."""
    token = phone_id = ''
    try:
        from apps.platform.models import IntegrationSecrets

        row = IntegrationSecrets.load()
        token, phone_id = row.whatsapp_api_token, row.whatsapp_phone_number_id
    except Exception:  # noqa: BLE001 - never let a settings lookup stop a send
        pass
    return (token or getattr(settings, 'WHATSAPP_API_TOKEN', '')), (phone_id or getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', ''))


def is_configured() -> bool:
    token, phone_id = credentials()
    return bool(token and phone_id)


def template_name() -> str:
    return (getattr(settings, 'OUTREACH_WHATSAPP_TEMPLATE', '') or '').strip()


def _post(payload):
    token, phone_id = credentials()
    if not (token and phone_id):
        return False, 'WhatsApp is not connected yet. Add the access token and phone number id on the Integrations page.'
    try:
        r = requests.post(f'{GRAPH}/{phone_id}/messages', json=payload, timeout=TIMEOUT,
                          headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    except requests.RequestException as exc:
        logger.warning('WhatsApp request failed: %s', exc)
        return False, 'Could not reach WhatsApp. Try again later.'
    if r.status_code < 300:
        return True, ''
    try:
        err = (r.json() or {}).get('error') or {}
    except ValueError:
        err = {}
    code = err.get('code')
    message = _FRIENDLY.get(code) or str(err.get('error_data', {}).get('details') or err.get('message') or f'WhatsApp refused the message ({r.status_code}).')
    logger.warning('WhatsApp refused a message: %s %s', code, err.get('message'))
    return False, message[:300]


def send_text(to_number: str, text: str):
    """Plain text: delivered only inside the 24-hour window. Returns (ok, error)."""
    return _post({'messaging_product': 'whatsapp', 'to': to_number.lstrip('+'), 'type': 'text',
                  'text': {'preview_url': False, 'body': text[:4000]}})


def send_template(to_number: str, name: str, language: str, variables):
    """An approved template with body variables {{1}}, {{2}}... Returns (ok, error)."""
    params = [{'type': 'text', 'text': (v or '-').replace('\n', ' ')[:1000]} for v in variables]
    return _post({'messaging_product': 'whatsapp', 'to': to_number.lstrip('+'), 'type': 'template',
                  'template': {'name': name, 'language': {'code': language},
                               'components': [{'type': 'body', 'parameters': params}] if params else []}})

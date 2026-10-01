"""The Telegram Bot API, as much of it as EduIgnite AI uses.

The token never leaves the server. Every call is a plain HTTPS request, so a
failure is an exception the caller can log without the whole update being
lost: a message that could not be sent is reported, not retried forever.
"""

from __future__ import annotations

import json
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

API_ROOT = 'https://api.telegram.org'
TIMEOUT = 30
#: Telegram's limit on one message. Longer text is split, or sent as a PDF.
MESSAGE_LIMIT = 4096


class TelegramError(Exception):
    def __init__(self, message, *, blocked=False):
        super().__init__(message)
        self.blocked = blocked


def token() -> str:
    return getattr(settings, 'TELEGRAM_BOT_TOKEN', '') or ''


def webhook_secret() -> str:
    return getattr(settings, 'TELEGRAM_WEBHOOK_SECRET', '') or ''


def bot_username() -> str:
    return (getattr(settings, 'TELEGRAM_BOT_USERNAME', '') or '').lstrip('@')


def is_configured() -> bool:
    return bool(token())


def call(method: str, *, files=None, **params):
    """One Bot API call. Returns its `result`, or raises TelegramError."""
    if not is_configured():
        raise TelegramError('TELEGRAM_BOT_TOKEN is not configured.')
    url = f'{API_ROOT}/bot{token()}/{method}'
    try:
        if files:
            data = {
                key: json.dumps(value) if isinstance(value, (dict, list)) else value
                for key, value in params.items() if value is not None
            }
            response = requests.post(url, data=data, files=files, timeout=TIMEOUT)
        else:
            payload = {key: value for key, value in params.items() if value is not None}
            response = requests.post(url, json=payload, timeout=TIMEOUT)
    except requests.RequestException as exc:
        raise TelegramError(f'Telegram could not be reached: {exc}') from exc
    try:
        body = response.json()
    except ValueError:
        body = {}
    if not body.get('ok'):
        description = str(body.get('description') or f'HTTP {response.status_code}')
        # 403: the person blocked the bot or deleted the chat. Not an error to
        # keep retrying, just someone who has left.
        raise TelegramError(description, blocked=response.status_code == 403)
    return body.get('result')


def send_message(chat_id, text, *, reply_markup=None, parse_mode='HTML', reply_to=None):
    return call(
        'sendMessage',
        chat_id=chat_id,
        text=text[:MESSAGE_LIMIT],
        parse_mode=parse_mode,
        reply_markup=reply_markup,
        reply_to_message_id=reply_to,
        link_preview_options={'is_disabled': True},
    )


def edit_message(chat_id, message_id, text, *, reply_markup=None, parse_mode='HTML'):
    return call(
        'editMessageText', chat_id=chat_id, message_id=message_id, text=text[:MESSAGE_LIMIT],
        parse_mode=parse_mode, reply_markup=reply_markup,
    )


def delete_message(chat_id, message_id):
    try:
        call('deleteMessage', chat_id=chat_id, message_id=message_id)
    except TelegramError:
        pass


def send_chat_action(chat_id, action='typing'):
    try:
        call('sendChatAction', chat_id=chat_id, action=action)
    except TelegramError:
        pass


def send_document(chat_id, filename: str, content: bytes, *, caption='', reply_markup=None):
    return call(
        'sendDocument',
        files={'document': (filename, content, 'application/pdf')},
        chat_id=chat_id,
        caption=caption[:1024] if caption else None,
        parse_mode='HTML' if caption else None,
        reply_markup=reply_markup,
    )


def answer_callback(callback_id, text=''):
    try:
        call('answerCallbackQuery', callback_query_id=callback_id, text=text[:200] or None)
    except TelegramError:
        pass


def download_file(file_id: str, *, max_bytes: int = 20 * 1024 * 1024) -> bytes:
    """The bytes of a file someone sent, such as a photo of a question."""
    info = call('getFile', file_id=file_id) or {}
    path = info.get('file_path')
    if not path:
        raise TelegramError('Telegram did not return the file.')
    if int(info.get('file_size') or 0) > max_bytes:
        raise TelegramError('That file is too large.')
    try:
        response = requests.get(f'{API_ROOT}/file/bot{token()}/{path}', timeout=TIMEOUT)
    except requests.RequestException as exc:
        raise TelegramError(f'Telegram could not be reached: {exc}') from exc
    if response.status_code != 200:
        raise TelegramError(f'The file could not be downloaded ({response.status_code}).')
    return response.content


def inline_keyboard(rows):
    """[[('Label', 'callback-data'), ...], ...] -> Telegram's inline keyboard."""
    return {
        'inline_keyboard': [
            [
                {'text': label, 'url': data[4:]} if str(data).startswith('url:') else {'text': label, 'callback_data': data}
                for label, data in row
            ]
            for row in rows
        ]
    }


def contact_keyboard(label):
    """A one-tap button that shares the person's own phone number."""
    return {
        'keyboard': [[{'text': label, 'request_contact': True}]],
        'resize_keyboard': True,
        'one_time_keyboard': True,
    }


def remove_keyboard():
    return {'remove_keyboard': True}

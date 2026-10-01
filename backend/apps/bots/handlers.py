"""EduIgnite AI on Telegram: one update in, the right reply out.

Everything a person can do in the app's assistant, they can do here:

  * ask in words or with photos of the question, and get the same answer the
    app would give, paid for in the same AI credits;
  * download any answer as a PDF, and get it as a PDF automatically whenever
    it has a graph, a chart or a diagram, since a chat cannot draw one;
  * check their credits, buy more by mobile money, and link their EduIgnite
    account so the bot knows who they are.

A failure in any one step is told to the person plainly and never costs them
credits: the credit engine refunds anything the model did not answer.
"""

from __future__ import annotations

import html
import logging
import re
import secrets
import time

from django.core.cache import cache
from rest_framework.exceptions import ValidationError

from apps.ai_features import credit_engine
from apps.ai_features.assistant import AssistantUnavailable, answer
from apps.ai_features.credit_models import AICreditTransaction
from apps.ai_features.credit_purchases import PurchaseError, parse_credits, quote, start_purchase
from apps.ai_features.vision import images_from_bytes, max_images

from . import formatting, rendering, telegram
from .identities import LinkError, identity_for, link, unlink
from .messages import say
from .models import CHANNEL_TELEGRAM, BotIdentity

logger = logging.getLogger(__name__)

CHANNEL = CHANNEL_TELEGRAM
#: Questions one chat may send in a minute before being asked to slow down.
RATE_PER_MINUTE = 8
#: How many turns of the conversation go with the next question.
HISTORY_TURNS = 10
#: How many recent answers can still be turned into a PDF on request.
KEEP_ANSWERS = 6
#: How long a "Continue?" question waits for an answer.
PENDING_SECONDS = 15 * 60
BUY_AMOUNTS = [100, 250, 500, 1000, 2500, 5000]


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _full_name(sender: dict) -> str:
    return ' '.join(part for part in (sender.get('first_name'), sender.get('last_name')) if part).strip()


def _send(chat_id, html_text, *, reply_markup=None):
    """Send HTML, falling back to plain text if Telegram cannot parse it."""
    try:
        return telegram.send_message(chat_id, html_text, reply_markup=reply_markup)
    except telegram.TelegramError as exc:
        if 'parse' not in str(exc).lower() and "can't find end" not in str(exc).lower():
            raise
        plain = re.sub(r'<[^>]+>', '', html_text)
        import html as html_lib

        return telegram.send_message(chat_id, html_lib.unescape(plain), reply_markup=reply_markup, parse_mode=None)


def _allowed(identity: BotIdentity) -> bool:
    key = f'bots:rate:{identity.channel}:{identity.external_id}:{int(time.time() // 60)}'
    if cache.add(key, 1, 90):
        return True
    try:
        count = cache.incr(key)
    except ValueError:
        cache.set(key, 1, 90)
        count = 1
    return count <= RATE_PER_MINUTE


def _save_state(identity: BotIdentity):
    BotIdentity.objects.filter(pk=identity.pk).update(state=identity.state)


def _prune(entries: dict, keep: int, max_age: int | None = None) -> dict:
    now = time.time()
    items = [
        (key, value) for key, value in entries.items()
        if isinstance(value, dict) and (max_age is None or now - value.get('at', 0) < max_age)
    ]
    items.sort(key=lambda item: item[1].get('at', 0))
    return dict(items[-keep:])


def _remember(identity: BotIdentity, bucket: str, value: dict, keep: int, max_age=None) -> str:
    key = secrets.token_hex(4)
    entries = dict(identity.state.get(bucket) or {})
    entries[key] = {**value, 'at': time.time()}
    identity.state[bucket] = _prune(entries, keep, max_age)
    _save_state(identity)
    return key


def _take(identity: BotIdentity, bucket: str, key: str, max_age=None):
    entries = dict(identity.state.get(bucket) or {})
    value = entries.pop(key, None)
    identity.state[bucket] = entries
    _save_state(identity)
    if value and max_age is not None and time.time() - value.get('at', 0) > max_age:
        return None
    return value


def _balance_line(identity, balance) -> str:
    if balance.get('unlimited'):
        return ''
    return str(balance['total_available'])


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def handle_update(update: dict):
    if not isinstance(update, dict):
        return
    if 'callback_query' in update:
        return _handle_callback(update['callback_query'])
    message = update.get('message')
    if not isinstance(message, dict):
        return
    chat = message.get('chat') or {}
    sender = message.get('from') or {}
    if not sender or sender.get('is_bot'):
        return
    if chat.get('type') != 'private':
        # Groups come later; for now the bot talks one to one.
        if (message.get('text') or '').startswith('/'):
            try:
                telegram.send_message(chat['id'], say('private_only', 'en', bot=telegram.bot_username() or 'EduIgniteAIBot'))
            except telegram.TelegramError:
                pass
        return

    identity = identity_for(
        CHANNEL, sender['id'], name=_full_name(sender), username=sender.get('username', ''),
        language_code=sender.get('language_code', ''),
    )
    try:
        _dispatch(identity, message)
    except telegram.TelegramError as exc:
        if exc.blocked:
            BotIdentity.objects.filter(pk=identity.pk).update(is_blocked=True)
        else:
            logger.warning('Telegram reply failed for %s: %s', identity.external_id, exc)
    except Exception:  # noqa: BLE001 - one bad message must not stop the bot
        logger.exception('Bot update failed for %s', identity.external_id)
        try:
            telegram.send_message(identity.external_id, say('error', identity.language))
        except telegram.TelegramError:
            pass


def _dispatch(identity: BotIdentity, message: dict):
    chat_id = identity.external_id
    lang = identity.language
    text = (message.get('text') or message.get('caption') or '').strip()

    contact = message.get('contact')
    if contact:
        if str(contact.get('user_id') or '') == identity.external_id and identity.state.get('awaiting') == 'phone':
            return _handle_phone(identity, contact.get('phone_number', ''))
        return _send(chat_id, say('unsupported', lang))

    if message.get('text', '').startswith('/'):
        return _handle_command(identity, message['text'])

    if identity.state.get('awaiting') == 'phone' and message.get('text'):
        return _handle_phone(identity, message['text'])

    photo_id = None
    if message.get('photo'):
        photo_id = message['photo'][-1]['file_id']  # the largest size
    elif (message.get('document') or {}).get('mime_type', '').startswith('image/'):
        photo_id = message['document']['file_id']
    if photo_id:
        group = message.get('media_group_id')
        if group:
            return _collect_album(identity, group, photo_id, text)
        return ask(identity, text, photos=[photo_id])

    if message.get('voice') or message.get('audio') or message.get('video_note'):
        return _send(chat_id, say('voice_soon', lang))

    if message.get('text'):
        return ask(identity, text)
    return _send(chat_id, say('unsupported', lang))


def _collect_album(identity: BotIdentity, group: str, photo_id: str, caption: str):
    """Several photos sent together are one question, not one each."""
    from .tasks import process_album

    key = f'bots:album:{identity.pk}:{group}'
    album = cache.get(key) or {'photos': [], 'caption': ''}
    if photo_id not in album['photos']:
        album['photos'].append(photo_id)
    album['caption'] = album['caption'] or caption
    cache.set(key, album, 120)
    if cache.add(f'{key}:scheduled', 1, 120):
        process_album.apply_async(args=[identity.pk, key], countdown=4)


# ---------------------------------------------------------------------------
# Asking
# ---------------------------------------------------------------------------

def ask(identity: BotIdentity, text: str, *, photos=(), confirmed=False):
    chat_id = identity.external_id
    lang = identity.language
    photos = list(photos)[:max_images()]
    if not _allowed(identity):
        return _send(chat_id, say('slow_down', lang))

    status = telegram.send_message(chat_id, say('reading_photo' if photos else 'thinking', lang))
    status_id = (status or {}).get('message_id')
    telegram.send_chat_action(chat_id, 'typing')

    def clear_status():
        if status_id:
            telegram.delete_message(chat_id, status_id)

    images = []
    if photos:
        try:
            images = images_from_bytes([telegram.download_file(file_id) for file_id in photos])
        except (ValidationError, telegram.TelegramError) as exc:
            clear_status()
            reason = exc.detail.get('images') if isinstance(getattr(exc, 'detail', None), dict) else str(exc)
            return _send(chat_id, say('bad_photo', lang, reason=reason))

    def show(message_text):
        # A whole paper takes a while: keep the one status message current.
        if status_id:
            try:
                telegram.edit_message(chat_id, status_id, message_text)
            except telegram.TelegramError:
                pass
        telegram.send_chat_action(chat_id, 'typing')

    def on_paper(paper):
        show(say('paper_found', lang, count=len(paper.questions),
                 title=html.escape(paper.title or say('paper_untitled', lang))))

    def on_progress(done, total):
        if done < total:
            show(say('paper_progress', lang, done=done, total=total))

    identity.refresh_from_db(fields=['user', 'history', 'state'])
    try:
        result = answer(
            identity.user, text, history=identity.history, images=images, channel=CHANNEL,
            can_confirm=True, confirmed=confirmed, on_paper=on_paper, on_progress=on_progress,
        )
    except credit_engine.CreditConfirmationRequired as needed:
        key = _remember(identity, 'pending', {'text': text, 'photos': photos}, 5, PENDING_SECONDS)
        clear_status()
        estimate = needed.extra['estimate']['credits']
        total = needed.extra['balance']['total_available']
        return _send(chat_id, say('confirm', lang, credits=estimate, total=total), reply_markup=telegram.inline_keyboard([
            [(say('confirm_yes', lang), f'ok:{key}'), (say('confirm_no', lang), f'no:{key}')],
        ]))
    except credit_engine.InsufficientCredits as short:
        clear_status()
        return _send_insufficient(identity, short.extra.get('required'), short.extra.get('available'))
    except AssistantUnavailable:
        clear_status()
        return _send(chat_id, say('unavailable', lang))

    clear_status()
    question = text or ('📷' * len(photos))
    if result.questions:
        _deliver_paper(identity, result)
    else:
        _deliver(identity, question, result.reply, result.credits_used, result.balance)

    history = list(identity.history or [])
    history.append({'role': 'user', 'content': (text or '[photo of a question]')[:2000]})
    history.append({'role': 'assistant', 'content': result.reply[:4000]})
    BotIdentity.objects.filter(pk=identity.pk).update(history=history[-HISTORY_TURNS * 2:])


def _deliver(identity: BotIdentity, question: str, reply: str, used: int, balance: dict):
    chat_id = identity.external_id
    lang = identity.language
    key = _remember(identity, 'answers', {'q': question[:1000], 'a': reply}, KEEP_ANSWERS)
    footer = '' if balance.get('unlimited') else say('cost_line', lang, used=used, total=balance['total_available'])
    pdf_button = telegram.inline_keyboard([[(say('pdf_button', lang), f'pdf:{key}')]])

    with_chart = formatting.needs_pdf(reply)
    body = formatting.to_telegram_html(
        formatting.strip_visuals(reply, say('chart_note', lang)) if with_chart else reply
    )
    parts = formatting.split_for_telegram(body)
    for index, part in enumerate(parts):
        last = index == len(parts) - 1
        text = f'{part}\n\n{footer}' if last and footer else part
        _send(chat_id, text, reply_markup=pdf_button if last and not with_chart else None)

    if with_chart:
        # The rule: anything with a graph or chart comes as a PDF, drawn.
        _send_pdf(identity, question, reply)


def _deliver_paper(identity: BotIdentity, result):
    """A whole paper: a short note in the chat, and the full solution as one PDF."""
    chat_id = identity.external_id
    lang = identity.language
    title = result.paper_title or say('paper_untitled', lang)
    key = _remember(identity, 'answers', {'q': title[:1000], 'a': result.reply}, KEEP_ANSWERS)
    balance = result.balance
    footer = '' if balance.get('unlimited') else say(
        'cost_line', lang, used=result.credits_used, total=balance['total_available'],
    )
    lines = [say('paper_done', lang, title=html.escape(title), total=result.questions,
                 solved=result.questions - len(result.unsolved))]
    if result.unsolved:
        lines.append(say('paper_missed', lang, which=html.escape(', '.join(result.unsolved))))
    if footer:
        lines.append(footer)
    _send(chat_id, '\n\n'.join(lines),
          reply_markup=telegram.inline_keyboard([[(say('pdf_button', lang), f'pdf:{key}')]]))
    _send_pdf(identity, title, result.reply, caption=say('paper_caption', lang))


def _send_pdf(identity: BotIdentity, question: str, reply: str, *, caption: str | None = None):
    chat_id = identity.external_id
    lang = identity.language
    telegram.send_chat_action(chat_id, 'upload_document')
    try:
        pdf = rendering.answer_pdf(
            question, reply, asked_by=identity.display_name, language=lang, chart_note=say('chart_note', lang),
        )
    except Exception:  # noqa: BLE001 - the text answer has already been sent
        logger.exception('Could not make the PDF for %s', identity.external_id)
        return _send(chat_id, say('pdf_failed', lang))
    slug = re.sub(r'[^a-z0-9]+', '-', question.lower()).strip('-')[:40] or 'answer'
    telegram.send_document(chat_id, f'EduIgnite-AI-{slug}.pdf', pdf, caption=caption or say('pdf_caption', lang))


def _send_insufficient(identity: BotIdentity, required, available):
    lang = identity.language
    config = credit_engine.get_config()
    text = say('insufficient', lang, required=required or '?', available=available if available is not None else 0)
    if not identity.is_linked and (identity.user.role or '') == 'AI_GUEST':
        text += '\n\n' + say('guest_upsell', lang, guest=config.guest_daily_free_credits)
    rows = []
    if config.purchases_enabled:
        rows.append([('💳 /buy', 'buy:menu')])
    return _send(identity.external_id, text, reply_markup=telegram.inline_keyboard(rows) if rows else None)


# ---------------------------------------------------------------------------
# Buttons under messages
# ---------------------------------------------------------------------------

def _handle_callback(callback: dict):
    sender = callback.get('from') or {}
    data = str(callback.get('data') or '')
    message = callback.get('message') or {}
    if not sender:
        return
    identity = identity_for(
        CHANNEL, sender['id'], name=_full_name(sender), username=sender.get('username', ''),
        language_code=sender.get('language_code', ''),
    )
    lang = identity.language
    chat_id = identity.external_id
    action, _, key = data.partition(':')
    try:
        if action in ('ok', 'no'):
            telegram.answer_callback(callback.get('id'))
            pending = _take(identity, 'pending', key, PENDING_SECONDS)
            if message.get('message_id'):
                telegram.edit_message(
                    chat_id, message['message_id'],
                    say('cancelled', lang) if action == 'no' else f"✅ {say('confirm_yes', lang)[2:]}",
                )
            if action == 'no':
                return
            if not pending:
                return _send(chat_id, say('expired_request', lang))
            return ask(identity, pending.get('text', ''), photos=pending.get('photos') or [], confirmed=True)

        if action == 'pdf':
            telegram.answer_callback(callback.get('id'), say('pdf_making', lang))
            stored = (identity.state.get('answers') or {}).get(key)
            if not stored:
                return _send(chat_id, say('pdf_gone', lang))
            return _send_pdf(identity, stored.get('q', ''), stored.get('a', ''))

        if action == 'buy':
            telegram.answer_callback(callback.get('id'))
            return _buy_menu(identity) if key == 'menu' else _buy_amount(identity, key)

        telegram.answer_callback(callback.get('id'))
    except telegram.TelegramError as exc:
        logger.warning('Telegram callback reply failed for %s: %s', chat_id, exc)
    except Exception:  # noqa: BLE001
        logger.exception('Bot callback failed for %s', chat_id)
        try:
            telegram.send_message(chat_id, say('error', lang))
        except telegram.TelegramError:
            pass


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def _handle_command(identity: BotIdentity, text: str):
    command, _, argument = text.strip().partition(' ')
    command = command.split('@', 1)[0].lower()
    argument = argument.strip()
    lang = identity.language
    chat_id = identity.external_id

    if command == '/start':
        if argument.lower().startswith('link_'):
            return _link(identity, argument[5:])
        return _welcome(identity)
    if command == '/help':
        return _send(chat_id, say('help', lang))
    if command == '/balance':
        return _balance(identity)
    if command == '/buy':
        return _buy_amount(identity, argument) if argument else _buy_menu(identity)
    if command == '/cancel':
        identity.state.pop('awaiting', None)
        identity.state.pop('buy_credits', None)
        _save_state(identity)
        return _send(chat_id, say('cancelled', lang), reply_markup=telegram.remove_keyboard())
    if command == '/link':
        return _link(identity, argument) if argument else _send(chat_id, say('link_how', lang))
    if command == '/unlink':
        if not identity.is_linked:
            return _send(chat_id, say('not_linked', lang))
        unlink(identity)
        return _send(chat_id, say('unlinked', lang))
    if command == '/new':
        BotIdentity.objects.filter(pk=identity.pk).update(history=[])
        return _send(chat_id, say('new_chat', lang))
    if command == '/history':
        return _history(identity)
    if command in ('/language', '/lang', '/langue'):
        identity.language = 'fr' if identity.language == 'en' else 'en'
        BotIdentity.objects.filter(pk=identity.pk).update(language=identity.language)
        return _send(chat_id, say('language_set', identity.language))
    return _send(chat_id, say('help', lang))


def _welcome(identity: BotIdentity):
    lang = identity.language
    balance = credit_engine.balance(identity.user)
    first_name = (identity.display_name or '').split(' ')[0] or 'there'
    if balance.get('free_mode'):
        return _send(identity.external_id, say('welcome_free', lang, name=first_name))
    guest_line = '' if identity.is_linked else say('guest_line', lang)
    return _send(identity.external_id, say(
        'welcome', lang, name=first_name, allowance=balance['daily_free_limit'], guest_line=guest_line,
    ))


def _balance(identity: BotIdentity):
    lang = identity.language
    balance = credit_engine.balance(identity.user)
    if balance.get('free_mode'):
        return _send(identity.external_id, say('free_mode', lang))
    if balance['unlimited']:
        return _send(identity.external_id, say('unlimited', lang))
    text = say(
        'balance', lang, free=balance['daily_free_remaining'], limit=balance['daily_free_limit'],
        purchased=balance['purchased_balance'], total=balance['total_available'],
    )
    if balance.get('is_guest'):
        text += '\n\n' + say('guest_upsell', lang, guest=balance['daily_free_limit'])
    config = credit_engine.get_config()
    markup = telegram.inline_keyboard([[('💳 /buy', 'buy:menu')]]) if config.purchases_enabled else None
    return _send(identity.external_id, text, reply_markup=markup)


def _history(identity: BotIdentity):
    lang = identity.language
    lines = AICreditTransaction.objects.filter(user=identity.user).order_by('-created_at')[:10]
    if not lines:
        return _send(identity.external_id, say('history_empty', lang))
    rows = [say('history_title', lang), '']
    for line in lines:
        label = credit_engine.FEATURE_LABELS.get(line.feature, '') if line.kind == AICreditTransaction.AI_USAGE else ''
        rows.append(
            f"{'+' if line.amount > 0 else '−'}{abs(line.amount)} · {label or line.description or line.get_kind_display()}"
            f" · <i>{line.created_at:%d %b %H:%M}</i>"
        )
    return _send(identity.external_id, '\n'.join(rows))


def _link(identity: BotIdentity, code: str):
    lang = identity.language
    if identity.is_linked:
        return _send(identity.external_id, say('link_already', lang, name=identity.user.get_full_name()))
    try:
        user, moved = link(identity, code)
    except LinkError:
        return _send(identity.external_id, say('link_bad', lang))
    moved_text = say('link_moved', lang, n=moved) if moved else ''
    return _send(identity.external_id, say('link_done', lang, name=user.get_full_name(), moved=moved_text))


# ---------------------------------------------------------------------------
# Buying credits
# ---------------------------------------------------------------------------

def _buy_menu(identity: BotIdentity):
    lang = identity.language
    config = credit_engine.get_config()
    if not config.billing_enabled:
        return _send(identity.external_id, say('buy_free', lang))
    if not config.purchases_enabled:
        return _send(identity.external_id, say('buy_closed', lang))
    low, high = int(config.min_purchase_credits), int(config.max_purchase_credits)
    amounts = [amount for amount in BUY_AMOUNTS if low <= amount <= high] or [low]
    rows = [[(f'{amount:,}', f'buy:{amount}') for amount in amounts[i:i + 3]] for i in range(0, len(amounts), 3)]
    return _send(identity.external_id, say(
        'buy_choose', lang, min=f'{low:,}', max=f'{high:,}', price=f'{float(config.price_per_credit):g}',
    ), reply_markup=telegram.inline_keyboard(rows))


def _buy_amount(identity: BotIdentity, raw):
    lang = identity.language
    config = credit_engine.get_config()
    if not config.billing_enabled:
        return _send(identity.external_id, say('buy_free', lang))
    if not config.purchases_enabled:
        return _send(identity.external_id, say('buy_closed', lang))
    credits, error = parse_credits(raw, config)
    if error:
        return _send(identity.external_id, error)
    offer = quote(config, credits)
    if not offer['payable']:
        return _send(identity.external_id, say(
            'buy_error', lang, reason=f"mobile money payments start at {offer['minimum_payment']} FCFA",
        ))
    identity.state['awaiting'] = 'phone'
    identity.state['buy_credits'] = credits
    _save_state(identity)
    return _send(
        identity.external_id,
        say('buy_quote', lang, credits=f'{credits:,}', price=f"{offer['price']:,}"),
        reply_markup=telegram.contact_keyboard(say('share_phone', lang)),
    )


def normalise_phone(raw: str) -> str | None:
    """A Cameroon mobile number as 9 digits, or None."""
    digits = re.sub(r'\D', '', raw or '')
    if digits.startswith('00237'):
        digits = digits[5:]
    elif digits.startswith('237') and len(digits) == 12:
        digits = digits[3:]
    return digits if re.fullmatch(r'6\d{8}', digits) else None


def _handle_phone(identity: BotIdentity, raw: str):
    from .tasks import follow_bot_purchase

    lang = identity.language
    phone = normalise_phone(raw)
    if not phone:
        return _send(identity.external_id, say('buy_bad_phone', lang))
    credits = identity.state.get('buy_credits')
    identity.state.pop('awaiting', None)
    identity.state.pop('buy_credits', None)
    _save_state(identity)
    try:
        txn, _ = start_purchase(identity.user, credits, phone)
    except PurchaseError as error:
        return _send(identity.external_id, say('buy_error', lang, reason=error.message),
                     reply_markup=telegram.remove_keyboard())
    _send(identity.external_id, say(
        'buy_prompted', lang, price=f'{int(txn.amount):,}', phone=phone, credits=f'{txn.ai_credits:,}',
    ), reply_markup=telegram.remove_keyboard())
    follow_bot_purchase.apply_async(args=[identity.pk, txn.transaction_id, 0], countdown=10)

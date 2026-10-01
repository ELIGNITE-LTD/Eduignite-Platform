import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

#: How long the bot keeps checking a payment before handing over to the
#: reconciler (which will still credit it, and the person can see it in
#: /balance).
FOLLOW_ATTEMPTS = 36
FOLLOW_EVERY_SECONDS = 10


@shared_task(ignore_result=True)
def handle_telegram_update(update):
    from .handlers import handle_update

    handle_update(update)


@shared_task(ignore_result=True)
def process_album(identity_id, cache_key):
    """Several photos sent together, answered as one question."""
    from .handlers import ask
    from .models import BotIdentity

    album = cache.get(cache_key)
    cache.delete(cache_key)
    cache.delete(f'{cache_key}:scheduled')
    identity = BotIdentity.objects.select_related('user').filter(pk=identity_id).first()
    if not album or identity is None:
        return
    ask(identity, album.get('caption', ''), photos=album.get('photos') or [])


@shared_task(ignore_result=True)
def follow_bot_purchase(identity_id, transaction_id, attempt=0):
    """Tell the person the moment their credits arrive."""
    from apps.ai_features import credit_engine
    from apps.ai_features.credit_purchases import refresh_purchase
    from apps.fees.models import GatewayTransaction

    from . import telegram
    from .messages import say
    from .models import BotIdentity

    identity = BotIdentity.objects.select_related('user').filter(pk=identity_id).first()
    txn = GatewayTransaction.objects.filter(transaction_id=transaction_id).first()
    if identity is None or txn is None:
        return
    txn = refresh_purchase(txn)
    lang = identity.language
    try:
        if txn.processed:
            balance = credit_engine.balance(identity.user)
            telegram.send_message(identity.external_id, say(
                'buy_done', lang, credits=f'{txn.ai_credits:,}', total=f"{balance['total_available']:,}",
            ))
            return
        if txn.status in (GatewayTransaction.STATUS_FAILED, GatewayTransaction.STATUS_CANCELLED):
            telegram.send_message(identity.external_id, say('buy_failed', lang))
            return
        if attempt + 1 >= FOLLOW_ATTEMPTS or getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
            if attempt + 1 >= FOLLOW_ATTEMPTS:
                telegram.send_message(identity.external_id, say('buy_timeout', lang))
            return
    except telegram.TelegramError as exc:
        logger.warning('Could not tell %s about purchase %s: %s', identity.external_id, transaction_id, exc)
        return
    follow_bot_purchase.apply_async(args=[identity_id, transaction_id, attempt + 1], countdown=FOLLOW_EVERY_SECONDS)


@shared_task(ignore_result=True)
def cleanup_bot_records():
    """Forget update ids and expired link codes nobody needs any more."""
    from .models import BotLinkCode, ProcessedUpdate

    ProcessedUpdate.objects.filter(created_at__lt=timezone.now() - timedelta(days=7)).delete()
    BotLinkCode.objects.filter(expires_at__lt=timezone.now() - timedelta(days=1)).delete()

"""The bot's doors: Telegram's webhook, the PDF renderer's data, and the
app's "Connect Telegram" screen."""

import hmac
import logging

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import rendering, telegram
from .models import CHANNEL_TELEGRAM, BotIdentity, BotLinkCode, ProcessedUpdate

logger = logging.getLogger(__name__)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def telegram_webhook(request):
    """Telegram delivering a message, a photo or a button press.

    Only Telegram knows the secret it was given when the webhook was set, so
    anything without it is refused. The work itself runs in the background:
    Telegram is answered at once, and would otherwise deliver the same update
    again while a long answer is still being written.
    """
    secret = telegram.webhook_secret()
    if not telegram.is_configured() or not secret:
        return Response({'detail': 'The Telegram bot is not configured.'}, status=status.HTTP_403_FORBIDDEN)
    supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
    if not hmac.compare_digest(str(supplied), str(secret)):
        logger.warning('Telegram webhook refused: wrong secret.')
        return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

    update = request.data if isinstance(request.data, dict) else {}
    update_id = str(update.get('update_id') or '')
    if not update_id:
        return Response({'ok': True})
    try:
        with transaction.atomic():
            ProcessedUpdate.objects.create(channel=CHANNEL_TELEGRAM, update_id=update_id)
    except IntegrityError:
        # Delivered before: already handled or being handled.
        return Response({'ok': True})

    from .tasks import handle_telegram_update

    try:
        handle_telegram_update.apply_async(args=[update], retry=False)
    except Exception:  # noqa: BLE001 - no worker: answer in this request instead
        logger.exception('Could not queue Telegram update %s; handling it inline', update_id)
        from .handlers import handle_update

        handle_update(update)
    return Response({'ok': True})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def render_payload(request, token):
    """The answer the PDF renderer is printing, fetched once by the print page."""
    payload = rendering.payload_for(token)
    if payload is None:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(payload)


def _serialize_identity(identity):
    return {
        'id': identity.pk,
        'channel': identity.channel,
        'username': identity.username,
        'display_name': identity.display_name,
        'linked_at': identity.linked_at.isoformat() if identity.linked_at else None,
        'last_seen_at': identity.last_seen_at.isoformat() if identity.last_seen_at else None,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def telegram_status(request):
    """Whether the bot is live, how to reach it, and which chats are linked."""
    username = telegram.bot_username()
    identities = BotIdentity.objects.filter(user=request.user, linked_at__isnull=False).order_by('-linked_at')
    return Response({
        'available': telegram.is_configured() and bool(username),
        'bot_username': username,
        'bot_url': f'https://t.me/{username}' if username else '',
        'connections': [_serialize_identity(identity) for identity in identities],
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def telegram_link_code(request):
    """A one-time code (and a tap-to-open link) that connects a Telegram chat."""
    if (request.user.role or '') == 'AI_GUEST':
        return Response({'message': 'Guest accounts cannot be linked.'}, status=status.HTTP_400_BAD_REQUEST)
    username = telegram.bot_username()
    if not (telegram.is_configured() and username):
        return Response({'message': 'The Telegram bot is not available yet.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    code = BotLinkCode.issue(request.user, CHANNEL_TELEGRAM)
    return Response({
        'code': code.code,
        'expires_at': code.expires_at.isoformat(),
        'bot_username': username,
        'url': f'https://t.me/{username}?start=link_{code.code}',
    }, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def telegram_unlink(request, identity_id):
    from .identities import unlink

    identity = BotIdentity.objects.filter(pk=identity_id, user=request.user).first()
    if identity is None:
        return Response({'message': 'No such connection.'}, status=status.HTTP_404_NOT_FOUND)
    unlink(identity)
    return Response(status=status.HTTP_204_NO_CONTENT)

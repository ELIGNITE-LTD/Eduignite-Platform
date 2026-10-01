"""Finding, creating and linking the people who talk to the bot."""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.ai_features import credit_engine

from .models import BotIdentity, BotLinkCode

logger = logging.getLogger(__name__)
User = get_user_model()

GUEST_ROLE = 'AI_GUEST'
GUEST_EMAIL_DOMAIN = 'guest.eduignite.online'


def _guest_user(channel: str, external_id: str, name: str):
    """The guest account behind a chat, made the first time it writes."""
    prefix = {'telegram': 'TG', 'whatsapp': 'WA'}.get(channel, channel[:2].upper())
    matricule = f'{prefix}-{external_id}'[:50]
    existing = User.objects.filter(matricule=matricule).first()
    if existing:
        return existing
    try:
        with transaction.atomic():
            user = User.objects.create_user(
                matricule=matricule,
                name=(name or 'EduIgnite AI guest')[:255],
                email=f'{channel}-{external_id}@{GUEST_EMAIL_DOMAIN}',
                role=GUEST_ROLE,
            )
            # A guest talks through the chat app only; there is no password to
            # sign in to the apps with.
            user.set_unusable_password()
            user.save(update_fields=['password'])
            return user
    except IntegrityError:
        return User.objects.get(matricule=matricule)


def identity_for(channel: str, external_id, *, name='', username='', language_code='') -> BotIdentity:
    external_id = str(external_id)
    identity = BotIdentity.objects.select_related('user').filter(channel=channel, external_id=external_id).first()
    if identity is None:
        guest = _guest_user(channel, external_id, name)
        try:
            with transaction.atomic():
                identity = BotIdentity.objects.create(
                    channel=channel,
                    external_id=external_id,
                    user=guest,
                    guest_user=guest,
                    display_name=name[:255],
                    username=(username or '')[:150],
                    language='fr' if str(language_code).lower().startswith('fr') else 'en',
                )
        except IntegrityError:
            identity = BotIdentity.objects.select_related('user').get(channel=channel, external_id=external_id)
    updates = {'last_seen_at': timezone.now(), 'is_blocked': False}
    if name and name != identity.display_name:
        updates['display_name'] = name[:255]
    if username and username != identity.username:
        updates['username'] = username[:150]
    BotIdentity.objects.filter(pk=identity.pk).update(**updates)
    for key, value in updates.items():
        setattr(identity, key, value)
    return identity


class LinkError(Exception):
    pass


def link(identity: BotIdentity, raw_code: str):
    """Connect a chat to the EduIgnite account a link code was issued for.

    Returns (user, credits_moved). A guest's bought credits move to the real
    account, so nothing paid for is left behind.
    """
    code = (raw_code or '').strip().upper().replace('LINK_', '')
    with transaction.atomic():
        link_code = BotLinkCode.objects.select_for_update().select_related('user').filter(code=code).first()
        if link_code is None or not link_code.is_usable or link_code.channel != identity.channel:
            raise LinkError('invalid')
        target = link_code.user
        if not target.is_active or (target.role or '') == GUEST_ROLE:
            raise LinkError('invalid')

        moved = 0
        current = identity.user
        if current.pk != target.pk and (current.role or '') == GUEST_ROLE:
            moved = credit_engine.transfer_purchased(current, target)

        identity.user = target
        identity.linked_at = timezone.now()
        identity.history = []
        identity.state = {}
        identity.save(update_fields=['user', 'linked_at', 'history', 'state', 'updated_at'])
        link_code.used_at = timezone.now()
        link_code.used_by = identity
        link_code.save(update_fields=['used_at', 'used_by'])
    return target, moved


def unlink(identity: BotIdentity):
    """Go back to the chat's own guest account."""
    guest = identity.guest_user or _guest_user(identity.channel, identity.external_id, identity.display_name)
    identity.user = guest
    identity.guest_user = guest
    identity.linked_at = None
    identity.history = []
    identity.state = {}
    identity.save(update_fields=['user', 'guest_user', 'linked_at', 'history', 'state', 'updated_at'])
    return guest

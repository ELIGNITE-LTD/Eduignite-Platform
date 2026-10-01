"""Who is talking to EduIgnite AI through a chat app.

A chat account (a Telegram user today, a WhatsApp number later) is an
identity. Every identity is backed by a real EduIgnite user, so credits, the
ledger and the economics dashboard work exactly as they do in the apps:

  * someone new gets a guest user of their own, with the guest allowance;
  * someone who links their EduIgnite account talks as that account, with its
    allowance, its credits and - for a student - their real marks.
"""

import secrets
from datetime import timedelta

from django.db import models
from django.utils import timezone

CHANNEL_TELEGRAM = 'telegram'
CHANNEL_WHATSAPP = 'whatsapp'
CHANNEL_CHOICES = [(CHANNEL_TELEGRAM, 'Telegram'), (CHANNEL_WHATSAPP, 'WhatsApp')]

# Letters and digits that cannot be misread for one another when typed from
# a phone screen.
LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
LINK_CODE_LENGTH = 8
LINK_CODE_LIFETIME = timedelta(minutes=15)


class BotIdentity(models.Model):
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    #: The chat account's own id on that channel (a Telegram user id).
    external_id = models.CharField(max_length=64)
    username = models.CharField(max_length=150, blank=True, default='')
    display_name = models.CharField(max_length=255, blank=True, default='')
    language = models.CharField(max_length=5, default='en')
    #: Who the questions are asked as, and charged to.
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='bot_identities')
    #: The guest account this chat started with, kept so it can go back to it
    #: when an EduIgnite account is unlinked.
    guest_user = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    linked_at = models.DateTimeField(null=True, blank=True)
    #: What the conversation is waiting for (a phone number, a confirmation),
    #: and the last answers, so their PDF can be made when asked for.
    state = models.JSONField(default=dict, blank=True)
    #: The last few turns, sent with the next question for context.
    history = models.JSONField(default=list, blank=True)
    is_blocked = models.BooleanField(default=False, help_text='The person has blocked the bot.')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'bot_identities'
        constraints = [
            models.UniqueConstraint(fields=['channel', 'external_id'], name='bot_identity_unique_account'),
        ]
        indexes = [models.Index(fields=['user'], name='bot_identity_user_idx')]

    def __str__(self):
        return f'{self.channel}:{self.external_id} -> {self.user_id}'

    @property
    def is_linked(self):
        return self.linked_at is not None and self.user_id != self.guest_user_id


class BotLinkCode(models.Model):
    """A one-time code, shown in the app, that connects a chat to an account."""

    code = models.CharField(max_length=16, unique=True)
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='bot_link_codes')
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default=CHANNEL_TELEGRAM)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    used_by = models.ForeignKey(BotIdentity, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bot_link_codes'

    @classmethod
    def issue(cls, user, channel=CHANNEL_TELEGRAM):
        # Only one live code per person and channel: a new one replaces it.
        cls.objects.filter(user=user, channel=channel, used_at__isnull=True).delete()
        for _ in range(10):
            code = ''.join(secrets.choice(LINK_CODE_ALPHABET) for _ in range(LINK_CODE_LENGTH))
            if not cls.objects.filter(code=code).exists():
                return cls.objects.create(
                    code=code, user=user, channel=channel, expires_at=timezone.now() + LINK_CODE_LIFETIME,
                )
        raise RuntimeError('Could not issue a unique link code.')

    @property
    def is_usable(self):
        return self.used_at is None and self.expires_at > timezone.now()


class ProcessedUpdate(models.Model):
    """An update already handled. The channel may deliver the same one twice."""

    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    update_id = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'bot_processed_updates'
        constraints = [
            models.UniqueConstraint(fields=['channel', 'update_id'], name='bot_update_unique'),
        ]

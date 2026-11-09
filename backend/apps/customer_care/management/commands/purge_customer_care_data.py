"""Retention control for Customer Care. DRY RUN unless --apply is given.

Redacts (does not delete rows) message bodies and internal notes of conversations
that were closed more than ``--days`` days ago, and removes old WhatsApp webhook
dedupe rows. History, timelines, statuses and audit entries stay.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.customer_care.models import (
    Conversation, ConversationStatus, InternalNote, Message, WhatsAppWebhookEvent,
)

REDACTED = '[removed by retention policy]'


class Command(BaseCommand):
    help = 'Redact bodies of long-closed Customer Care conversations (dry run by default).'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=730, help='Closed more than this many days ago.')
        parser.add_argument('--apply', action='store_true', help='Actually redact. Without it nothing changes.')

    def handle(self, *args, **opts):
        days = opts['days']
        if days < 30:
            self.stderr.write('Refusing: --days must be at least 30.')
            return
        cutoff = timezone.now() - timedelta(days=days)
        convs = Conversation.objects.filter(status=ConversationStatus.CLOSED, closed_at__lt=cutoff)
        messages = Message.objects.filter(conversation__in=convs, redacted_at__isnull=True)
        notes = InternalNote.objects.filter(conversation__in=convs).exclude(body=REDACTED)
        events = WhatsAppWebhookEvent.objects.filter(received_at__lt=timezone.now() - timedelta(days=90))
        counts = (convs.count(), messages.count(), notes.count(), events.count())
        mode = 'APPLY' if opts['apply'] else 'DRY RUN (nothing changed)'
        self.stdout.write(f'{mode}: {counts[0]} closed conversations, {counts[1]} messages, '
                          f'{counts[2]} notes, {counts[3]} webhook dedupe rows older than 90 days.')
        if opts['apply']:
            messages.update(body=REDACTED, redacted_at=timezone.now())
            notes.update(body=REDACTED)
            events.delete()
            self.stdout.write('Done.')

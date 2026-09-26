"""Find the payments the webhook never told us about.

Fapshi sends one webhook per event and does not retry: "Fapshi sends only one
webhook request per event, regardless of whether your server responds or not."
So every deploy, restart, timeout or brief outage is a window in which a payer
is charged and this platform never hears about it. Without this command those
payments are simply lost - the money left the payer, and the subscription they
bought never arrives.

This closes that window by asking Fapshi directly about every transaction still
pending. It is the safety net, not the main path: webhooks stay the fast route.

Run it on a schedule, every few minutes:

    python manage.py reconcile_fapshi_payments

Fapshi rate limits status checks to six per minute per transaction, so this
paces itself and works oldest first, which is the order payers have been
waiting in.
"""

import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.fees import fapshi
from apps.fees.fapshi_views import sync_transaction
from apps.fees.models import GatewayTransaction

# Fapshi allows six status calls per minute per transaction. One every two
# seconds sits well inside that even if every call were for the same one.
PAUSE_SECONDS = 2

# Nothing older than this is worth asking about: a Fapshi payment link expires
# after 24 hours, so a transaction still pending days later will not change.
GIVE_UP_AFTER_DAYS = 3


class Command(BaseCommand):
    help = 'Ask Fapshi about pending payments the webhook may never have reported.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=100,
            help='How many transactions to check in this run.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would be checked without calling Fapshi.',
        )

    def handle(self, *args, **options):
        if not fapshi.is_configured():
            self.stderr.write('Fapshi is not configured; nothing to reconcile.')
            return

        cutoff = timezone.now() - timezone.timedelta(days=GIVE_UP_AFTER_DAYS)

        pending = (
            GatewayTransaction.objects.filter(
                provider=GatewayTransaction.PROVIDER_FAPSHI,
                status=GatewayTransaction.STATUS_PENDING,
                processed=False,
                created__gte=cutoff,
            )
            # A transaction with no Fapshi id was never started, so there is
            # nothing to ask about.
            .exclude(provider_transaction_id='')
            .order_by('created')[: options['limit']]
        )

        checked = 0
        settled = 0
        failed = 0

        for txn in pending:
            if options['dry_run']:
                self.stdout.write(f'would check {txn.transaction_id} ({txn.amount} {txn.currency})')
                checked += 1
                continue

            try:
                updated = sync_transaction(txn)
            except fapshi.FapshiError as exc:
                # Fapshi is unreachable. Leave it pending and try again next
                # run rather than writing off a payment that may have happened.
                self.stderr.write(f'{txn.transaction_id}: {exc}')
                failed += 1
                time.sleep(PAUSE_SECONDS)
                continue

            checked += 1
            if updated.processed:
                settled += 1
                self.stdout.write(
                    f'{txn.transaction_id}: settled, and it took a reconciliation to find it.'
                )
            time.sleep(PAUSE_SECONDS)

        self.stdout.write(
            f'Checked {checked}, settled {settled}, unreachable {failed}.'
        )

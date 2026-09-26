"""Prove the Fapshi connection from wherever it is deployed.

Run it after setting the credentials, and again after switching to live:

    python manage.py check_fapshi

It reads the configuration from the environment and never prints a
credential - only whether one is present, and how long it is. A key that
appears in a log or a terminal history is a key that has to be replaced.

With --pay it also puts a real payment through, which is the only way to know
the whole path works. In sandbox that costs nothing; against live it moves
actual money, so it refuses unless --yes-live is given as well.
"""

import time

from django.core.management.base import BaseCommand

from apps.fees import fapshi

# Fapshi's own sandbox numbers, which give a predictable answer instead of a
# random one.
SANDBOX_SUCCESS_NUMBER = '670000000'
SANDBOX_FAILURE_NUMBER = '670000001'


class Command(BaseCommand):
    help = 'Check that Fapshi is configured and reachable, and optionally make a test payment.'

    def add_arguments(self, parser):
        parser.add_argument('--pay', action='store_true', help='Put a real payment through.')
        parser.add_argument('--phone', default='', help='Number to charge (default: a sandbox test number).')
        parser.add_argument('--amount', type=int, default=fapshi.MINIMUM_AMOUNT, help='Amount in XAF.')
        parser.add_argument('--yes-live', action='store_true', help='Permit a test payment against live.')

    def handle(self, *args, **options):
        secret = fapshi.webhook_secret()

        self.stdout.write('Configuration')
        self.stdout.write(f'  environment     : {"LIVE" if fapshi.is_live() else "sandbox"}')
        self.stdout.write(f'  credentials set : {fapshi.is_configured()}')
        self.stdout.write(f'  webhook secret  : {"set" if secret else "MISSING"}')

        if not fapshi.is_configured():
            self.stderr.write('\nFAPSHI_API_USER and FAPSHI_API_KEY are not set; nothing else can be checked.')
            return

        if not secret:
            self.stderr.write(
                '\nFAPSHI_WEBHOOK_SECRET is not set. Webhooks are refused until it is, '
                'and payments will only arrive through reconcile_fapshi_payments.'
            )

        self.stdout.write('\nReaching Fapshi')
        try:
            balance = fapshi._request('GET', '/balance')
        except fapshi.FapshiError as exc:
            self.stderr.write(f'  FAILED: {exc}')
            return

        self.stdout.write(f'  service         : {balance.get("service")}')
        self.stdout.write(f'  balance         : {balance.get("balance")} {balance.get("currency")}')

        if not options['pay']:
            self.stdout.write('\nPass --pay to put a test payment through.')
            return

        if fapshi.is_live() and not options['yes_live']:
            self.stderr.write('\nRefusing to charge a real number on live without --yes-live.')
            return

        phone = options['phone'] or SANDBOX_SUCCESS_NUMBER
        self.stdout.write(f'\nCharging {phone} {options["amount"]} XAF')
        try:
            started = fapshi.direct_pay(
                amount=options['amount'],
                phone=phone,
                external_id=f'EI-CHECK-{int(time.time())}',
                message='EduIgnite connection check',
            )
        except fapshi.FapshiError as exc:
            self.stderr.write(f'  FAILED to start: {exc}')
            return

        trans_id = started.get('transId')
        self.stdout.write(f'  transId         : {trans_id}')

        # Fapshi allows six status calls a minute per transaction.
        for attempt in range(1, 7):
            time.sleep(10)
            try:
                data = fapshi.payment_status(trans_id)
            except fapshi.FapshiError as exc:
                self.stderr.write(f'  status check failed: {exc}')
                return

            state = fapshi.normalize_status(data)
            self.stdout.write(
                f'  check {attempt}         : {data.get("status")} -> {state} '
                f'(amount {fapshi.amount_of(data)})'
            )
            if state != 'PENDING':
                break

        self.stdout.write('\nDone.')

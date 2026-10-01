"""Point Telegram at this server and set up how the bot presents itself.

Run once after deploying, and again whenever the address or secret changes:

    python manage.py telegram_setup

Telegram then delivers every message to the webhook, signed with
TELEGRAM_WEBHOOK_SECRET, and shows the command menu in both languages.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.bots import telegram

COMMANDS = {
    'en': [
        ('start', 'Start EduIgnite AI'),
        ('help', 'What I can do'),
        ('balance', 'Your AI credits'),
        ('buy', 'Buy credits by mobile money'),
        ('history', 'Recent credit activity'),
        ('new', 'Start a new conversation'),
        ('link', 'Connect your EduIgnite account'),
        ('language', 'English / Français'),
    ],
    'fr': [
        ('start', 'Démarrer EduIgnite AI'),
        ('help', 'Ce que je sais faire'),
        ('balance', 'Vos crédits IA'),
        ('buy', 'Acheter des crédits par mobile money'),
        ('history', 'Activité récente'),
        ('new', 'Nouvelle conversation'),
        ('link', 'Lier votre compte EduIgnite'),
        ('language', 'English / Français'),
    ],
}

DESCRIPTION = {
    'en': (
        'EduIgnite AI answers any school question - maths, sciences, languages, exams - in English or '
        'French. Send a photo of a question and it reads it. 30 free AI credits every day.'
    ),
    'fr': (
        "EduIgnite AI répond à toutes vos questions scolaires - maths, sciences, langues, examens - en "
        "français ou en anglais. Envoyez la photo d'une question et il la lit. 30 crédits IA gratuits par jour."
    ),
}


class Command(BaseCommand):
    help = 'Register the Telegram webhook, commands and description for EduIgnite AI.'

    def add_arguments(self, parser):
        parser.add_argument('--url', help='Public API base, e.g. https://api.eduignite.online')
        parser.add_argument('--remove', action='store_true', help='Remove the webhook instead.')

    def handle(self, *args, **options):
        if not telegram.is_configured():
            raise CommandError('Set TELEGRAM_BOT_TOKEN first.')
        if options['remove']:
            telegram.call('deleteWebhook', drop_pending_updates=False)
            self.stdout.write(self.style.SUCCESS('Webhook removed.'))
            return
        secret = telegram.webhook_secret()
        if not secret:
            raise CommandError('Set TELEGRAM_WEBHOOK_SECRET first (any long random string).')
        base = (options.get('url') or getattr(settings, 'BOTS_PUBLIC_API_URL', '')).rstrip('/')
        if not base.startswith('https://'):
            raise CommandError('Telegram needs an https:// address. Pass --url or set BOTS_PUBLIC_API_URL.')
        url = f'{base}/api/v1/bots/telegram/webhook/'
        telegram.call(
            'setWebhook', url=url, secret_token=secret,
            allowed_updates=['message', 'callback_query'], max_connections=20,
        )
        for language, commands in COMMANDS.items():
            telegram.call(
                'setMyCommands',
                commands=[{'command': name, 'description': text} for name, text in commands],
                language_code=None if language == 'en' else language,
            )
            telegram.call('setMyDescription', description=DESCRIPTION[language],
                          language_code=None if language == 'en' else language)
        me = telegram.call('getMe') or {}
        self.stdout.write(self.style.SUCCESS(f"Webhook set to {url} for @{me.get('username', '?')}."))

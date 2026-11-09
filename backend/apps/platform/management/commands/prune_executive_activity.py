"""Retention for the executive activity log. Never run automatically.

    python manage.py prune_executive_activity --older-than-days 730           # dry run
    python manage.py prune_executive_activity --older-than-days 730 --apply   # deletes

The log is kept indefinitely by default; this command exists for a later,
deliberate policy decision by the founders.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.platform.executive_activity import prune_before
from apps.platform.executive_activity_model import ExecutiveActivityLog


class Command(BaseCommand):
    help = 'Delete executive activity log rows older than N days (dry run unless --apply).'

    def add_arguments(self, parser):
        parser.add_argument('--older-than-days', type=int, required=True)
        parser.add_argument('--apply', action='store_true', help='Actually delete (default is a dry run).')
        parser.add_argument('--dry-run', action='store_true', help='Explicit dry run (the default).')

    def handle(self, *args, **options):
        days = options['older_than_days']
        if days < 30:
            raise CommandError('Refusing to prune entries younger than 30 days.')
        cutoff = timezone.now() - timedelta(days=days)
        count = ExecutiveActivityLog.objects.filter(created_at__lt=cutoff).count()
        if options['apply'] and not options['dry_run']:
            deleted = prune_before(cutoff)
            self.stdout.write(self.style.WARNING(f'Deleted {deleted} entries older than {days} days.'))
        else:
            self.stdout.write(f'Dry run: {count} entries older than {days} days would be deleted. Use --apply.')

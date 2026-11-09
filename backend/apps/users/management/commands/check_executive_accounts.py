"""Audit (and optionally repair) platform executive accounts.

Dry-run by default: nothing is written unless ``--apply`` is given.

    python manage.py check_executive_accounts                # report only
    python manage.py check_executive_accounts --apply        # safe repairs only
    python manage.py check_executive_accounts --apply --reactivate --clear-must-change

Safe repairs (``--apply``): malformed ``allowed_modules`` is cleaned to the known
module keys, ``is_staff`` is set, a revocation cutoff (``sessions_valid_after``)
is cleared, and an expired suspension is lifted. These only restore what an
executive is entitled to; they never grant a module.

Opt-in repairs (each needs its own flag on top of ``--apply``):
  --reactivate        set is_active=True and leave Drafts (is_drafted=False)
  --clear-must-change set must_change_password=False

Reported but never changed: an assignable executive with NO modules assigned
(a founder must choose them on the Founders page) and an account still waiting
for activation (password '!pending_activation').
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.users.executive_access import ALWAYS_FULL_ACCESS_ROLES, ASSIGNABLE_EXECUTIVE_ROLES
from apps.users.executive_modules import clean_modules
from apps.users.models import User

PENDING_ACTIVATION_MARKER = '!pending_activation'


class Command(BaseCommand):
    help = 'Report (dry run) or repair platform executive accounts. Use --apply to write.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the safe repairs. Without it nothing changes.')
        parser.add_argument('--reactivate', action='store_true', help='With --apply: re-activate inactive/drafted executives.')
        parser.add_argument('--clear-must-change', action='store_true', help='With --apply: clear must_change_password.')
        parser.add_argument('--matricule', action='append', default=[], help='Limit to this matricule (repeatable).')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        roles = sorted(ALWAYS_FULL_ACCESS_ROLES | ASSIGNABLE_EXECUTIVE_ROLES)
        users = User.objects.filter(role__in=roles).order_by('role', 'matricule')
        if options['matricule']:
            users = users.filter(matricule__in=options['matricule'])

        mode = 'APPLY' if apply_changes else 'DRY RUN (nothing will be written)'
        self.stdout.write(self.style.NOTICE(f'Executive account check - {mode}'))
        now = timezone.now()
        problems = 0
        repaired = 0

        for user in users:
            findings = []
            updates = {}

            if not user.is_active:
                findings.append('inactive (is_active=False)')
                if options['reactivate']:
                    updates['is_active'] = True
            if getattr(user, 'is_drafted', False):
                findings.append('in Drafts (is_drafted=True)')
                if options['reactivate']:
                    updates['is_drafted'] = False
            if getattr(user, 'is_suspended', False):
                expired = user.suspended_until is not None and user.suspended_until <= now
                findings.append('suspension expired but still flagged' if expired else 'currently suspended')
                if expired:
                    updates['is_suspended'] = False
                    updates['suspended_until'] = None
            if user.must_change_password:
                findings.append('must_change_password is set (blocks the whole dashboard)')
                if options['clear_must_change']:
                    updates['must_change_password'] = False
            if user.sessions_valid_after is not None:
                findings.append(f'sessions_valid_after set ({user.sessions_valid_after:%Y-%m-%d %H:%M}): older tokens are rejected')
                updates['sessions_valid_after'] = None
            if not user.is_staff:
                findings.append('is_staff is False')
                updates['is_staff'] = True
            if user.role in ASSIGNABLE_EXECUTIVE_ROLES:
                raw = user.allowed_modules
                if not isinstance(raw, list):
                    findings.append(f'allowed_modules malformed ({raw!r})')
                    updates['allowed_modules'] = []
                else:
                    cleaned = clean_modules(raw)
                    if cleaned != raw:
                        findings.append(f'allowed_modules has unknown/duplicate keys {raw!r}')
                        updates['allowed_modules'] = cleaned
                    if not cleaned:
                        findings.append('NO modules assigned: only the default tabs work (a founder must assign them)')
            if user.has_usable_password() and user.check_password(PENDING_ACTIVATION_MARKER):
                findings.append('waiting for activation (has not set a password yet)')

            if not findings:
                self.stdout.write(f'  OK    {user.matricule:<14} {user.role:<11} {user.name}')
                continue

            problems += 1
            self.stdout.write(self.style.WARNING(f'  CHECK {user.matricule:<14} {user.role:<11} {user.name}'))
            for finding in findings:
                self.stdout.write(f'          - {finding}')
            if updates and apply_changes:
                for field, value in updates.items():
                    setattr(user, field, value)
                user.save(update_fields=list(updates))
                repaired += 1
                self.stdout.write(self.style.SUCCESS(f'          repaired: {", ".join(sorted(updates))}'))
            elif updates:
                self.stdout.write(f'          would repair: {", ".join(sorted(updates))}')

        self.stdout.write(f'{users.count()} executive account(s) checked, {problems} with findings, {repaired} repaired.')
        if not apply_changes and problems:
            self.stdout.write('Re-run with --apply to write the safe repairs.')

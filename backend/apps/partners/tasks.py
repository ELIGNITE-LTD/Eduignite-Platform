"""Scheduled maintenance for partner accounts.

Only accounts that were created but never genuinely used are swept. The moment a
partner uses the portal, `inactivity_deadline` is cleared (see views._mark_used),
so an established, active partner is never touched by this rule.
"""

import logging

from celery import shared_task
from django.utils import timezone

from . import emails
from .models import Partner

logger = logging.getLogger(__name__)


@shared_task
def sweep_inactive_partner_accounts():
    """Warn, then delete, unused partner accounts past their inactivity deadline.

    Runs daily. 'Unused' means the account has a non-null inactivity_deadline —
    which is set at creation and cleared on first real use. Warnings are stepped
    (approaching → near → final) and the account is deleted only after the
    deadline. The partnership application record is kept for audit.
    """
    now = timezone.now()
    swept = {'warned': 0, 'deleted': 0}

    candidates = Partner.objects.filter(
        inactivity_deadline__isnull=False,
    ).exclude(status=Partner.Status.DELETED).select_related('user')

    for partner in candidates:
        deadline = partner.inactivity_deadline
        if now >= deadline:
            # Delete the unused account; keep the application/audit record.
            partner.status = Partner.Status.DELETED
            partner.deleted_at = now
            partner.deletion_reason = 'Auto-removed: account created but never used within the inactivity window.'
            partner.is_public = False
            partner.save(update_fields=['status', 'deleted_at', 'deletion_reason', 'is_public', 'updated_at'])
            user = partner.user
            user.is_active = False
            user.save(update_fields=['is_active'])
            swept['deleted'] += 1
            continue

        days_left = (deadline - now).days
        sent = partner.inactivity_warnings_sent
        # Stepped warnings: ~30 days out, ~7 days out, and a final one ~2 days out.
        if days_left <= 2 and sent < 3:
            emails.inactivity_warning(partner, deadline, final=True)
            partner.inactivity_warnings_sent = 3
            partner.save(update_fields=['inactivity_warnings_sent', 'updated_at'])
            swept['warned'] += 1
        elif days_left <= 7 and sent < 2:
            emails.inactivity_warning(partner, deadline, final=False)
            partner.inactivity_warnings_sent = 2
            partner.save(update_fields=['inactivity_warnings_sent', 'updated_at'])
            swept['warned'] += 1
        elif days_left <= 30 and sent < 1:
            emails.inactivity_warning(partner, deadline, final=False)
            partner.inactivity_warnings_sent = 1
            partner.save(update_fields=['inactivity_warnings_sent', 'updated_at'])
            swept['warned'] += 1

    logger.info('Partner inactivity sweep: warned=%s deleted=%s', swept['warned'], swept['deleted'])
    return swept

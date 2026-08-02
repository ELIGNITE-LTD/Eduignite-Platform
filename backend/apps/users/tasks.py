"""
Celery tasks for automated share management and founder lifecycle enforcement.

Scheduled tasks:
  - expire_founder_shares         : daily - removes expired FounderShareAdjustment records
  - enforce_founder_renewal       : daily - deactivates / deletes founders whose renewable
                                    share period has ended without renewal
"""

from celery import shared_task
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)
DRAFT_REMINDER_INTERVAL_DAYS = 30
DRAFT_MAX_REMINDERS = 6


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def expire_founder_shares(self):
    """
    Remove all FounderShareAdjustment records whose expires_at has passed.
    After removal the affected founder's additional_share_percentage automatically
    reflects the change (computed property filters out expired records).
    """
    from .models import FounderShareAdjustment

    now = timezone.now()
    expired_qs = FounderShareAdjustment.objects.filter(
        expires_at__isnull=False,
        expires_at__lte=now,
    )
    count = expired_qs.count()
    if count:
        logger.info('Removing %d expired share adjustment(s).', count)
        expired_qs.delete()
    else:
        logger.debug('No expired share adjustments found.')
    return f'Removed {count} expired share adjustment(s).'


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def enforce_founder_renewal(self):
    """
    Enforce renewal rules for founders with has_renewable_shares=True:

    Phase 1 – shares_expire_at has passed → deactivate the user account so
              they can no longer log in.  The founder is NOT yet deleted.

    Phase 2 – shares_expire_at + 30 days has passed without renewal
              → permanently delete the user (and cascade-delete the profile).
              The account is irrecoverable; they cannot log in again.
    """
    from .models import FounderProfile

    now = timezone.now()
    grace_cutoff = now - timedelta(days=30)

    # --- Phase 2: permanent deletion (expired > 30 days ago, still not renewed) ---
    to_delete = FounderProfile.objects.filter(
        has_renewable_shares=True,
        is_primary_founder=False,
        shares_expire_at__isnull=False,
        shares_expire_at__lte=grace_cutoff,
    )
    deleted_count = 0
    for profile in to_delete:
        name = profile.user.name
        matricule = profile.user.matricule
        logger.warning(
            'Deleting founder %s (%s): renewable shares expired on %s — '
            'grace period of 30 days elapsed without renewal.',
            name,
            matricule,
            profile.shares_expire_at,
        )
        profile.user.delete()  # CASCADE deletes the FounderProfile too
        deleted_count += 1

    # --- Phase 1: deactivate (expired but still within 30-day grace period) ---
    to_deactivate = FounderProfile.objects.filter(
        has_renewable_shares=True,
        is_primary_founder=False,
        shares_expire_at__isnull=False,
        shares_expire_at__lte=now,
        shares_expire_at__gt=grace_cutoff,
        user__is_active=True,
    )
    deactivated_count = 0
    for profile in to_deactivate:
        logger.info(
            'Deactivating founder %s (%s): renewable shares expired on %s — '
            '30-day grace period is running.',
            profile.user.name,
            profile.user.matricule,
            profile.shares_expire_at,
        )
        profile.user.is_active = False
        profile.user.save(update_fields=['is_active'])
        deactivated_count += 1

    return (
        f'enforce_founder_renewal: deleted={deleted_count}, '
        f'deactivated={deactivated_count}.'
    )


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_draft_deletion_lifecycle(self):
    """Send Draft reminders monthly and permanently delete records after six months."""
    from django.db import transaction
    from django.contrib.auth import get_user_model
    from apps.schools.models import School
    from apps.support.models import SupportContribution
    from core.email_service import send_draft_lifecycle_email

    User = get_user_model()
    now = timezone.now()
    reminder_cutoff = now - timedelta(days=DRAFT_REMINDER_INTERVAL_DAYS)
    user_reminders = 0
    school_reminders = 0
    deleted_users = 0
    deleted_schools = 0

    users_due_reminder = User.objects.filter(
        is_drafted=True,
        draft_delete_after__gt=now,
        draft_reminder_count__lt=DRAFT_MAX_REMINDERS,
    ).filter(
        Q(draft_last_reminder_at__isnull=True) | Q(draft_last_reminder_at__lte=reminder_cutoff)
    )
    for user in users_due_reminder.distinct():
        try:
            send_draft_lifecycle_email(
                to_email=user.email,
                to_name=user.name,
                subject='EduIgnite Draft account reminder',
                title='Draft Account Reminder',
                entity_name=user.name,
                action_label='Still in Draft and recoverable before permanent deletion',
                reason=user.draft_reason,
                delete_after=user.draft_delete_after,
                sender_name=getattr(getattr(user, 'school', None), 'name', None) or 'EduIgnite',
                reply_to_email=getattr(getattr(user, 'school', None), 'email', None),
            )
        except Exception as exc:
            logger.warning('Draft user reminder email failed for %s: %s', user.id, exc)
        user.draft_last_reminder_at = now
        user.draft_reminder_count += 1
        user.save(update_fields=['draft_last_reminder_at', 'draft_reminder_count'])
        user_reminders += 1

    schools_due_reminder = School.objects.filter(
        is_drafted=True,
        draft_delete_after__gt=now,
        draft_reminder_count__lt=DRAFT_MAX_REMINDERS,
    ).filter(
        Q(draft_last_reminder_at__isnull=True) | Q(draft_last_reminder_at__lte=reminder_cutoff)
    )
    for school in schools_due_reminder.distinct():
        try:
            send_draft_lifecycle_email(
                to_email=school.email,
                to_name=school.principal or school.name,
                subject=f'{school.name} Draft deletion reminder',
                title='School Draft Reminder',
                entity_name=school.name,
                action_label='Still in Draft and recoverable before permanent deletion',
                reason=school.draft_reason,
                delete_after=school.draft_delete_after,
                sender_name='EduIgnite Founder Office',
            )
        except Exception as exc:
            logger.warning('Draft school reminder email failed for %s: %s', school.id, exc)
        school.draft_last_reminder_at = now
        school.draft_reminder_count += 1
        school.save(update_fields=['draft_last_reminder_at', 'draft_reminder_count', 'updated_at'])
        school_reminders += 1

    for user in User.objects.filter(
        is_drafted=True,
        draft_delete_after__lte=now,
    ).filter(Q(school__isnull=True) | Q(school__is_drafted=False)):
        try:
            send_draft_lifecycle_email(
                to_email=user.email,
                to_name=user.name,
                subject='EduIgnite account permanently deleted',
                title='Account Permanently Deleted',
                entity_name=user.name,
                action_label='Permanently deleted after six months in Draft',
                reason=user.draft_reason,
                delete_after=user.draft_delete_after,
                sender_name=getattr(getattr(user, 'school', None), 'name', None) or 'EduIgnite',
                reply_to_email=getattr(getattr(user, 'school', None), 'email', None),
            )
        except Exception as exc:
            logger.warning('Permanent user deletion email failed for %s: %s', user.id, exc)
        user.delete()
        deleted_users += 1

    for school in School.objects.filter(is_drafted=True, draft_delete_after__lte=now):
        with transaction.atomic():
            school_users = list(User.objects.filter(school=school))
            for school_user in school_users:
                try:
                    send_draft_lifecycle_email(
                        to_email=school_user.email,
                        to_name=school_user.name,
                        subject=f'{school.name} permanently deleted',
                        title='School Permanently Deleted',
                        entity_name=school.name,
                        action_label='Permanently deleted after six months in Draft',
                        reason=school.draft_reason,
                        delete_after=school.draft_delete_after,
                        sender_name='EduIgnite Founder Office',
                    )
                except Exception as exc:
                    logger.warning('Permanent school user deletion email failed for %s: %s', school_user.id, exc)
            try:
                send_draft_lifecycle_email(
                    to_email=school.email,
                    to_name=school.principal or school.name,
                    subject=f'{school.name} permanently deleted',
                    title='School Permanently Deleted',
                    entity_name=school.name,
                    action_label='Permanently deleted after six months in Draft',
                    reason=school.draft_reason,
                    delete_after=school.draft_delete_after,
                    sender_name='EduIgnite Founder Office',
                )
            except Exception as exc:
                logger.warning('Permanent school deletion email failed for %s: %s', school.id, exc)
            SupportContribution.objects.filter(school=school).delete()
            User.objects.filter(school=school).delete()
            school.delete()
            deleted_schools += 1

    return (
        f'draft_lifecycle: user_reminders={user_reminders}, school_reminders={school_reminders}, '
        f'deleted_users={deleted_users}, deleted_schools={deleted_schools}'
    )

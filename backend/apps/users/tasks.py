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
    """Track Draft reminders monthly and permanently delete records after six months.

    Reminders are no longer emailed (see core.email_service); the counters
    still record when each reminder fell due.
    """
    from django.db import transaction
    from django.contrib.auth import get_user_model
    from apps.schools.models import School
    from apps.support.models import SupportContribution

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
        school.draft_last_reminder_at = now
        school.draft_reminder_count += 1
        school.save(update_fields=['draft_last_reminder_at', 'draft_reminder_count', 'updated_at'])
        school_reminders += 1

    for user in User.objects.filter(
        is_drafted=True,
        draft_delete_after__lte=now,
    ).filter(Q(school__isnull=True) | Q(school__is_drafted=False)):
        user.delete()
        deleted_users += 1

    for school in School.objects.filter(is_drafted=True, draft_delete_after__lte=now):
        with transaction.atomic():
            SupportContribution.objects.filter(school=school).delete()
            User.objects.filter(school=school).delete()
            school.delete()
            deleted_schools += 1

    return (
        f'draft_lifecycle: user_reminders={user_reminders}, school_reminders={school_reminders}, '
        f'deleted_users={deleted_users}, deleted_schools={deleted_schools}'
    )


# ---------------------------------------------------------------------------
# Birthday recognition
# ---------------------------------------------------------------------------

def _birthday_timezone():
    from zoneinfo import ZoneInfo
    from django.conf import settings
    name = (
        getattr(settings, 'BIRTHDAY_TIMEZONE', None)
        or getattr(settings, 'AI_CREDITS_TIMEZONE', None)
        or 'Africa/Douala'
    )
    try:
        return ZoneInfo(name)
    except Exception:  # noqa: BLE001
        return ZoneInfo('Africa/Douala')


def _birthday_notification_type(role):
    from apps.notifications.models import NotificationType
    if role == 'STUDENT':
        return NotificationType.STUDENT_NOTIFICATION
    if role == 'TEACHER':
        return NotificationType.TEACHER_NOTIFICATION
    if role == 'PARENT':
        return NotificationType.PARENT_NOTIFICATION
    return NotificationType.PLATFORM


def _birthday_message(user, school_name):
    """A warm, role-appropriate greeting that addresses the person by name.

    Templates only, so it always works with no AI service and never leaks a
    date of birth. A few variants per role keep it from feeling robotic.
    """
    import random
    first = ((getattr(user, 'name', '') or '').strip().split(' ') or [''])[0] or 'there'
    school = (school_name or '').strip() or 'EduIgnite'
    role = getattr(user, 'role', '')
    title = f'Happy Birthday, {first}!'
    if role == 'STUDENT':
        bodies = [
            f'Happy birthday, {first}! Everyone at {school} is wishing you a wonderful day. Keep learning, keep shining, and enjoy every moment.',
            f'Wishing you a very happy birthday, {first}! {school} is glad to have you. May this year bring you great results and even better memories.',
            f'It is your day, {first}! Happy birthday from all of us at {school}. Celebrate well and come back ready to achieve more.',
        ]
    elif role == 'TEACHER':
        bodies = [
            f'Happy birthday, {first}! Thank you for all you give to the learners at {school}. We hope your day is as rewarding as your work.',
            f'Wishing you a very happy birthday, {first}. {school} is grateful for everything you do. Have a wonderful day.',
        ]
    elif role in ('SCHOOL_ADMIN', 'SUB_ADMIN'):
        bodies = [
            f'Happy birthday, {first}! Thank you for leading {school} so well. We wish you a joyful and restful day.',
        ]
    elif role == 'PARENT':
        bodies = [
            f'Happy birthday, {first}! Thank you for being part of the {school} family. We wish you a joyful day.',
        ]
    elif role == 'PARTNER':
        bodies = [
            f'Happy birthday, {first}! Thank you for being a valued EduIgnite partner. We wish you a wonderful day.',
        ]
    else:
        bodies = [
            f'Happy birthday, {first}! Everyone at {school} wishes you a wonderful day.',
        ]
    return title, random.choice(bodies)


@shared_task
def send_birthday_messages():
    """Greet every eligible user whose birthday falls today, once per year.

    Dates of birth are read only from the records that actually hold them (today
    that is the learner record); no birth date is ever invented. The greeting is
    delivered to the person's inbox through the existing notification service
    (which also pushes to their devices). A BirthdayGreeting row guarantees one
    greeting per user per year, so the job is safe to run daily and to retry.
    Feb 29 birthdays are celebrated on Feb 28 in a common year.
    """
    from apps.students.models import Student
    from apps.users.models import BirthdayGreeting
    from apps.notifications.services import create_notification

    today = timezone.now().astimezone(_birthday_timezone()).date()
    is_leap = today.year % 4 == 0 and (today.year % 100 != 0 or today.year % 400 == 0)
    day_pairs = [(today.month, today.day)]
    if today.month == 2 and today.day == 28 and not is_leap:
        day_pairs.append((2, 29))

    match = Q()
    for month, day in day_pairs:
        match |= Q(date_of_birth__month=month, date_of_birth__day=day)

    students = (
        Student.objects.filter(match, date_of_birth__isnull=False)
        .select_related('user', 'school')
    )

    sent = 0
    for student in students:
        user = getattr(student, 'user', None)
        if not user or not getattr(user, 'is_active', False):
            continue
        greeting, created = BirthdayGreeting.objects.get_or_create(user=user, year=today.year)
        if not created:
            continue  # already greeted this year
        school_name = (
            getattr(getattr(user, 'school', None), 'name', '')
            or getattr(getattr(student, 'school', None), 'name', '')
        )
        title, message = _birthday_message(user, school_name)
        try:
            create_notification(
                recipient=user,
                title=title,
                message=message,
                notification_type=_birthday_notification_type(getattr(user, 'role', '')),
                icon='gift',
            )
            sent += 1
        except Exception:  # noqa: BLE001 - never let one failure stop the run
            logger.exception('Birthday greeting failed for user %s', getattr(user, 'matricule', '?'))
            greeting.delete()  # let it retry on the next run

    logger.info('Birthday greetings sent: %s on %s', sent, today.isoformat())
    return {'sent': sent, 'date': today.isoformat()}

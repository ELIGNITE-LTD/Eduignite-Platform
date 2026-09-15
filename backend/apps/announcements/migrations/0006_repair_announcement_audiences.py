"""Repair announcements written under the old, leaky audience rules.

Before this change any executive could send a platform announcement to any
target, school administrators saw every platform announcement regardless of
target, and the notification fan-out ignored the target entirely. This
migration applies the new rules (``apps/announcements/audience.py``) to the
rows that already exist:

* A platform announcement keeps a school-facing audience only when the CEO
  sent it with the old "ALL" target, which is rewritten to its new name. Every
  other platform announcement becomes executive-only. The original target is
  preserved in ``legacy_target``.
* Announcement notifications that reached someone outside the corrected
  audience are deleted, so old leaks stop showing in notification lists.
"""

from django.db import migrations

EXECUTIVE_ROLES = {'SUPER_ADMIN', 'CEO', 'CTO', 'COO', 'INV', 'DESIGNER'}
PRINCIPAL_ROLES = {'SCHOOL_ADMIN', 'SUB_ADMIN'}
SCHOOL_ROLES = PRINCIPAL_ROLES | {'TEACHER', 'BURSAR', 'LIBRARIAN', 'STUDENT', 'PARENT'}
PLATFORM_AUDIENCES = {'EXECUTIVE', 'ALL_SCHOOL_USERS', 'ALL_EDUIGNITE_USERS', 'PRINCIPAL', 'PARENT'}
SCHOOL_TARGET_ROLES = {
    'ALL': SCHOOL_ROLES,
    'SCHOOL_ALL': SCHOOL_ROLES,
    'TEACHER': {'TEACHER'},
    'STUDENT': {'STUDENT'},
    'PARENT': {'PARENT'},
    'BURSAR': {'BURSAR'},
    'LIBRARIAN': {'LIBRARIAN'},
}
PLATFORM_TARGET_ROLES = {
    'EXECUTIVE': EXECUTIVE_ROLES,
    'ALL_SCHOOL_USERS': SCHOOL_ROLES,
    'ALL_EDUIGNITE_USERS': EXECUTIVE_ROLES | SCHOOL_ROLES,
    'PRINCIPAL': PRINCIPAL_ROLES,
    'PARENT': {'PARENT'},
}


def _corrected_platform_target(sender_role, target):
    if sender_role == 'CEO':
        if target == 'ALL':
            return 'ALL_EDUIGNITE_USERS'
        if target in PLATFORM_AUDIENCES:
            return target
    return 'EXECUTIVE'


def repair(apps, schema_editor):
    Announcement = apps.get_model('announcements', 'Announcement')
    Notification = apps.get_model('notifications', 'Notification')

    for announcement in Announcement.objects.select_related('sender').iterator():
        if announcement.school_id is None:
            sender_role = (announcement.sender.role or '').upper()
            corrected = _corrected_platform_target(sender_role, announcement.target)
            if corrected != announcement.target:
                announcement.legacy_target = announcement.target
                announcement.target = corrected
                announcement.save(update_fields=['target', 'legacy_target'])
            allowed_roles = PLATFORM_TARGET_ROLES[announcement.target]
        else:
            allowed_roles = SCHOOL_TARGET_ROLES.get(announcement.target, set())

        notifications = Notification.objects.filter(
            notification_type='announcement',
            url=f'/dashboard/announcements/{announcement.id}',
        )
        if announcement.school_id is None:
            leaked = notifications.exclude(recipient__role__in=allowed_roles)
        elif announcement.target == 'PERSONAL':
            leaked = notifications.exclude(recipient_id=announcement.target_user_id)
        else:
            leaked = notifications.exclude(
                recipient__role__in=allowed_roles,
                recipient__school_id=announcement.school_id,
            )
            if announcement.target == 'PARENT':
                # Parents can belong to the school through a child rather than
                # their own account, so never delete a parent's notification
                # for their own children's school announcement.
                leaked = leaked.exclude(recipient__role='PARENT')
        leaked.delete()


def restore_targets(apps, schema_editor):
    Announcement = apps.get_model('announcements', 'Announcement')
    for announcement in Announcement.objects.exclude(legacy_target='').iterator():
        announcement.target = announcement.legacy_target
        announcement.legacy_target = ''
        announcement.save(update_fields=['target', 'legacy_target'])


class Migration(migrations.Migration):

    dependencies = [
        ('announcements', '0005_announcement_audiences'),
        ('notifications', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(repair, restore_targets),
    ]

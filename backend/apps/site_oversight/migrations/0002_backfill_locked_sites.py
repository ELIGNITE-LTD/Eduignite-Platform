"""Give every site that was force-unpublished before this system existed an open case.

Those rows have no remembered previous status, so unblocking restores
``unpublished`` (the school then publishes again itself). Nothing is deleted and
no profile is changed; the migration only adds one case and one timeline line
per locked site. Re-running it is harmless (sites that already have an open case
are skipped).
"""

from django.db import migrations

LEGACY_REASON = ('This website was blocked by EduIgnite staff before reasons were recorded. '
                 'Contact Customer Care for details.')
LEGACY_STEPS = 'Contact EduIgnite Customer Care to find out what is needed to lift the block.'


def backfill(apps, schema_editor):
    Profile = apps.get_model('schools', 'SchoolPublicProfile')
    Case = apps.get_model('site_oversight', 'SiteOversightCase')
    Event = apps.get_model('site_oversight', 'SiteOversightEvent')
    for profile in Profile.objects.filter(locked_by_founder=True):
        if Case.objects.filter(school_id=profile.school_id, state='open').exists():
            continue
        case = Case.objects.create(
            school_id=profile.school_id, state='open', previous_status='unpublished',
            block_reason=LEGACY_REASON, resolution_steps=LEGACY_STEPS,
            blocked_by_name='EduIgnite staff', migrated=True)
        Event.objects.create(
            school_id=profile.school_id, case=case, action='block', reason=LEGACY_REASON,
            resolution_steps=LEGACY_STEPS, actor_name='EduIgnite staff (before reasons were recorded)')


class Migration(migrations.Migration):

    dependencies = [
        ('site_oversight', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]

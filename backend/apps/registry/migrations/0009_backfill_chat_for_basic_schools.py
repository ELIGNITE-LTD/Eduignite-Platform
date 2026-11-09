"""Give every existing Basic Education school the Messaging (chat) app.

Same shape as 0008 (Fees): ``registry.api.install_defaults`` now hands the chat
app to every NEW nursery/primary school, but existing basic schools have no
``chat`` row, so the Messages tab was hidden and ``/api/v1/chat/`` refused them.

Strictly additive and idempotent: only ``education_category == 'basic'``
schools; a school with ANY ``chat`` row (enabled or not) is skipped so an app
turned off on purpose stays off; nothing is updated or deleted. Reverse is a
no-op.
"""

from django.db import migrations

APP_KEY = 'chat'
NOTE = 'Included for Basic Education (backfilled).'


def backfill(apps, schema_editor):
    School = apps.get_model('schools', 'School')
    AppInstallation = apps.get_model('registry', 'AppInstallation')

    have = set(
        AppInstallation.objects.filter(app_key=APP_KEY).values_list('school_id', flat=True)
    )
    rows = [
        AppInstallation(
            school_id=school_id,
            app_key=APP_KEY,
            is_enabled=True,
            licence_expiry=None,
            allowed_roles=[],
            note=NOTE,
        )
        for school_id in School.objects.filter(education_category='basic').values_list('id', flat=True)
        if school_id not in have
    ]
    if rows:
        AppInstallation.objects.bulk_create(rows, batch_size=500, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ('registry', '0008_backfill_fees_for_basic_schools'),
        ('schools', '0026_school_education_category'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]

"""Give every existing Basic Education school the Fees app.

PR #137 made ``registry.api.install_defaults`` hand the Fees app to every NEW
nursery/primary school, but schools created before it (after the registry's
own grandfathering migration, 0002) have no Fees row. Their admin sees "This
feature is not available for your school" on the Fees tab.

Strictly additive and idempotent:

* only schools with ``education_category == 'basic'`` are looked at;
* a school that already has ANY ``fees`` row (enabled or not) is skipped, so
  an app an administrator or founder turned off on purpose is never turned
  back on, and an existing licence/expiry/role list is never rewritten;
* nothing is updated or deleted, so re-running is a no-op.

Reverse is a no-op: removing the rows would take Fees away from schools again.
"""

from django.db import migrations

APP_KEY = 'fees'
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
        ('registry', '0007_apppackage_description_apppackage_icon_image'),
        ('schools', '0026_school_education_category'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]

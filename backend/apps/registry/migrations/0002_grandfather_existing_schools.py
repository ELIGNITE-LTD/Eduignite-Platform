"""Give every school that already exists every app it already had.

Before the registry, every school could use every feature. Deploying the
registry without this migration would enforce entitlements nobody had been
granted, and every existing school would lose Attendance, Fees, Marks, Chat and
the rest the moment the release went out.

So: on the way up, install every non-core app for every existing school. That
makes the registry a no-op for current schools — behaviour is exactly what it
was — and it starts mattering only for schools created afterwards, or when a
founder deliberately removes something.

New schools created after this point get their apps from
``registry.api.install_defaults``, not from here.
"""

from django.db import migrations


def grandfather(apps, schema_editor):
    School = apps.get_model('schools', 'School')
    AppInstallation = apps.get_model('registry', 'AppInstallation')

    # Read the shipped manifests, but keep the historical model above — a data
    # migration must never import application code that could change shape.
    from apps.registry.manifest import all_manifests

    optional_keys = [m.key for m in all_manifests().values() if not m.is_core]
    if not optional_keys:
        return

    existing = set(
        AppInstallation.objects.values_list('school_id', 'app_key')
    )

    rows = [
        AppInstallation(
            school_id=school_id,
            app_key=key,
            is_enabled=True,
            licence_expiry=None,
            note='Granted automatically: this school predates the App Registry.',
        )
        for school_id in School.objects.values_list('id', flat=True)
        for key in optional_keys
        if (school_id, key) not in existing
    ]
    if rows:
        AppInstallation.objects.bulk_create(rows, batch_size=500, ignore_conflicts=True)


def ungrandfather(apps, schema_editor):
    """Reversing drops only the rows this migration could have created."""
    AppInstallation = apps.get_model('registry', 'AppInstallation')
    AppInstallation.objects.filter(
        note='Granted automatically: this school predates the App Registry.'
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('registry', '0001_initial'),
        ('schools', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(grandfather, ungrandfather),
    ]

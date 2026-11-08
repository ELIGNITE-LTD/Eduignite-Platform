from django.db import migrations, models

OLD = 'eduignitecmr@gmail.com'
NEW = 'info@eduignite.online'


def swap_contact_email(apps, schema_editor):
    """Move only rows that still hold the previous default; a custom address is left alone."""
    PlatformSettings = apps.get_model('platform', 'PlatformSettings')
    PlatformSettings.objects.filter(contact_email=OLD).update(contact_email=NEW)


def restore_contact_email(apps, schema_editor):
    PlatformSettings = apps.get_model('platform', 'PlatformSettings')
    PlatformSettings.objects.filter(contact_email=NEW).update(contact_email=OLD)


class Migration(migrations.Migration):

    dependencies = [
        ('platform', '0012_platformsettings_maintenance_scope'),
    ]

    operations = [
        migrations.AlterField(
            model_name='platformsettings',
            name='contact_email',
            field=models.EmailField(blank=True, default=NEW, max_length=254),
        ),
        migrations.RunPython(swap_contact_email, restore_contact_email),
    ]

# Converts PlatformSettings.logo from ImageField to URLField.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('platform', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='platformsettings',
            name='logo',
            field=models.URLField(blank=True, max_length=2000, null=True),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('platform', '0011_integrationsecrets'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformsettings',
            name='maintenance_scope',
            field=models.CharField(
                choices=[
                    ('accounts', 'Accounts only'),
                    ('public', 'Public site only'),
                    ('both', 'Both'),
                ],
                default='both',
                max_length=10,
            ),
        ),
    ]

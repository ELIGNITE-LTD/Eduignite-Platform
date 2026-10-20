from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0023_school_public_profile'),
    ]

    operations = [
        migrations.AddField(
            model_name='school',
            name='public_staff_directory_enabled',
            field=models.BooleanField(default=False),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0019_birthdaygreeting'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='show_in_staff_directory',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='public_title',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
    ]

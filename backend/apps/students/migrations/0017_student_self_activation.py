from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0016_alter_studentpromotionrecord_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='self_activation_used',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='student',
            name='self_activated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

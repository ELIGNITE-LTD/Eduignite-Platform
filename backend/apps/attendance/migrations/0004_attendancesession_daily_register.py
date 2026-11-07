from django.db import migrations, models


class Migration(migrations.Migration):
    """Daily class register for basic education, added next to period sessions.

    Existing rows become ``session_type='period'`` and are unchanged.
    """

    dependencies = [
        ('attendance', '0003_attendancesession_school_class_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendancesession',
            name='session_type',
            field=models.CharField(
                choices=[('period', 'Per period / subject'), ('daily', 'Daily class register')],
                default='period', max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='attendancesession',
            name='client_ref',
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AlterField(
            model_name='attendancesession',
            name='period',
            field=models.CharField(
                choices=[('morning', 'Morning'), ('afternoon', 'Afternoon'), ('full_day', 'Full Day'), ('daily', 'Daily')],
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name='attendancesession',
            constraint=models.UniqueConstraint(
                condition=models.Q(('session_type', 'daily')),
                fields=('school_class', 'date'),
                name='attendance_one_daily_session_per_class_day',
            ),
        ),
        migrations.AddConstraint(
            model_name='attendancesession',
            constraint=models.UniqueConstraint(
                condition=models.Q(('client_ref__isnull', False)),
                fields=('school', 'client_ref'),
                name='attendance_unique_client_ref_per_school',
            ),
        ),
    ]

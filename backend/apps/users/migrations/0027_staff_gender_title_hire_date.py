from django.db import migrations, models


class Migration(migrations.Migration):
    """Additive: optional gender, job title and hire date on User."""

    dependencies = [
        ('users', '0026_linked_school_accounts'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='gender',
            field=models.CharField(blank=True, default='', max_length=10),
        ),
        migrations.AddField(
            model_name='user',
            name='job_title',
            field=models.CharField(
                blank=True, default='', max_length=80,
                help_text='Job title shown to the school, e.g. "Head teacher" or "Secretary".',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='hire_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]

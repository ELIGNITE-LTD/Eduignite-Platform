import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0023_user_allowed_modules'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_teacher_twin',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='admin_owner',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='teacher_twin',
                to='users.user',
                help_text='For a teacher twin: the principal who owns it.',
            ),
        ),
    ]

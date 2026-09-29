from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0014_user_must_change_password'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='ai_plan',
            field=models.CharField(db_index=True, default='free', max_length=20),
        ),
    ]

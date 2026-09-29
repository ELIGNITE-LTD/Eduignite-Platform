from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0013_user_referral_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='must_change_password',
            field=models.BooleanField(default=False),
        ),
    ]

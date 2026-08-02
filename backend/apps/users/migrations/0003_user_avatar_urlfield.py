# Converts User.avatar from ImageField to URLField so the frontend can send
# avatar URLs directly instead of uploading binary files.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_founderprofile_foundershareadjustment'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='avatar',
            field=models.URLField(blank=True, max_length=2000, null=True),
        ),
    ]

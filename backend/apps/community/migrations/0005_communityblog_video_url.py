from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('community', '0004_alter_communityblog_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='communityblog',
            name='video_url',
            field=models.TextField(blank=True, null=True),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('community', '0003_communityblog_image_urlfield'),
    ]

    operations = [
        migrations.AlterField(
            model_name='communityblog',
            name='image',
            field=models.TextField(blank=True, null=True),
        ),
    ]

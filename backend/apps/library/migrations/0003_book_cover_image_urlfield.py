# Converts Book.cover_image from ImageField to URLField so the frontend can
# send image URLs directly instead of uploading binary files.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='book',
            name='cover_image',
            field=models.URLField(blank=True, max_length=2000, null=True),
        ),
    ]

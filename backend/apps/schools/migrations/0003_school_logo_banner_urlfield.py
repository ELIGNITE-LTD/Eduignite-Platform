# Converts School.logo and School.banner from ImageField to URLField so the
# frontend can send image URLs directly instead of uploading binary files.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='school',
            name='logo',
            field=models.URLField(blank=True, max_length=2000, null=True),
        ),
        migrations.AlterField(
            model_name='school',
            name='banner',
            field=models.URLField(blank=True, max_length=2000, null=True),
        ),
    ]

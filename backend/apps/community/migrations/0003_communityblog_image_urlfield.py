# Converts CommunityBlog.image from ImageField to URLField so the frontend
# can send image URLs directly instead of uploading binary files.
# Also extends slug max_length to 300 to accommodate long titles.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('community', '0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='communityblog',
            name='image',
            field=models.URLField(blank=True, max_length=2000, null=True),
        ),
        migrations.AlterField(
            model_name='communityblog',
            name='slug',
            field=models.SlugField(max_length=300, unique=True),
        ),
    ]

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('community', '0005_communityblog_video_url'),
    ]

    operations = [
        migrations.CreateModel(
            name='BlogLike',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('blog', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='likes', to='community.communityblog')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='community_blog_likes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
                'unique_together': {('blog', 'user')},
            },
        ),
        migrations.AddIndex(
            model_name='bloglike',
            index=models.Index(fields=['blog', 'user'], name='community_b_blog_id_ebd32c_idx'),
        ),
    ]

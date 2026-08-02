from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('platform', '0005_honour_roll_default_12'),
    ]

    operations = [
        migrations.CreateModel(
            name='PublicEventComment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('content', models.TextField()),
                ('is_approved', models.BooleanField(default=True)),
                ('author', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='public_event_comments', to=settings.AUTH_USER_MODEL)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='platform.publicevent')),
            ],
            options={
                'db_table': 'public_event_comments',
                'ordering': ['created_at'],
            },
        ),
        migrations.CreateModel(
            name='PublicEventLike',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='likes', to='platform.publicevent')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='public_event_likes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'public_event_likes',
                'ordering': ['-created_at'],
                'unique_together': {('event', 'user')},
            },
        ),
        migrations.AddIndex(
            model_name='publiceventcomment',
            index=models.Index(fields=['event', 'is_approved'], name='public_even_event_i_0b6d96_idx'),
        ),
        migrations.AddIndex(
            model_name='publiceventlike',
            index=models.Index(fields=['event', 'user'], name='public_even_event_i_074ab9_idx'),
        ),
    ]

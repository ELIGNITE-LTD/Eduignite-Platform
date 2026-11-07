import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('platform', '0010_idempotencyrecord_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='IntegrationSecrets',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('gemini_api_key', models.CharField(blank=True, default='', max_length=255)),
                ('gemini_model', models.CharField(blank=True, default='', max_length=64)),
                ('brevo_api_key', models.CharField(blank=True, default='', max_length=255)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Integration Secrets',
                'verbose_name_plural': 'Integration Secrets',
                'db_table': 'integration_secrets',
            },
        ),
    ]

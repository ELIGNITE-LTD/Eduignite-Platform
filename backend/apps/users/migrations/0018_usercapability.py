import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0023_school_public_profile'),
        ('users', '0017_alter_user_previous_role_alter_user_role'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserCapability',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('capability', models.CharField(choices=[('TEACHER', 'Teacher'), ('PARTNER', 'Partner'), ('LEARNER', 'Learner')], db_index=True, max_length=20)),
                ('is_active', models.BooleanField(default=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('granted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='capabilities_granted', to=settings.AUTH_USER_MODEL)),
                ('school', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='user_capabilities', to='schools.school')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='capabilities', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name='usercapability',
            constraint=models.UniqueConstraint(fields=('user', 'capability', 'school'), name='uniq_user_capability_scope'),
        ),
        migrations.AddIndex(
            model_name='usercapability',
            index=models.Index(fields=['user', 'capability', 'is_active'], name='uc_user_cap_active_idx'),
        ),
    ]

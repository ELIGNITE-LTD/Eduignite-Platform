import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Additive: three new tables for linked school-admin accounts."""

    dependencies = [
        ('users', '0025_operation_department_and_systems_dept'),
    ]

    operations = [
        migrations.CreateModel(
            name='AccountLinkGroup',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'db_table': 'users_account_link_group'},
        ),
        migrations.CreateModel(
            name='LinkedAccount',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('linked_via', models.CharField(
                    choices=[
                        ('origin', 'Group owner account'),
                        ('created', 'School created from the linked account'),
                        ('password', 'Existing account linked after password proof'),
                    ],
                    default='origin', max_length=10)),
                ('linked_at', models.DateTimeField(auto_now_add=True)),
                ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='accounts', to='users.accountlinkgroup')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='account_link', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'users_linked_account', 'ordering': ['linked_at']},
        ),
        migrations.CreateModel(
            name='AccountLinkEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('action', models.CharField(db_index=True, max_length=20)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('detail', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='events', to='users.accountlinkgroup')),
                ('target', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'users_account_link_event', 'ordering': ['-created_at']},
        ),
    ]

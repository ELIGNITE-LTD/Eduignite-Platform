from decimal import Decimal
import uuid

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0005_feestructure_school_class'),
        ('schools', '0007_subschool_schoolclass_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CampayTransaction',
            fields=[
                ('created', models.DateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', models.DateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('purpose', models.CharField(choices=[('platform_charge', 'Platform Charge'), ('fee_structure', 'Fee Payment')], default='fee_structure', max_length=30)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0'))])),
                ('currency', models.CharField(default='XAF', max_length=3)),
                ('phone_number', models.CharField(max_length=20)),
                ('description', models.CharField(blank=True, default='', max_length=255)),
                ('external_reference', models.CharField(db_index=True, max_length=100, unique=True)),
                ('campay_reference', models.CharField(blank=True, db_index=True, default='', max_length=100)),
                ('ussd_code', models.CharField(blank=True, default='', max_length=50)),
                ('operator', models.CharField(blank=True, default='', max_length=30)),
                ('status', models.CharField(choices=[('PENDING', 'Pending'), ('SUCCESSFUL', 'Successful'), ('FAILED', 'Failed')], default='PENDING', max_length=20)),
                ('status_reason', models.CharField(blank=True, default='', max_length=255)),
                ('raw_response', models.JSONField(blank=True, default=dict)),
                ('processed', models.BooleanField(default=False, help_text='Whether the successful-payment side effects have been applied.')),
                ('beneficiary', models.ForeignKey(blank=True, help_text='The student the payment is for.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='campay_beneficiary_transactions', to=settings.AUTH_USER_MODEL)),
                ('fee_structure', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='campay_transactions', to='fees.feestructure')),
                ('initiated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='campay_transactions', to=settings.AUTH_USER_MODEL)),
                ('payment', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='campay_transaction', to='fees.payment')),
                ('school', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='campay_transactions', to='schools.school')),
            ],
            options={
                'ordering': ['-created'],
            },
        ),
        migrations.AddIndex(
            model_name='campaytransaction',
            index=models.Index(fields=['school', 'status'], name='fees_campay_school__idx'),
        ),
        migrations.AddIndex(
            model_name='campaytransaction',
            index=models.Index(fields=['campay_reference'], name='fees_campay_ref_idx'),
        ),
        migrations.AddIndex(
            model_name='campaytransaction',
            index=models.Index(fields=['external_reference'], name='fees_campay_extref_idx'),
        ),
    ]

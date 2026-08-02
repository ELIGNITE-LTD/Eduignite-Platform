from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_user_avatar_urlfield'),
    ]

    operations = [
        # FounderShareAdjustment: add expires_at
        migrations.AddField(
            model_name='foundershareadjustment',
            name='expires_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text='When this share allocation expires and is automatically removed.',
            ),
        ),
        migrations.AddIndex(
            model_name='foundershareadjustment',
            index=models.Index(fields=['expires_at'], name='founder_sha_expires_idx'),
        ),

        # FounderProfile: renewable shares governance
        migrations.AddField(
            model_name='founderprofile',
            name='has_renewable_shares',
            field=models.BooleanField(
                default=False,
                help_text='CEO/CTO determines if this founder has shares that must be periodically renewed.',
            ),
        ),
        migrations.AddField(
            model_name='founderprofile',
            name='share_renewal_period_days',
            field=models.PositiveIntegerField(
                default=365,
                validators=[django.core.validators.MinValueValidator(1)],
                help_text='Number of days in the renewal period before shares expire.',
            ),
        ),
        migrations.AddField(
            model_name='founderprofile',
            name='shares_expire_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                help_text="When the founder's board participation expires (renewable shares only).",
            ),
        ),

        # FounderProfile: access level
        migrations.AddField(
            model_name='founderprofile',
            name='access_level',
            field=models.CharField(
                choices=[('READ_ONLY', 'Read Only'), ('FULL', 'Full Access')],
                default='FULL',
                max_length=20,
                help_text='READ_ONLY founders can view but cannot perform write operations.',
            ),
        ),

        # New indexes on FounderProfile
        migrations.AddIndex(
            model_name='founderprofile',
            index=models.Index(fields=['shares_expire_at'], name='founder_pro_shares_expire_idx'),
        ),
        migrations.AddIndex(
            model_name='founderprofile',
            index=models.Index(fields=['access_level'], name='founder_pro_access_level_idx'),
        ),
    ]

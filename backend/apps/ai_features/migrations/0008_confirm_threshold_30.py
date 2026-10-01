"""Ask before a request only when it is genuinely heavy.

The assistant now also draws labelled diagrams and biology templates, so its
instructions are longer and an ordinary photo question is estimated at a
little over 20 credits. At the old threshold of 20 every photo question
stopped to ask "Continue?". The default is now 30; the saved setting is
raised too, but only where nobody has chosen a value of their own.
"""

from django.db import migrations, models


def raise_unchanged_threshold(apps, schema_editor):
    AICreditConfig = apps.get_model('ai_features', 'AICreditConfig')
    AICreditConfig.objects.filter(confirm_above_credits=20).update(confirm_above_credits=30)


def lower_back(apps, schema_editor):
    AICreditConfig = apps.get_model('ai_features', 'AICreditConfig')
    AICreditConfig.objects.filter(confirm_above_credits=30).update(confirm_above_credits=20)


class Migration(migrations.Migration):

    dependencies = [
        ('ai_features', '0007_bot_guests_and_channels'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aicreditconfig',
            name='confirm_above_credits',
            field=models.PositiveIntegerField(
                default=30, help_text='Ask before starting any request estimated above this many credits.',
            ),
        ),
        migrations.RunPython(raise_unchanged_threshold, lower_back),
    ]

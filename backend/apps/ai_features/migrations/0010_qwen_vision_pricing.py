"""Price the vision model that replaced Llama 4.

Groq retired the Llama 4 vision models, so photo questions now go to
qwen/qwen3.8-27b. The saved settings get its multiplier and cost, but only
where nobody has already set them.
"""

from django.db import migrations

MODEL = 'qwen/qwen3.8-27b'
MULTIPLIER = 1.0
COST = {'input_per_million': 174, 'cached_input_per_million': 174, 'output_per_million': 354}


def add_pricing(apps, schema_editor):
    AICreditConfig = apps.get_model('ai_features', 'AICreditConfig')
    for config in AICreditConfig.objects.all():
        changed = []
        if isinstance(config.model_multipliers, dict) and MODEL not in config.model_multipliers:
            config.model_multipliers[MODEL] = MULTIPLIER
            changed.append('model_multipliers')
        if isinstance(config.provider_costs, dict) and MODEL not in config.provider_costs:
            config.provider_costs[MODEL] = dict(COST)
            changed.append('provider_costs')
        if changed:
            config.save(update_fields=changed)


class Migration(migrations.Migration):

    dependencies = [
        ('ai_features', '0009_ai_free_mode'),
    ]

    operations = [
        migrations.RunPython(add_pricing, migrations.RunPython.noop),
    ]

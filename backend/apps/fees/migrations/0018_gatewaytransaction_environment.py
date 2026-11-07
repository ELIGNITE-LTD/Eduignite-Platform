from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0017_ai_credits'),
    ]

    operations = [
        migrations.AddField(
            model_name='gatewaytransaction',
            name='environment',
            field=models.CharField(
                choices=[('live', 'Live'), ('sandbox', 'Sandbox')],
                db_index=True,
                default='live',
                help_text='Live money, or a sandbox test. Only live rows count as revenue.',
                max_length=10,
            ),
        ),
    ]

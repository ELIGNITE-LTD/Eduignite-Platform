from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0018_gatewaytransaction_environment'),
    ]

    operations = [
        migrations.AlterField(
            model_name='gatewaytransaction',
            name='provider',
            field=models.CharField(
                choices=[('fapshi', 'Fapshi')],
                default='fapshi',
                max_length=20,
            ),
        ),
    ]

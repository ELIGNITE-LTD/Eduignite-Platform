from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0009_feestructure_sub_school'),
    ]

    operations = [
        migrations.AlterField(
            model_name='payment',
            name='payment_method',
            field=models.CharField(
                choices=[
                    ('mtn_momo', 'MTN Mobile Money'),
                    ('orange_money', 'Orange Money'),
                    ('mobile_money', 'Mobile Money'),
                    ('cash', 'Cash'),
                    ('bank_transfer', 'Bank Transfer'),
                ],
                max_length=20,
            ),
        ),
    ]

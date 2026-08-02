from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0007_alter_campaytransaction_created_and_more'),
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
                ],
                max_length=20,
            ),
        ),
    ]

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0010_payment_method_cash_bank'),
    ]

    operations = [
        migrations.DeleteModel(
            name='CampayTransaction',
        ),
    ]

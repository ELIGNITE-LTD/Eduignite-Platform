from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0003_order_referral_code_order_referred_by'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailNotificationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=190, unique=True)),
                ('event', models.CharField(max_length=60)),
                ('recipient', models.CharField(blank=True, max_length=254)),
                ('sent_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['-sent_at']},
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app_store', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='appstoreitem',
            name='full_description',
            field=models.TextField(blank=True, default=''),
        ),
    ]

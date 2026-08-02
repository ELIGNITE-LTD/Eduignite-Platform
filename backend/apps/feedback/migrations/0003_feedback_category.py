from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='feedback',
            name='category',
            field=models.CharField(blank=True, default='general', max_length=80),
        ),
    ]

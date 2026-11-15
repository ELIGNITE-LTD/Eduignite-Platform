from django.db import migrations, models


class Migration(migrations.Migration):
    """Additive: a short public description for a programme (empty by default)."""

    dependencies = [
        ('higher_ed', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='programme',
            name='description',
            field=models.TextField(blank=True, default='', max_length=2000),
        ),
    ]

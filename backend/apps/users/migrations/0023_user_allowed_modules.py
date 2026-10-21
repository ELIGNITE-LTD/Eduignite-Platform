from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0022_designer_marketing_label'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='allowed_modules',
            field=models.JSONField(blank=True, default=list),
        ),
    ]

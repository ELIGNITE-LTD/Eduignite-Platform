from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0003_school_logo_banner_urlfield'),
    ]

    operations = [
        migrations.AddField(
            model_name='school',
            name='matricule',
            field=models.CharField(
                blank=True,
                null=True,
                help_text='Auto-generated activation matricule based on school name.',
                max_length=50,
                unique=True,
            ),
        ),
    ]

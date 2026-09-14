import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0003_feedback_category'),
    ]

    operations = [
        migrations.AlterField(
            model_name='feedback',
            name='attachment',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to='feedback/',
                validators=[
                    django.core.validators.FileExtensionValidator(
                        allowed_extensions=['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif']
                    )
                ],
            ),
        ),
    ]

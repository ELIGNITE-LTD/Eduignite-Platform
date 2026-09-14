import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('announcements', '0003_alter_announcement_target'),
    ]

    operations = [
        migrations.AlterField(
            model_name='announcement',
            name='attachment',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to='announcements/',
                validators=[
                    django.core.validators.FileExtensionValidator(
                        allowed_extensions=['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif']
                    )
                ],
            ),
        ),
    ]

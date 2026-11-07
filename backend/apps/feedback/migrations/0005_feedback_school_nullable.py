from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0001_initial'),
        ('feedback', '0004_feedback_attachment_extension_validator'),
    ]

    operations = [
        migrations.AlterField(
            model_name='feedback',
            name='school',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='schools.school',
            ),
        ),
    ]

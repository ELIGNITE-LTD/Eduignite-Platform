from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('grades', '0010_grade_class_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='sequence',
            name='marks_deadline',
            field=models.DateField(
                blank=True,
                null=True,
                help_text='Latest date teachers may submit marks for this sequence. Set by the school administration.',
            ),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0009_parentstudentlink_students_pa_student_f5319a_idx_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='parentstudentlink',
            name='relationship',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('father', 'Father'),
                    ('mother', 'Mother'),
                    ('guardian', 'Guardian'),
                    ('uncle', 'Uncle'),
                    ('aunt', 'Aunt'),
                    ('elder_sibling', 'Elder Sibling'),
                    ('legal_guardian', 'Legal Guardian'),
                    ('other', 'Other'),
                ],
            ),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0003_student_qrcode_urlfield'),
    ]

    operations = [
        migrations.AlterField(
            model_name='student',
            name='admission_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='student',
            name='class_level',
            field=models.CharField(
                choices=[
                    ('form1', 'Form 1'),
                    ('form2', 'Form 2'),
                    ('form3', 'Form 3'),
                    ('form4', 'Form 4'),
                    ('form5', 'Form 5'),
                    ('lower_sixth', 'Lower Sixth'),
                    ('upper_sixth', 'Upper Sixth'),
                ],
                default='form1',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='student',
            name='gender',
            field=models.CharField(
                choices=[('male', 'Male'), ('female', 'Female'), ('other', 'Other')],
                default='other',
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name='student',
            name='guardian_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AlterField(
            model_name='student',
            name='guardian_phone',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AlterField(
            model_name='student',
            name='section',
            field=models.CharField(
                choices=[
                    ('general', 'General'),
                    ('bilingual', 'Bilingual'),
                    ('technical', 'Technical'),
                    ('science', 'Science'),
                    ('arts', 'Arts'),
                    ('commercial', 'Commercial'),
                ],
                default='general',
                max_length=50,
            ),
        ),
    ]

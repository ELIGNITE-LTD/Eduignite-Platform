from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0007_subschool_schoolclass_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='school',
            name='school_type',
            field=models.CharField(
                choices=[
                    ('general', 'General Education (Enseignement Général)'),
                    ('technical', 'Technical & Vocational (Enseignement Technique)'),
                    ('mixed', 'Mixed (General + Technical)'),
                ],
                default='general',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='school',
            name='subsystem',
            field=models.CharField(
                choices=[
                    ('francophone', 'Francophone'),
                    ('anglophone', 'Anglophone'),
                    ('bilingual', 'Bilingual (Both)'),
                ],
                default='francophone',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='school',
            name='region',
            field=models.CharField(
                blank=True,
                max_length=100,
                choices=[
                    ('Adamaoua', 'Adamaoua'),
                    ('Centre', 'Centre'),
                    ('Est', 'Est'),
                    ('Extrême-Nord', 'Extrême-Nord'),
                    ('Littoral', 'Littoral'),
                    ('Nord', 'Nord'),
                    ('Nord-Ouest', 'Nord-Ouest'),
                    ('Ouest', 'Ouest'),
                    ('Sud', 'Sud'),
                    ('Sud-Ouest', 'Sud-Ouest'),
                ],
            ),
        ),
        migrations.AlterField(
            model_name='school',
            name='division',
            field=models.CharField(max_length=100, blank=True),
        ),
        migrations.AlterField(
            model_name='school',
            name='sub_division',
            field=models.CharField(max_length=100, blank=True),
        ),
        migrations.AlterField(
            model_name='school',
            name='city_village',
            field=models.CharField(max_length=100, blank=True),
        ),
        migrations.AlterField(
            model_name='school',
            name='address',
            field=models.CharField(max_length=255, blank=True),
        ),
        migrations.AlterField(
            model_name='school',
            name='phone',
            field=models.CharField(max_length=20, blank=True),
        ),
    ]

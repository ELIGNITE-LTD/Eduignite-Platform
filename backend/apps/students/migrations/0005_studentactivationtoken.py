import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django_extensions.db.fields import CreationDateTimeField, ModificationDateTimeField


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('schools', '0006_schoolsettings_hierarchy'),
        ('students', '0004_student_minimal_admission_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='StudentActivationToken',
            fields=[
                ('created', CreationDateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', ModificationDateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('matricule', models.CharField(db_index=True, max_length=50, unique=True)),
                ('student_name', models.CharField(blank=True, default='', max_length=255)),
                ('student_class', models.CharField(max_length=100)),
                ('class_level', models.CharField(choices=[('form1', 'Form 1'), ('form2', 'Form 2'), ('form3', 'Form 3'), ('form4', 'Form 4'), ('form5', 'Form 5'), ('lower_sixth', 'Lower Sixth'), ('upper_sixth', 'Upper Sixth')], default='form1', max_length=20)),
                ('section', models.CharField(choices=[('general', 'General'), ('bilingual', 'Bilingual'), ('technical', 'Technical'), ('science', 'Science'), ('arts', 'Arts'), ('commercial', 'Commercial')], default='general', max_length=50)),
                ('department', models.CharField(blank=True, default='', max_length=100)),
                ('stream', models.CharField(blank=True, default='', max_length=100)),
                ('batch_name', models.CharField(blank=True, default='', max_length=255)),
                ('is_used', models.BooleanField(default=False)),
                ('used_at', models.DateTimeField(blank=True, null=True)),
                ('generated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='generated_student_activation_tokens', to=settings.AUTH_USER_MODEL)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='student_activation_tokens', to='schools.school')),
                ('used_by', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='used_student_activation_token', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['student_class', 'matricule'],
            },
        ),
        migrations.AddIndex(
            model_name='studentactivationtoken',
            index=models.Index(fields=['school', 'student_class'], name='students_st_school__540d4c_idx'),
        ),
        migrations.AddIndex(
            model_name='studentactivationtoken',
            index=models.Index(fields=['school', 'is_used'], name='students_st_school__e3465b_idx'),
        ),
    ]

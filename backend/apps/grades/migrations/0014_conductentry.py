from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django_extensions.db.fields
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0018_student_optional_login'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('schools', '0028_assessment_config'),
        ('grades', '0013_assessment_config'),
    ]

    operations = [
        migrations.CreateModel(
            name='ConductEntry',
            fields=[
                ('created', django_extensions.db.fields.CreationDateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', django_extensions.db.fields.ModificationDateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kind', models.CharField(choices=[('warning', 'Warning'), ('praise', 'Praise'), ('note', 'Note'), ('late', 'Late')], max_length=10)),
                ('note', models.CharField(blank=True, default='', max_length=200)),
                ('date', models.DateField()),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='conduct_entries_recorded', to=settings.AUTH_USER_MODEL)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='conduct_entries', to='schools.school')),
                ('school_class', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='conduct_entries', to='schools.schoolclass')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='conduct_entries', to='students.student')),
            ],
            options={
                'ordering': ['-date', '-created'],
            },
        ),
        migrations.AddIndex(
            model_name='conductentry',
            index=models.Index(fields=['school', 'student', 'date'], name='grades_cond_school__stud_idx'),
        ),
        migrations.AddIndex(
            model_name='conductentry',
            index=models.Index(fields=['school', 'school_class', 'date'], name='grades_cond_school__cls_idx'),
        ),
    ]

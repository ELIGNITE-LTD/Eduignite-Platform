from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
import django_extensions.db.fields
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('grades', '0005_fix_subject_code_uniqueness'),
        ('students', '0006_dynamic_hierarchy_fields'),
        ('schools', '0006_schoolsettings_hierarchy'),
        ('users', '0005_rename_founder_pro_is_prim_4ef813_idx_founder_pro_is_prim_b7555a_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Assignment',
            fields=[
                ('created', django_extensions.db.fields.CreationDateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', django_extensions.db.fields.ModificationDateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('instructions', models.TextField(blank=True, default='')),
                ('target_class', models.CharField(max_length=100)),
                ('due_date', models.DateTimeField()),
                ('max_marks', models.DecimalField(decimal_places=2, default=20, max_digits=5, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('submission_type', models.CharField(choices=[('text', 'Text'), ('file', 'File'), ('both', 'Text and File')], default='both', max_length=10)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('published', 'Published'), ('cancelled', 'Cancelled')], default='published', max_length=20)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='schools.school')),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='grades.subject')),
                ('teacher', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assignments', to='users.user')),
            ],
            options={
                'ordering': ['status', 'due_date', 'title'],
            },
        ),
        migrations.CreateModel(
            name='AssignmentSubmission',
            fields=[
                ('created', django_extensions.db.fields.CreationDateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', django_extensions.db.fields.ModificationDateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('content', models.TextField(blank=True, default='')),
                ('attachment_name', models.CharField(blank=True, default='', max_length=255)),
                ('attachment_data', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('submitted', 'Submitted'), ('graded', 'Graded')], default='submitted', max_length=20)),
                ('score', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('feedback', models.TextField(blank=True, default='')),
                ('graded_at', models.DateTimeField(blank=True, null=True)),
                ('assignment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to='assignments.assignment')),
                ('graded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='graded_assignment_submissions', to='users.user')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignment_submissions', to='students.student')),
            ],
            options={
                'ordering': ['-created'],
                'unique_together': {('assignment', 'student')},
            },
        ),
        migrations.AddIndex(
            model_name='assignment',
            index=models.Index(fields=['school', 'target_class'], name='assignments__school__a2d3de_idx'),
        ),
        migrations.AddIndex(
            model_name='assignment',
            index=models.Index(fields=['school', 'status'], name='assignments__school__95a5fd_idx'),
        ),
        migrations.AddIndex(
            model_name='assignment',
            index=models.Index(fields=['teacher', 'due_date'], name='assignments__teacher_7d3cef_idx'),
        ),
        migrations.AddIndex(
            model_name='assignmentsubmission',
            index=models.Index(fields=['assignment', 'status'], name='assignments__assignm_8f7afc_idx'),
        ),
        migrations.AddIndex(
            model_name='assignmentsubmission',
            index=models.Index(fields=['student', 'status'], name='assignments__student_69bc4b_idx'),
        ),
    ]

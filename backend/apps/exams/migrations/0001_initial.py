import uuid
from decimal import Decimal

import django.core.validators
import django.db.models.deletion
import django_extensions.db.models
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('grades', '0005_fix_subject_code_uniqueness'),
        ('schools', '0006_schoolsettings_hierarchy'),
        ('students', '0006_dynamic_hierarchy_fields'),
        ('users', '0005_rename_founder_pro_is_prim_4ef813_idx_founder_pro_is_prim_b7555a_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Exam',
            fields=[
                ('created', django_extensions.db.models.CreationDateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', django_extensions.db.models.ModificationDateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('exam_type', models.CharField(choices=[('SEQUENCE', 'Sequence Assessment'), ('MID_TERM', 'Mid-Term Evaluation'), ('END_TERM', 'End of Term Examination'), ('MOCK', 'Mock Exam'), ('OTHER', 'Other')], default='SEQUENCE', max_length=20)),
                ('mode', models.CharField(choices=[('ONLINE', 'Online'), ('ONSITE', 'Onsite')], default='ONSITE', max_length=10)),
                ('target_class', models.CharField(max_length=100)),
                ('instructions', models.TextField(blank=True)),
                ('venue', models.CharField(blank=True, default='', max_length=255)),
                ('start_time', models.DateTimeField()),
                ('duration_minutes', models.PositiveIntegerField(default=30)),
                ('status', models.CharField(choices=[('DRAFT', 'Draft'), ('SCHEDULED', 'Scheduled'), ('CANCELLED', 'Cancelled'), ('COMPLETED', 'Completed')], default='SCHEDULED', max_length=20)),
                ('pass_mark', models.DecimalField(decimal_places=2, default=Decimal('50.00'), max_digits=5, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('allow_review', models.BooleanField(default=True)),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='exams', to='schools.school')),
                ('sequence', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='exams', to='grades.sequence')),
                ('subject', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='exams', to='grades.subject')),
                ('teacher', models.ForeignKey(blank=True, limit_choices_to={'role': 'TEACHER'}, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='managed_exams', to='users.user')),
            ],
            options={
                'ordering': ['-start_time', 'title'],
                'indexes': [
                    models.Index(fields=['school', 'mode', 'status'], name='exams_exam_school_i_757f2a_idx'),
                    models.Index(fields=['school', 'target_class'], name='exams_exam_school_i_0f2961_idx'),
                    models.Index(fields=['school', 'start_time'], name='exams_exam_school_i_818e3d_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='ExamQuestion',
            fields=[
                ('created', django_extensions.db.models.CreationDateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', django_extensions.db.models.ModificationDateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('order', models.PositiveIntegerField(default=1)),
                ('text', models.TextField()),
                ('image_url', models.TextField(blank=True, default='')),
                ('options', models.JSONField(blank=True, default=list)),
                ('correct_option', models.PositiveIntegerField(default=0)),
                ('marks', models.PositiveIntegerField(default=1)),
                ('explanation', models.TextField(blank=True, default='')),
                ('exam', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='questions', to='exams.exam')),
            ],
            options={
                'ordering': ['order', 'created'],
                'unique_together': {('exam', 'order')},
            },
        ),
        migrations.CreateModel(
            name='ExamSubmission',
            fields=[
                ('created', django_extensions.db.models.CreationDateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', django_extensions.db.models.ModificationDateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('answers', models.JSONField(blank=True, default=dict)),
                ('score', models.DecimalField(blank=True, decimal_places=2, max_digits=7, null=True)),
                ('total_marks', models.DecimalField(blank=True, decimal_places=2, max_digits=7, null=True)),
                ('percentage', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('status', models.CharField(choices=[('IN_PROGRESS', 'In Progress'), ('SUBMITTED', 'Submitted'), ('GRADED', 'Graded'), ('ABSENT', 'Absent')], default='IN_PROGRESS', max_length=20)),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('graded_at', models.DateTimeField(blank=True, null=True)),
                ('exam', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to='exams.exam')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='exam_submissions', to='students.student')),
            ],
            options={
                'ordering': ['-submitted_at', '-created'],
                'unique_together': {('exam', 'student')},
                'indexes': [
                    models.Index(fields=['student', 'status'], name='exams_exams_student_795670_idx'),
                    models.Index(fields=['exam', 'status'], name='exams_exams_exam_id_5872d8_idx'),
                ],
            },
        ),
    ]

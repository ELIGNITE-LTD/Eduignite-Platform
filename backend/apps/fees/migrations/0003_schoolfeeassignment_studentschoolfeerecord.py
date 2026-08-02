from decimal import Decimal
import uuid

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fees', '0002_initial'),
        ('schools', '0007_subschool_schoolclass_and_more'),
        ('students', '0008_student_school_class_and_more'),
        ('users', '0007_user_previous_role_user_users_previou_aa2677_idx'),
    ]

    operations = [
        migrations.CreateModel(
            name='SchoolFeeAssignment',
            fields=[
                ('created', models.DateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', models.DateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('academic_year', models.CharField(max_length=20)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0'))])),
                ('currency', models.CharField(default='XAF', max_length=3)),
                ('notes', models.TextField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_school_fee_assignments', to='users.user')),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='school_fee_assignments', to='schools.school')),
                ('school_class', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fee_assignments', to='schools.schoolclass')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_school_fee_assignments', to='users.user')),
            ],
            options={
                'ordering': ['school_class__name', '-academic_year'],
                'unique_together': {('school_class', 'academic_year')},
            },
        ),
        migrations.CreateModel(
            name='StudentSchoolFeeRecord',
            fields=[
                ('created', models.DateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', models.DateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('total_amount', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0'))])),
                ('amount_paid', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0'))])),
                ('balance', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0'))])),
                ('status', models.CharField(choices=[('unpaid', 'Unpaid'), ('incomplete', 'Incomplete Payment'), ('paid', 'Paid')], default='unpaid', max_length=20)),
                ('notes', models.TextField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('last_recorded_at', models.DateTimeField(blank=True, null=True)),
                ('fee_assignment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='student_records', to='fees.schoolfeeassignment')),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='student_school_fee_records', to='schools.school')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='school_fee_records', to='students.student')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_student_school_fee_records', to='users.user')),
            ],
            options={
                'ordering': ['fee_assignment__school_class__name', 'student__user__name'],
                'unique_together': {('fee_assignment', 'student')},
            },
        ),
        migrations.AddIndex(
            model_name='schoolfeeassignment',
            index=models.Index(fields=['school', 'academic_year'], name='fees_school_school_i_5a6fb4_idx'),
        ),
        migrations.AddIndex(
            model_name='schoolfeeassignment',
            index=models.Index(fields=['school_class', 'is_active'], name='fees_school_school_c_7a4b45_idx'),
        ),
        migrations.AddIndex(
            model_name='studentschoolfeerecord',
            index=models.Index(fields=['school', 'status'], name='fees_stude_school__0a1367_idx'),
        ),
        migrations.AddIndex(
            model_name='studentschoolfeerecord',
            index=models.Index(fields=['student', 'is_active'], name='fees_stude_student_6a9e26_idx'),
        ),
        migrations.AddIndex(
            model_name='studentschoolfeerecord',
            index=models.Index(fields=['fee_assignment', 'is_active'], name='fees_stude_fee_ass_d18f28_idx'),
        ),
    ]

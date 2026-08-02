import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_user_previous_role_user_users_previou_aa2677_idx'),
        ('students', '0010_expand_relationship_choices'),
    ]

    operations = [
        migrations.CreateModel(
            name='Guardian',
            fields=[
                ('created', models.DateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', models.DateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=255)),
                ('phone', models.CharField(max_length=20)),
                ('whatsapp', models.CharField(blank=True, max_length=20)),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('national_id', models.CharField(blank=True, max_length=50)),
                ('occupation', models.CharField(blank=True, max_length=100)),
                ('user', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='guardian_profile', to='users.user')),
            ],
            options={
                'db_table': 'guardians',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='StudentGuardian',
            fields=[
                ('created', models.DateTimeField(auto_now_add=True, verbose_name='created')),
                ('modified', models.DateTimeField(auto_now=True, verbose_name='modified')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('relationship', models.CharField(choices=[('father', 'Father'), ('mother', 'Mother'), ('uncle', 'Uncle'), ('aunt', 'Aunt'), ('elder_sibling', 'Elder Sibling'), ('legal_guardian', 'Legal Guardian'), ('other', 'Other')], max_length=30)),
                ('is_primary', models.BooleanField(default=False)),
                ('can_pickup', models.BooleanField(default=True)),
                ('emergency_contact', models.BooleanField(default=False)),
                ('guardian', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='student_links', to='students.guardian')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='guardian_links', to='students.student')),
            ],
            options={
                'db_table': 'student_guardians',
                'unique_together': {('student', 'guardian')},
            },
        ),
        migrations.AddField(
            model_name='guardian',
            name='students',
            field=models.ManyToManyField(related_name='guardians', through='students.StudentGuardian', to='students.student'),
        ),
        migrations.AddIndex(
            model_name='guardian',
            index=models.Index(fields=['phone'], name='guardians_phone_2e0ba7_idx'),
        ),
        migrations.AddIndex(
            model_name='guardian',
            index=models.Index(fields=['email'], name='guardians_email_1f6604_idx'),
        ),
        migrations.AddIndex(
            model_name='studentguardian',
            index=models.Index(fields=['student', 'is_primary'], name='student_gua_student_c76d21_idx'),
        ),
        migrations.AddIndex(
            model_name='studentguardian',
            index=models.Index(fields=['guardian'], name='student_gua_guardia_635f7d_idx'),
        ),
    ]

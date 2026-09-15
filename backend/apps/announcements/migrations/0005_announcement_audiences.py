from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('schools', '0022_schoolsettings_dismissal_average'),
        ('announcements', '0004_announcement_attachment_extension_validator'),
    ]

    operations = [
        migrations.AlterField(
            model_name='announcement',
            name='target',
            field=models.CharField(
                choices=[
                    ('EXECUTIVE', 'Executive'),
                    ('ALL_SCHOOL_USERS', 'All School Users'),
                    ('ALL_EDUIGNITE_USERS', 'All EduIgnite Users'),
                    ('PRINCIPAL', 'Principal'),
                    ('ALL', 'All School Members'),
                    ('SCHOOL_ALL', 'All School Members'),
                    ('STUDENT', 'Students Only'),
                    ('TEACHER', 'Teachers Only'),
                    ('PARENT', 'Parents'),
                    ('BURSAR', 'Bursar Only'),
                    ('LIBRARIAN', 'Librarian Only'),
                    ('PERSONAL', 'Personal Message'),
                    ('EXECUTIVE_BOARD', 'Executive Board (retired)'),
                    ('STAFF', 'Platform Staff (retired)'),
                    ('PARTNER', 'Partners & Investors (retired)'),
                ],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='announcement',
            name='target_school',
            field=models.ForeignKey(
                blank=True,
                help_text='Platform parent announcements only: limits delivery to parents of this school.',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='targeted_announcements',
                to='schools.school',
            ),
        ),
        migrations.AddField(
            model_name='announcement',
            name='legacy_target',
            field=models.CharField(
                blank=True,
                default='',
                help_text='The target this row had before the audience repair migration, kept for audit.',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='AnnouncementAudienceGrant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('audience', models.CharField(
                    choices=[
                        ('ALL_SCHOOL_USERS', 'All School Users'),
                        ('ALL_EDUIGNITE_USERS', 'All EduIgnite Users'),
                        ('PRINCIPAL', 'Principal'),
                        ('PARENT', 'Parent'),
                    ],
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('granted_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='announcement_audience_grants',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['user_id', 'audience'],
                'unique_together': {('user', 'audience')},
            },
        ),
    ]

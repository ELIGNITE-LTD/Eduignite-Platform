from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('schools', '0022_schoolsettings_dismissal_average'),
        ('surveys', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='survey',
            name='audience',
            field=models.CharField(
                choices=[
                    ('ALL_EDUIGNITE_USERS', 'All EduIgnite Users'),
                    ('ALL_SCHOOL_USERS', 'All School Users'),
                    ('EXECUTIVE', 'Executives'),
                    ('PRINCIPAL', 'Principals'),
                    ('SCHOOL_STAFF', 'School Staff'),
                    ('TEACHER', 'Teachers'),
                    ('STUDENT', 'Students'),
                    ('PARENT', 'Parents'),
                ],
                default='ALL_EDUIGNITE_USERS',
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name='survey',
            name='target_school',
            field=models.ForeignKey(
                blank=True,
                help_text='School audiences only: limits the survey to this one school.',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='targeted_surveys',
                to='schools.school',
            ),
        ),
        migrations.AddField(
            model_name='survey',
            name='allow_multiple_responses',
            field=models.BooleanField(default=False, help_text='When set, a person may answer again after submitting.'),
        ),
        migrations.AddIndex(
            model_name='survey',
            index=models.Index(fields=['audience'], name='surveys_audience_idx'),
        ),
        migrations.AddField(
            model_name='surveyresponse',
            name='sequence',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.RemoveConstraint(
            model_name='surveyresponse',
            name='survey_response_unique_survey_user',
        ),
        migrations.AddConstraint(
            model_name='surveyresponse',
            constraint=models.UniqueConstraint(
                fields=('survey', 'user', 'sequence'),
                name='survey_response_unique_survey_user_sequence',
            ),
        ),
        migrations.CreateModel(
            name='SurveyPublisher',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('granted_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='survey_publisher_grant',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'survey_publishers',
                'ordering': ['-created_at'],
            },
        ),
    ]

from django.db import migrations, models


# Account-type presentation update, kept in sync with apps.users.models.UserRole:
# - COO is now presented as "Operation Department" (the stored value "COO" is
#   unchanged, so no data is touched).
# - New executive role SYSTEM_DEV, presented as "Systems Department": the team
#   that builds, deploys and maintains the EduIgnite platform and provisions
#   executive accounts. Additive only.
ROLE_CHOICES = [
    ('SUPER_ADMIN', 'Super Admin'),
    ('CEO', 'Chief Executive Officer'),
    ('CTO', 'Chief Technology Officer'),
    ('COO', 'Operation Department'),
    ('INV', 'Investor'),
    ('DESIGNER', 'Marketing Department'),
    ('SYSTEM_DEV', 'Systems Department'),
    ('SCHOOL_ADMIN', 'School Administrator'),
    ('SUB_ADMIN', 'Sub Administrator'),
    ('TEACHER', 'Teacher'),
    ('STUDENT', 'Student'),
    ('PARENT', 'Parent'),
    ('BURSAR', 'Bursar'),
    ('LIBRARIAN', 'Librarian'),
    ('ACADEMY_LEARNER', 'Academy Learner'),
    ('AI_GUEST', 'EduIgnite AI Guest'),
    ('PARTNER', 'Partner'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0024_teacher_twin'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(choices=ROLE_CHOICES, db_index=True, default='STUDENT', max_length=50),
        ),
        migrations.AlterField(
            model_name='user',
            name='previous_role',
            field=models.CharField(
                blank=True,
                choices=ROLE_CHOICES,
                help_text='Last non-admin staff role preserved when a user is temporarily assigned as a sub administrator.',
                max_length=50,
                null=True,
            ),
        ),
    ]

from django.db import migrations, models


# Label-only change: the DESIGNER role is now presented as "Marketing
# Department". The stored value ("DESIGNER") is unchanged, so this touches no
# data - it only keeps the field's choices in sync with the model.
ROLE_CHOICES = [
    ('SUPER_ADMIN', 'Super Admin'),
    ('CEO', 'Chief Executive Officer'),
    ('CTO', 'Chief Technology Officer'),
    ('COO', 'Chief Operations Officer'),
    ('INV', 'Investor'),
    ('DESIGNER', 'Marketing Department'),
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
        ('users', '0021_rename_uc_user_cap_active_idx_users_userc_user_id_47f732_idx_and_more'),
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

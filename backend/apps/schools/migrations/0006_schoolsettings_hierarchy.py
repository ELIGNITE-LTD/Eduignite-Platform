from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0005_alter_school_banner_alter_school_logo'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE school_settings
                    ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE school_settings
                    ADD COLUMN IF NOT EXISTS class_levels jsonb NOT NULL DEFAULT '[]'::jsonb;
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE school_settings
                    ADD COLUMN IF NOT EXISTS departments jsonb NOT NULL DEFAULT '[]'::jsonb;
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE school_settings
                    ADD COLUMN IF NOT EXISTS streams jsonb NOT NULL DEFAULT '[]'::jsonb;
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='schoolsettings',
                    name='sections',
                    field=models.JSONField(
                        blank=True,
                        default=list,
                        help_text='School sections such as English, French, Bilingual or Technical.',
                    ),
                ),
                migrations.AddField(
                    model_name='schoolsettings',
                    name='class_levels',
                    field=models.JSONField(
                        blank=True,
                        default=list,
                        help_text='Registered class levels such as Form 1, Form 2, Lower Sixth.',
                    ),
                ),
                migrations.AddField(
                    model_name='schoolsettings',
                    name='departments',
                    field=models.JSONField(
                        blank=True,
                        default=list,
                        help_text='Academic or administrative departments in the school.',
                    ),
                ),
                migrations.AddField(
                    model_name='schoolsettings',
                    name='streams',
                    field=models.JSONField(
                        blank=True,
                        default=list,
                        help_text='Optional streams/specialisations such as General, Commercial, Industrial.',
                    ),
                ),
            ],
        ),
    ]

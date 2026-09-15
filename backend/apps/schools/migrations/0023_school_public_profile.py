from django.db import migrations, models


def backfill_public_slugs(apps, schema_editor):
    from apps.schools.public_slugs import unique_public_slug

    School = apps.get_model('schools', 'School')
    for school in School.objects.filter(public_slug__isnull=True).order_by('created_at').iterator():
        school.public_slug = unique_public_slug(school, model=School)
        school.save(update_fields=['public_slug'])


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0022_schoolsettings_dismissal_average'),
    ]

    operations = [
        migrations.AddField(
            model_name='school',
            name='public_profile_enabled',
            field=models.BooleanField(
                default=True,
                help_text=(
                    "Publish this school's public profile page. It shows only the "
                    "school's own descriptive and contact details, never people or finances."
                ),
            ),
        ),
        migrations.AddField(
            model_name='school',
            name='public_slug',
            field=models.SlugField(
                blank=True,
                help_text='Address of the public profile page: /school/<public_slug>.',
                max_length=90,
                null=True,
                unique=True,
            ),
        ),
        migrations.RunPython(backfill_public_slugs, migrations.RunPython.noop),
    ]

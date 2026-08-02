from django.db import migrations


SUB_SCHOOL_MAP = {
    ('general', 'anglophone'): [],
    ('general', 'francophone'): [],
    ('general', 'bilingual'): ['Anglophone General Section', 'Francophone General Section'],
    ('technical', 'anglophone'): [],
    ('technical', 'francophone'): [],
    ('technical', 'bilingual'): ['Anglophone Technical Section', 'Francophone Technical Section'],
    ('mixed', 'anglophone'): ['General Section', 'Technical Section'],
    ('mixed', 'francophone'): ['General Section', 'Technical Section'],
    ('mixed', 'bilingual'): [
        'Anglophone General Section',
        'Francophone General Section',
        'Anglophone Technical Section',
        'Francophone Technical Section',
    ],
}


def sync_existing_sub_schools(apps, schema_editor):
    School = apps.get_model('schools', 'School')
    SubSchool = apps.get_model('schools', 'SubSchool')

    for school in School.objects.all():
        expected_names = SUB_SCHOOL_MAP.get((school.school_type, school.subsystem), [])
        existing_names = set(SubSchool.objects.filter(school=school).values_list('name', flat=True))
        if not expected_names:
            SubSchool.objects.filter(school=school).delete()
            continue
        for name in expected_names:
            if name not in existing_names:
                SubSchool.objects.create(school=school, name=name)
        stale_names = existing_names.difference(expected_names)
        if stale_names:
            SubSchool.objects.filter(school=school, name__in=stale_names).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0009_alter_school_phone'),
    ]

    operations = [
        migrations.RunPython(sync_existing_sub_schools, migrations.RunPython.noop),
    ]

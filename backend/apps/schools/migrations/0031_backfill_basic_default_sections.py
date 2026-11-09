"""Give classes of nursery/primary schools a parent section (additive, idempotent).

For every Basic Education school:
* classes already have a section -> nothing happens;
* classes without a section and the school has exactly one section -> they are attached to it;
* classes without a section and the school has no section -> a default section
  (English / French by subsystem, custom so the type sync never removes it) is created
  and the classes are attached to it;
* the school has several sections -> ambiguous, left untouched (the hub shows them as
  "Unassigned" so the head picks).
Nothing is renamed or deleted. Reverse is a no-op (the section rows are harmless).
"""

import uuid

from django.db import migrations


def backfill(apps, schema_editor):
    School = apps.get_model('schools', 'School')
    SubSchool = apps.get_model('schools', 'SubSchool')
    SchoolClass = apps.get_model('schools', 'SchoolClass')

    orphan_school_ids = list(
        SchoolClass.objects.filter(sub_school__isnull=True, school__education_category='basic')
        .values_list('school_id', flat=True).distinct()
    )
    for school in School.objects.filter(id__in=orphan_school_ids):
        sections = list(SubSchool.objects.filter(school=school).order_by('name')[:2])
        if len(sections) > 1:
            continue
        if sections:
            target = sections[0]
        else:
            name = 'French Section' if school.subsystem == 'francophone' else 'English Section'
            target, _ = SubSchool.objects.get_or_create(
                school=school, name=name, defaults={'id': uuid.uuid4(), 'is_system_managed': False},
            )
        SchoolClass.objects.filter(school=school, sub_school__isnull=True).update(sub_school=target)


class Migration(migrations.Migration):
    dependencies = [('schools', '0030_admissions')]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]

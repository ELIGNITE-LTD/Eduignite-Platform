"""Give every existing nursery/primary school its standard level ladder (additive, idempotent).

For each Basic Education school that has NO ClassLevel yet:
* one ladder per section language (English: Nursery 1-3, Class 1-6; French: Petite/Moyenne/Grande
  section, SIL, CP, CE1, CE2, CM1, CM2); a school without recognisable sections follows its subsystem;
* classes without a level whose name reads as a level ("Class 3 A") are placed in it (level + stream
  only; the class NAME is never changed) and their pupils' derived ``class_level`` label follows.
Schools that already have any level are skipped. Nothing is renamed or deleted. Reverse is a no-op.
"""

import re
import uuid

from django.db import migrations

LADDER = {
    'en': ['Nursery 1', 'Nursery 2', 'Nursery 3', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'],
    'fr': ['Petite section', 'Moyenne section', 'Grande section', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'],
}


def _section_language(name):
    if re.search(r'engl|anglo', name or '', re.I):
        return 'en'
    if re.search(r'fran[cç]|franco|french', name or '', re.I):
        return 'fr'
    return None


def seed(apps, schema_editor):
    from apps.schools.class_levels import parse_basic_class_name

    School = apps.get_model('schools', 'School')
    SubSchool = apps.get_model('schools', 'SubSchool')
    ClassLevel = apps.get_model('schools', 'ClassLevel')
    SchoolClass = apps.get_model('schools', 'SchoolClass')
    Student = apps.get_model('students', 'Student')

    for school in School.objects.filter(education_category='basic'):
        if ClassLevel.objects.filter(school=school).exists():
            continue
        default = 'fr' if school.subsystem == 'francophone' else 'en'
        langs = []
        for section in SubSchool.objects.filter(school=school).order_by('name'):
            lang = _section_language(section.name) or default
            if lang not in langs:
                langs.append(lang)
        if not langs:
            langs = ['fr'] if school.subsystem == 'francophone' else ['en', 'fr'] if school.subsystem == 'bilingual' else ['en']

        by_name = {}
        for lang in langs:
            for stage, name in enumerate(LADDER[lang]):
                level, _ = ClassLevel.objects.get_or_create(
                    school=school, name=name,
                    defaults={'id': uuid.uuid4(), 'order': stage + 1, 'cycle': 'nursery' if stage < 3 else 'primary',
                              'language': lang, 'is_final': stage == 8},
                )
                by_name[name.lower()] = level

        taken = set()
        for klass in SchoolClass.objects.filter(school=school, level__isnull=True).order_by('name'):
            stage, lang, stream = parse_basic_class_name(klass.name)
            if stage is None:
                continue
            level = by_name.get(LADDER[lang][stage].lower())
            if level is None:
                level = next((l for l in by_name.values() if l.order == stage + 1), None)
            if level is None or (level.id, stream.lower()) in taken:
                continue
            taken.add((level.id, stream.lower()))
            SchoolClass.objects.filter(pk=klass.pk).update(level=level, stream=stream)
            Student.objects.filter(school_class_id=klass.pk).update(class_level=level.name)


class Migration(migrations.Migration):
    dependencies = [
        ('schools', '0032_class_levels'),
        ('students', '0020_class_levels'),
    ]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

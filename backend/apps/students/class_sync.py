"""One place that decides which class details a student carries.

A student is assigned to a class through ``Student.school_class``. The student
row also stores a few values that describe that class so lists, reports and
older code can read them without a join:

* ``student_class`` - the class name,
* ``class_level``   - the level read from the class name (Form 3, 6eme, ...),
* ``section``       - the stream read from the class name (Science, Arts, ...).

The sub-school and cycle are *not* copied onto the student: they are always
read through ``school_class`` and so can never disagree with it.

The class is the source of truth. ``derive_class_fields`` turns a class into
the values above, ``Student.save`` applies them whenever a class is set, and
``apps.students.api.sync_class_students`` re-applies them to every student of a
class when the class itself is edited. The ``sync_student_class_fields``
management command uses the same function to repair existing rows, so a
repaired row and a freshly saved row always agree.
"""

from __future__ import annotations

import re

CLASS_FIELDS = ('student_class', 'class_level', 'section')


def infer_class_level(class_name) -> str:
    """Read the class level from a class name; fall back to the name itself."""
    raw = (class_name or '').strip()
    label = raw.lower()
    normalized = label.replace(' ', '')
    if 'upper sixth' in label or 'upper6' in normalized or 'uppersixth' in normalized:
        return 'Upper Sixth'
    if 'lower sixth' in label or 'lower6' in normalized or 'lowersixth' in normalized:
        return 'Lower Sixth'
    for level in ('form1', 'form2', 'form3', 'form4', 'form5'):
        if level in normalized:
            return level.replace('form', 'Form ')
    if '6eme' in normalized or normalized == '6e':
        return '6eme'
    if '5eme' in normalized or normalized == '5e':
        return '5eme'
    if '4eme' in normalized or normalized == '4e':
        return '4eme'
    if '3eme' in normalized or normalized == '3e':
        return '3eme'
    if '2nde' in normalized or 'seconde' in normalized:
        return '2nde'
    if 'premiere' in normalized or '1ere' in normalized:
        return 'Premiere'
    if 'terminale' in normalized or normalized == 'tle':
        return 'Terminale'
    return raw or 'Current Class'


def infer_section(class_name) -> str:
    """Read the section/stream from a class name; 'General' when none is named."""
    label = (class_name or '').strip().lower()
    if 'bilingual' in label:
        return 'Bilingual'
    if 'technical' in label:
        return 'Technical'
    if 'science' in label:
        return 'Science'
    if re.search(r'\barts?\b', label):
        return 'Arts'
    if 'commercial' in label or 'commerce' in label:
        return 'Commercial'
    if 'french' in label or 'francophone' in label:
        return 'French Section'
    if 'english' in label or 'anglophone' in label:
        return 'English Section'
    return 'General'


def derive_class_fields(school_class) -> dict:
    """The class-derived values a student of ``school_class`` must carry."""
    name = school_class.name
    return {
        'student_class': name,
        'class_level': infer_class_level(name),
        'section': infer_section(name),
    }

"""Read-only report: basic-school teachers who already hold 2+ classes.

The one-class-per-teacher rule only blocks NEW assignments; existing data is
never touched. Run this to give each school the list it needs to fix by hand.

    python manage.py report_teachers_with_multiple_classes [--school <uuid>] [--json]
"""

import json

from django.core.management.base import BaseCommand, CommandError

from apps.schools.class_teacher_rules import teachers_with_multiple_classes
from apps.schools.models import School


class Command(BaseCommand):
    help = 'List nursery/primary teachers assigned to more than one class (read-only).'

    def add_arguments(self, parser):
        parser.add_argument('--school', help='Limit to one school id.')
        parser.add_argument('--json', action='store_true', help='Machine-readable output.')

    def handle(self, *args, **options):
        school = None
        if options.get('school'):
            school = School.objects.filter(id=options['school']).first()
            if not school:
                raise CommandError('School not found.')
        rows = teachers_with_multiple_classes(school)
        if options.get('json'):
            self.stdout.write(json.dumps([
                {
                    'school_id': str(sch.id), 'school': sch.name,
                    'teacher_id': str(t.id), 'teacher': t.name, 'matricule': t.matricule,
                    'classes': [c.name for c in classes],
                }
                for sch, t, classes in rows
            ], indent=2))
            return
        if not rows:
            self.stdout.write('No basic-school teacher holds more than one class.')
            return
        for sch, teacher, classes in rows:
            self.stdout.write(f'{sch.name} | {teacher.name} ({teacher.matricule}) | {", ".join(c.name for c in classes)}')
        self.stdout.write(f'{len(rows)} teacher(s) hold more than one class. Nothing was changed.')

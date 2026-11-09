"""Give existing nursery / primary classes a LEVEL (additive, idempotent, dry-run by default).

For every Basic Education school:
1. the standard level ladder (Nursery 1-3, Class 1-6 or Maternelle / SIL..CM2) is inserted when
   the school has NO level yet (a school that already defined levels is never given extra ones);
2. each class without a level is placed in the level its NAME spells out ("Class 3 A" -> level
   "Class 3", stream "A"). Names that do not match a level, or that would collide with another
   class of the same level and stream, are left without a level and REPORTED.

Safety:
* DRY-RUN BY DEFAULT: nothing is written unless ``--apply`` is given.
* Only ``SchoolClass.level`` / ``SchoolClass.stream`` and new ``ClassLevel`` rows are written. The
  class NAME, section, teacher, subjects, fees and the pupils' ``school_class`` are never touched.
* The pupils' derived ``class_level`` label is re-synced from the new level (the same function the
  repair command uses); re-run ``sync_student_class_fields`` at any time to verify.
* Secondary / higher schools are never touched. A second run finds nothing to do.
* ``--apply`` writes a CSV of every class changed (``--log-file``).

Usage:
    python manage.py backfill_class_levels                    # dry-run, all basic schools
    python manage.py backfill_class_levels --school <id|short_name>
    python manage.py backfill_class_levels --apply
"""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.schools import class_levels
from apps.schools.models import ClassLevel, School, SchoolClass
from apps.students import api as students_api

LOG_HEADER = ['school', 'class_id', 'class_name', 'new_level', 'new_stream', 'pupils', 'old_class_level_example']


class Command(BaseCommand):
    help = 'Infer the level of existing nursery/primary classes from their names. Dry-run unless --apply.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the changes. Without it nothing is changed.')
        parser.add_argument('--dry-run', action='store_true', help='Explicit dry-run (the default).')
        parser.add_argument('--school', help='Only this school (id or short_name).')
        parser.add_argument('--log-file', help='CSV of every class placed (default: ./class_levels_<timestamp>.csv when applying).')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        if apply_changes and options['dry_run']:
            raise CommandError('Use either --apply or --dry-run, not both.')
        schools = School.objects.filter(education_category='basic').order_by('name')
        if options['school']:
            key = options['school']
            matches = schools.filter(short_name=key)
            if not matches.exists():
                try:
                    matches = schools.filter(pk=key)
                except (ValidationError, ValueError):
                    matches = schools.none()
            if not matches.exists():
                raise CommandError(f'No basic-education school matches {key!r}.')
            schools = matches

        self.stdout.write(self.style.WARNING(
            'backfill_class_levels - ' + ('APPLY' if apply_changes else 'DRY-RUN (nothing will be written)')))
        writer = handle = log_path = None
        if apply_changes:
            stamp = timezone.now().strftime('%Y%m%d_%H%M%S')
            log_path = Path(options['log_file'] or f'class_levels_{stamp}.csv')
            handle = open(log_path, 'w', newline='', encoding='utf-8')
            writer = csv.writer(handle)
            writer.writerow(LOG_HEADER)

        totals = Counter()
        try:
            for school in schools:
                self._process(school, apply_changes, writer, totals)
        finally:
            if handle:
                handle.close()

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Summary'))
        self.stdout.write(f'  basic schools checked:            {totals["schools"]}')
        self.stdout.write(f'  levels {"created" if apply_changes else "to create"}:             {totals["levels"]}')
        self.stdout.write(f'  classes {"placed" if apply_changes else "to place"} in a level:   {totals["assigned"]}')
        self.stdout.write(f'  classes already in a level:       {totals["already"]}')
        self.stdout.write(f'  classes left WITHOUT a level:     {totals["skipped"]} (reported above; they keep working by name)')
        if apply_changes:
            self.stdout.write(self.style.SUCCESS(f'  pupils re-synced: {totals["pupils"]}. Change log: {log_path.resolve()}'))
        elif totals['levels'] or totals['assigned']:
            self.stdout.write(self.style.WARNING('Dry-run only. Review the above, then re-run with --apply.'))

    def _process(self, school, apply_changes, writer, totals):
        totals['schools'] += 1
        has_levels = ClassLevel.objects.filter(school=school).exists()
        classes = SchoolClass.objects.filter(school=school)
        totals['already'] += classes.filter(level__isnull=False).count()
        if not classes.filter(level__isnull=True).exists() and has_levels:
            return

        with transaction.atomic():
            sid = transaction.savepoint()
            seeded = 0 if has_levels else len(class_levels.ensure_default_levels(school)['created'])
            plan = class_levels.plan_backfill(school)
            self.stdout.write('')
            self.stdout.write(self.style.MIGRATE_HEADING(
                f'{school.name} [{school.short_name}]: {seeded} levels to create, '
                f'{len(plan["assign"])} classes to place, {len(plan["skipped"])} left without a level'
            ))
            totals['levels'] += seeded
            for klass, level, stream in plan['assign']:
                pupils = students_api.list_students(school=school, school_class=klass).count()
                label = f'{level.name} {stream}'.strip()
                self.stdout.write(f'    {klass.name!r} -> level {level.name!r}, stream {stream!r} ({pupils} pupils)')
                totals['assigned'] += 1
                if apply_changes:
                    # Queryset update: only level/stream are written, the class name stays as it is.
                    SchoolClass.objects.filter(pk=klass.pk).update(level=level, stream=stream)
                    klass.refresh_from_db()
                    totals['pupils'] += students_api.sync_class_students(klass)
                    writer.writerow([school.short_name, klass.pk, klass.name, level.name, stream, pupils, label])
            for klass, reason in plan['skipped']:
                totals['skipped'] += 1
                self.stdout.write(self.style.WARNING(f'    {klass.name!r}: no level ({reason})'))
            if not apply_changes:
                transaction.savepoint_rollback(sid)
            else:
                transaction.savepoint_commit(sid)

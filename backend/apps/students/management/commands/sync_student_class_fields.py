"""Repair students whose class-derived fields disagree with their class.

A student's class is ``Student.school_class``. The row also copies the class
name, level and section (``student_class``, ``class_level``, ``section``).
When a class was changed through a path that did not refresh those copies, the
student kept showing the previous class's details. This command finds those
rows and rewrites ONLY those three fields from the assigned class.

Safety:
* DRY-RUN BY DEFAULT. Nothing is written unless ``--apply`` is given.
* ``school_class`` is never written: the assigned class is never changed.
* Students without a class are not touched; they are only counted.
* Idempotent: a second run finds nothing to do.
* Each school is repaired in its own transaction; a CSV of every old and new
  value is written (``--log-file``) and ``--revert-from`` restores from it.
* Sub-school and cycle are not stored on the student (they are read through the
  class), so they cannot be out of step and are never written.

Usage:
    python manage.py sync_student_class_fields                 # dry-run, all schools
    python manage.py sync_student_class_fields --school <id|short_name>
    python manage.py sync_student_class_fields --apply         # write the fixes
    python manage.py sync_student_class_fields --revert-from <csv> --apply
"""

from __future__ import annotations

import csv
import logging
from collections import Counter
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.schools.models import School
from apps.students.class_sync import CLASS_FIELDS, enforced_class_fields
from apps.students.models import Student, StudentActivationToken

logger = logging.getLogger(__name__)

LOG_HEADER = [
    'kind', 'id', 'school', 'school_class_id',
    'old_student_class', 'old_class_level', 'old_section',
    'new_student_class', 'new_class_level', 'new_section',
]


class Command(BaseCommand):
    help = (
        'Fix students whose class name/level/section do not match their assigned class. '
        'Dry-run unless --apply is given. Never changes the assigned class.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the fixes. Without it nothing is changed.')
        parser.add_argument('--dry-run', action='store_true', help='Explicit dry-run (this is the default).')
        parser.add_argument('--school', help='Only this school (id or short_name).')
        parser.add_argument('--examples', type=int, default=10, help='Examples to print per school (default 10).')
        parser.add_argument('--log-file', help='CSV of every change (default: ./student_class_sync_<timestamp>.csv when applying).')
        parser.add_argument('--revert-from', help='Restore the old values recorded in a CSV written by a previous --apply.')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        if apply_changes and options['dry_run']:
            raise CommandError('Use either --apply or --dry-run, not both.')

        if options['revert_from']:
            return self._revert(options['revert_from'], apply_changes)

        schools = School.objects.all().order_by('name')
        if options['school']:
            key = options['school']
            matches = schools.filter(short_name=key)
            if not matches.exists():
                try:
                    matches = schools.filter(pk=key)
                except (ValidationError, ValueError):
                    matches = schools.none()
            if not matches.exists():
                raise CommandError(f'No school matches {key!r}.')
            schools = matches

        mode = 'APPLY' if apply_changes else 'DRY-RUN (nothing will be written)'
        self.stdout.write(self.style.WARNING(f'sync_student_class_fields - {mode}'))

        log_writer = None
        log_handle = None
        log_path = None
        if apply_changes:
            stamp = timezone.now().strftime('%Y%m%d_%H%M%S')
            log_path = Path(options['log_file'] or f'student_class_sync_{stamp}.csv')
            log_handle = open(log_path, 'w', newline='', encoding='utf-8')
            log_writer = csv.writer(log_handle)
            log_writer.writerow(LOG_HEADER)

        totals = Counter()
        try:
            for school in schools:
                self._process_school(school, apply_changes, options['examples'], log_writer, totals)
        finally:
            if log_handle:
                log_handle.close()

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Summary'))
        self.stdout.write(f'  students checked (with a class): {totals["checked"]}')
        self.stdout.write(f'  students already correct:        {totals["checked"] - totals["mismatched"]}')
        self.stdout.write(f'  students out of step:            {totals["mismatched"]}')
        for field in CLASS_FIELDS:
            self.stdout.write(f'    - {field} differs: {totals["field:" + field]}')
        self.stdout.write(f'  students with NO class (left alone): {totals["no_class"]}')
        self.stdout.write(f'  unused activation tokens out of step: {totals["tokens"]}')
        if apply_changes:
            self.stdout.write(self.style.SUCCESS(f'  rows updated: {totals["updated"]}. Change log: {log_path.resolve()}'))
        elif totals['mismatched'] or totals['tokens']:
            self.stdout.write(self.style.WARNING('Dry-run only. Review the above, then re-run with --apply.'))

    def _process_school(self, school, apply_changes, example_limit, log_writer, totals):
        students = Student.objects.filter(school=school)
        no_class = students.filter(school_class__isnull=True).count()
        with_class = students.filter(school_class__isnull=False).select_related('school_class')

        mismatches = []
        checked = 0
        for student in with_class.iterator(chunk_size=500):
            checked += 1
            expected = enforced_class_fields(student.school_class)
            diff = {f: (getattr(student, f), v) for f, v in expected.items() if getattr(student, f) != v}
            if diff:
                mismatches.append((student, expected, diff))

        tokens = []
        token_rows = StudentActivationToken.objects.filter(
            school=school, is_used=False, school_class__isnull=False
        ).select_related('school_class')
        for token in token_rows.iterator(chunk_size=500):
            expected = enforced_class_fields(token.school_class)
            if any(getattr(token, f) != v for f, v in expected.items()):
                tokens.append((token, expected))

        totals['checked'] += checked
        totals['mismatched'] += len(mismatches)
        totals['no_class'] += no_class
        totals['tokens'] += len(tokens)
        for _student, _expected, diff in mismatches:
            for field in diff:
                totals['field:' + field] += 1

        if not (mismatches or tokens or no_class):
            return
        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING(
            f'{school.name} [{school.short_name}]: {checked} with a class, {len(mismatches)} out of step, '
            f'{no_class} without a class, {len(tokens)} stale unused tokens'
        ))
        for student, _expected, diff in mismatches[:example_limit]:
            changes = '; '.join(f'{f}: {old!r} -> {new!r}' for f, (old, new) in diff.items())
            self.stdout.write(f'    {student.admission_number} (assigned class {student.school_class.name!r}): {changes}')
        if len(mismatches) > example_limit:
            self.stdout.write(f'    ... and {len(mismatches) - example_limit} more')

        if not apply_changes or not (mismatches or tokens):
            return

        with transaction.atomic():
            for student, expected, _diff in mismatches:
                log_writer.writerow([
                    'student', student.pk, school.pk, student.school_class_id,
                    student.student_class, student.class_level, student.section,
                    expected['student_class'], expected['class_level'], expected.get('section', student.section),
                ])
                # A queryset update writes only these columns: school_class,
                # fees and enrolments are not saved or recomputed.
                Student.objects.filter(pk=student.pk).update(**expected)
                totals['updated'] += 1
            for token, expected in tokens:
                log_writer.writerow([
                    'token', token.pk, school.pk, token.school_class_id,
                    token.student_class, token.class_level, token.section,
                    expected['student_class'], expected['class_level'], expected.get('section', token.section),
                ])
                StudentActivationToken.objects.filter(pk=token.pk).update(**expected)
                totals['updated'] += 1
        logger.info(
            'sync_student_class_fields: repaired %s students and %s tokens for school %s',
            len(mismatches), len(tokens), school.pk,
        )

    def _revert(self, path, apply_changes):
        """Put back the old values from a change log, only where the row still holds the new ones."""
        models = {'student': Student, 'token': StudentActivationToken}
        restorable = skipped = 0
        with open(path, newline='', encoding='utf-8') as handle:
            rows = list(csv.DictReader(handle))
        with transaction.atomic():
            for row in rows:
                current = models[row['kind']].objects.filter(
                    pk=row['id'], student_class=row['new_student_class'],
                    class_level=row['new_class_level'], section=row['new_section'],
                )
                if not current.exists():
                    skipped += 1
                    continue
                restorable += 1
                if apply_changes:
                    current.update(
                        student_class=row['old_student_class'],
                        class_level=row['old_class_level'],
                        section=row['old_section'],
                    )
        verb = 'restored' if apply_changes else 'would restore (dry-run)'
        self.stdout.write(f'{verb} {restorable} rows; skipped {skipped} (changed since the log was written).')

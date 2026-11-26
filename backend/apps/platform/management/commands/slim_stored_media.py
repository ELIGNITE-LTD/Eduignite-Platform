"""Shrink the oversized images already stored in the database as base64 (profile photos, logos, banners, ...).

Safe to run any number of times: pictures that are already small are not touched, nothing is ever made larger, formats stay
JPEG/PNG and the images stay inline, so ID cards, report cards and offline use behave as before. Runs on every deploy.
Prints counts and sizes only (the deploy log is public).
"""

from django.apps import apps
from django.core.management.base import BaseCommand

from core.slim_media import shrink_data_uri

# (app, model, field, kind)
FIELDS = [
    ('users', 'User', 'avatar', 'avatar'),
    ('schools', 'School', 'logo', 'logo'),
    ('schools', 'School', 'banner', 'banner'),
    ('schools', 'SchoolEvent', 'image', 'photo'),
    ('platform', 'PlatformSettings', 'logo', 'logo'),
    ('community', 'CommunityBlog', 'image', 'photo'),
    ('library', 'Book', 'cover_image', 'photo'),
    ('school_site_content', 'PublicLeader', 'photo', 'avatar'),
    ('exams', 'ExamQuestion', 'image_url', 'photo'),
    ('partners', 'Partner', 'logo_url', 'logo'),
    ('academy', 'AcademyProfile', 'avatar_url', 'avatar'),
    ('academy', 'Course', 'thumbnail_url', 'photo'),
    ('academy', 'ProfileConfig', 'logo_url', 'logo'),
    ('academy', 'TrainerProfile', 'photo_url', 'avatar'),
]


class Command(BaseCommand):
    help = 'Shrink oversized base64 images stored in the database (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Report what would change; write nothing.')

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        total_before = total_after = changed_rows = 0
        for app_label, model_name, field, kind in FIELDS:
            try:
                model = apps.get_model(app_label, model_name)
            except LookupError:
                continue
            manager = model._base_manager  # include rows hidden by soft-delete managers
            before = after = changed = 0
            rows = manager.filter(**{f'{field}__startswith': 'data:image/'}).values_list('pk', field)
            for pk, value in rows.iterator(chunk_size=20):
                try:
                    smaller = shrink_data_uri(value, kind)
                    if smaller != value and len(smaller) < len(value):
                        before += len(value)
                        after += len(smaller)
                        changed += 1
                        if not dry:
                            manager.filter(pk=pk).update(**{field: smaller})  # no signals, no auto_now
                except Exception as exc:  # noqa: BLE001 - one bad row must not stop the rest
                    self.stderr.write(f'{app_label}.{model_name}.{field}: skipped a row ({type(exc).__name__})')
            if changed:
                self.stdout.write(f'{app_label}.{model_name}.{field}: {changed} shrunk, {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')
            total_before += before
            total_after += after
            changed_rows += changed
        verb = 'would shrink' if dry else 'shrunk'
        self.stdout.write(f'slim_stored_media: {verb} {changed_rows} images, {total_before / 1e6:.1f} MB -> {total_after / 1e6:.1f} MB')

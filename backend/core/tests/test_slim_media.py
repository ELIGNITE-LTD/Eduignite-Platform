"""Stored images are shrunk but stay inline, valid and in a format every consumer handles."""

import base64
import io
from io import StringIO

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from PIL import Image

from apps.platform.management.commands.slim_stored_media import FIELDS
from core.slim_media import shrink_data_uri
from core.upload_validation import image_to_data_url

User = get_user_model()


def make(w=2400, h=1800, mode='RGB', fmt='PNG'):
    img = Image.effect_noise((w, h), 80).convert(mode)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def uri(raw, mime='image/png'):
    return f'data:{mime};base64,' + base64.b64encode(raw).decode()


def decode(value):
    head, payload = value.split(',', 1)
    return head[5:].split(';')[0], Image.open(io.BytesIO(base64.b64decode(payload)))


class ShrinkTests(TestCase):
    def test_a_big_opaque_picture_becomes_a_small_jpeg_inline(self):
        big = uri(make())
        small = shrink_data_uri(big, 'avatar')
        mime, img = decode(small)
        self.assertEqual(mime, 'image/jpeg')
        self.assertLessEqual(max(img.size), 400)
        self.assertTrue(small.startswith('data:image/jpeg;base64,'))
        self.assertLess(len(small), len(big) / 5)

    def test_transparency_is_kept_as_png(self):
        raw = Image.effect_noise((1600, 1600), 80).convert('RGBA')
        raw.putalpha(Image.linear_gradient('L').resize((1600, 1600)))  # genuinely transparent in places
        buf = io.BytesIO(); raw.save(buf, format='PNG')
        mime, img = decode(shrink_data_uri(uri(buf.getvalue()), 'logo'))
        self.assertEqual(mime, 'image/png')
        self.assertEqual(img.mode, 'RGBA')
        self.assertLessEqual(max(img.size), 600)

    def test_small_pictures_and_other_values_are_left_alone(self):
        tiny = uri(make(60, 60))
        for v in (tiny, '', None, 'https://example.com/a.png', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
                  'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:application/pdf;base64,AAAA', 'not a data uri'):
            self.assertEqual(shrink_data_uri(v, 'avatar'), v)

    def test_broken_images_come_back_unchanged_without_an_error(self):
        broken = 'data:image/png;base64,' + base64.b64encode(b'x' * 200000).decode()
        self.assertEqual(shrink_data_uri(broken, 'photo'), broken)
        self.assertEqual(shrink_data_uri('data:image/png;base64,@@@', 'photo'), 'data:image/png;base64,@@@')

    def test_it_never_makes_a_picture_bigger(self):
        already = uri(make(500, 500, fmt='JPEG'), 'image/jpeg')
        out = shrink_data_uri(already, 'avatar')
        self.assertLessEqual(len(out), len(already))

    def test_a_new_upload_is_stored_small(self):
        raw = make()
        f = SimpleUploadedFile('p.png', raw, content_type='image/png')
        stored = image_to_data_url(f, 'avatar')
        mime, img = decode(stored)
        self.assertLessEqual(max(img.size), 400)
        self.assertLess(len(stored), len(raw) / 5)

    def test_a_small_upload_is_stored_exactly_as_sent(self):
        raw = make(50, 50)
        f = SimpleUploadedFile('p.png', raw, content_type='image/png')
        self.assertEqual(image_to_data_url(f, 'avatar'), uri(raw))


class CommandTests(TestCase):
    def test_every_listed_field_exists(self):
        for app_label, model_name, field, kind in FIELDS:
            model = apps.get_model(app_label, model_name)
            model._meta.get_field(field)
            self.assertIn(kind, ('avatar', 'logo', 'banner', 'photo'))

    def test_it_shrinks_stored_avatars_once_and_leaves_the_rest(self):
        big = uri(make())
        a = User.objects.create_user(matricule='U1', name='A', email='a@example.org', role='TEACHER', password='x-pass-123', is_license_paid=True)
        b = User.objects.create_user(matricule='U2', name='B', email='b@example.org', role='TEACHER', password='x-pass-123', is_license_paid=True)
        c = User.objects.create_user(matricule='U3', name='C', email='c@example.org', role='TEACHER', password='x-pass-123', is_license_paid=True)
        small = uri(make(60, 60))
        User.objects.filter(pk=a.pk).update(avatar=big)
        User.objects.filter(pk=b.pk).update(avatar=small)
        User.objects.filter(pk=c.pk).update(avatar='https://example.com/c.png')

        out = StringIO()
        call_command('slim_stored_media', '--dry-run', stdout=out)
        self.assertEqual(User.objects.get(pk=a.pk).avatar, big, 'dry run must not write')
        self.assertIn('would shrink 1 images', out.getvalue())

        call_command('slim_stored_media', stdout=StringIO())
        shrunk = User.objects.get(pk=a.pk).avatar
        self.assertLess(len(shrunk), len(big) / 5)
        self.assertEqual(decode(shrunk)[0], 'image/jpeg')
        self.assertEqual(User.objects.get(pk=b.pk).avatar, small)
        self.assertEqual(User.objects.get(pk=c.pk).avatar, 'https://example.com/c.png')

        out = StringIO()
        call_command('slim_stored_media', stdout=out)  # second run changes nothing
        self.assertEqual(User.objects.get(pk=a.pk).avatar, shrunk)
        self.assertIn('shrunk 0 images', out.getvalue())

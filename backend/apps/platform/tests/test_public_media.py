"""The public site must not carry base64 images or videos inside its API responses (it made the home page ~45 MB)."""

import base64
import io
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.platform.public_media import slim
from apps.users.models import FounderProfile

User = get_user_model()
ORIGIN = 'https://api.example.org'


def png_data_uri(w=2400, h=1800):
    img = Image.effect_noise((w, h), 80).convert('RGB')  # noisy, so it is genuinely large
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(), len(buf.getvalue())


class SlimTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cm = override_settings(MEDIA_ROOT=self.tmp.name, MEDIA_URL='/media/', PUBLIC_MEDIA_ORIGIN=ORIGIN)
        self.cm.enable()
        self.addCleanup(self.cm.disable)

    def files(self):
        return sorted((Path(self.tmp.name) / 'public-cache').glob('*'))

    def test_normal_links_and_empty_values_pass_through(self):
        for v in ('', None, 'https://example.com/a.png', '/media/x.png'):
            self.assertEqual(slim(v), v or '')
        self.assertEqual(self.files(), [])

    def test_a_large_png_becomes_a_small_webp_file(self):
        uri, original = png_data_uri()
        url = slim(uri, 'avatar')
        self.assertTrue(url.startswith(f'{ORIGIN}/media/public-cache/') and url.endswith('.webp'), url)
        (f,) = self.files()
        with Image.open(f) as im:
            self.assertEqual(im.format, 'WEBP')
            self.assertLessEqual(max(im.size), 384)
        self.assertLess(f.stat().st_size, original / 4)

    def test_the_same_image_is_stored_once(self):
        uri, _ = png_data_uri(600, 400)
        self.assertEqual(slim(uri, 'photo'), slim(uri, 'photo'))
        self.assertEqual(len(self.files()), 1)

    def test_a_video_is_saved_as_is(self):
        raw = b'\x00\x00\x00\x18ftypmp42' + b'0' * 5000
        url = slim('data:video/mp4;base64,' + base64.b64encode(raw).decode(), 'gallery')
        self.assertTrue(url.endswith('.mp4'))
        (f,) = self.files()
        self.assertEqual(f.read_bytes(), raw)

    def test_unsafe_or_broken_values_are_dropped_not_passed_on(self):
        svg = base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').decode()
        for bad in (f'data:image/svg+xml;base64,{svg}',
                    f'data:text/html;base64,{base64.b64encode(b"<script>1</script>").decode()}',
                    'data:image/png;base64,@@@not-base64@@@',
                    'data:image/png;base64,' + base64.b64encode(b'this is not a png').decode(),
                    'data:garbage'):
            self.assertEqual(slim(bad), '', bad[:40])

    def test_a_small_image_stays_valid_when_it_cannot_be_written(self):
        uri, _ = png_data_uri(20, 20)
        with override_settings(MEDIA_ROOT='/proc/definitely-not-writable'):
            self.assertTrue(slim(uri, 'avatar').startswith('data:image/png'))


class PublicEndpointsAreLightTests(TestCase):
    def setUp(self):
        cache.clear()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        cm = override_settings(MEDIA_ROOT=self.tmp.name, MEDIA_URL='/media/', PUBLIC_MEDIA_ORIGIN=ORIGIN)
        cm.enable()
        self.addCleanup(cm.disable)

    def test_the_founders_list_has_no_embedded_images(self):
        uri, original = png_data_uri(1500, 1500)
        user = User.objects.create_user(matricule='CEO1', name='Ada Nkeng', email='ada@example.org', role='CEO',
                                        password='x-password-123', is_license_paid=True)
        FounderProfile.objects.create(user=user, founder_title='CEO')
        User.objects.filter(pk=user.pk).update(avatar=uri)

        r = APIClient().get('/api/v1/platform/public-founders/')
        self.assertEqual(r.status_code, 200)
        body = r.content.decode()
        self.assertNotIn('data:image', body)
        self.assertLess(len(body), 5000)
        self.assertLess(len(body), original / 100)
        person = next(p for p in r.json() if p['name'] == 'Ada Nkeng')
        self.assertTrue(person['avatar'].startswith(f'{ORIGIN}/media/public-cache/'))

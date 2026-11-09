"""Public events and gallery: management permissions and isolation, public visibility,
classification, upload validation, quota, throttle scope and absence of private data."""

import io
import shutil
import tempfile
from datetime import datetime, timedelta, timezone as dt_tz

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from apps.school_site_media import images, services, timeutil
from apps.school_site_media.models import PublicAlbum, PublicEvent, PublicMedia
from apps.school_site_media.public_views import PublicEventListView, PublicGalleryView
from apps.schools.models import PublicationStatus, School, SchoolEvent, SchoolPublicProfile, SchoolStatus

User = get_user_model()
BASE = '/api/v1/schools/public-site/'
PUB = '/api/v1/schools/public/'
TMP_MEDIA = tempfile.mkdtemp(prefix='site_media_test_')


def make_school(sid, published=True, **extra):
    fields = dict(
        id=sid, name=f'School {sid}', short_name=sid, principal='P. Head', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000', school_type='general',
        subsystem='anglophone', description='A fine school.', status=SchoolStatus.ACTIVE,
    )
    fields.update(extra)
    school = School.objects.create(**fields)
    profile, _ = SchoolPublicProfile.objects.get_or_create(school=school)
    if published:
        profile.publication_status = PublicationStatus.PUBLISHED
        profile.save()
    return school


def make_user(matricule, role, school=None):
    return User.objects.create_user(
        matricule=matricule, name=f'User {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='password123', is_license_paid=True,
    )


def png_bytes(size=(40, 30), fmt='PNG', exif=False, color=(200, 30, 30)):
    img = Image.new('RGB', size, color)
    buf = io.BytesIO()
    kwargs = {}
    if exif:
        e = Image.Exif()
        e[0x010F] = 'SecretCamera'          # Make
        e[0x0112] = 1                       # Orientation
        kwargs['exif'] = e.tobytes()
    img.save(buf, fmt, **kwargs)
    return buf.getvalue()


def upload(name='photo.png', data=None, ctype='image/png'):
    return SimpleUploadedFile(name, data if data is not None else png_bytes(), content_type=ctype)


def when(**delta):
    return (timezone.now() + timedelta(**delta)).isoformat()


@override_settings(MEDIA_ROOT=TMP_MEDIA)
class Base(APITestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)

    @classmethod
    def setUpTestData(cls):
        cls.a = make_school('SEA')
        cls.b = make_school('SEB')
        cls.draft_school = make_school('SED', published=False)
        cls.admin_a = make_user('ADM-SEA', 'SCHOOL_ADMIN', cls.a)
        cls.sub_a = make_user('SUB-SEA', 'SUB_ADMIN', cls.a)
        cls.admin_b = make_user('ADM-SEB', 'SCHOOL_ADMIN', cls.b)
        cls.teacher_a = make_user('TCH-SEA', 'TEACHER', cls.a)
        cls.ceo = make_user('CEO-SE', 'CEO')
        cls.coo = make_user('COO-SE', 'COO')

    def setUp(self):
        cache.clear()

    @property
    def p(self):
        return f'{PUB}{self.a.public_slug}/'

    def login(self, user):
        self.client.force_authenticate(user)

    def mk_event(self, school=None, publish=True, **kw):
        school = school or self.a
        data = dict(title_en='Sports day', start_at=timezone.now() + timedelta(days=3), slug=None)
        data.update(kw)
        data['slug'] = data['slug'] or services.unique_event_slug(school, data.get('title_en') or 'event')
        event = PublicEvent.objects.create(school=school, **data)
        if publish:
            event.status = 'published'
            event.save()
        return event

    def mk_album(self, school=None, publish=True, **kw):
        data = dict(title_en='Campus', category='campus')
        data.update(kw)
        album = PublicAlbum.objects.create(school=school or self.a, **data)
        if publish:
            album.status = 'published'
            album.save()
        return album


class ManagementPermissionTests(Base):
    def test_anonymous_and_teacher_cannot_manage(self):
        self.assertEqual(self.client.get(BASE + 'events/').status_code, 401)
        self.login(self.teacher_a)
        self.assertEqual(self.client.get(BASE + 'events/').status_code, 403)
        self.assertEqual(self.client.post(BASE + 'albums/', {'title_en': 'x'}, format='json').status_code, 403)

    def test_admin_crud_event(self):
        self.login(self.admin_a)
        res = self.client.post(BASE + 'events/', {
            'title_en': 'Open day', 'title_fr': 'Portes ouvertes', 'start_at': when(days=5),
            'category': 'academic', 'location': 'Main hall'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data['status'], 'draft')
        self.assertEqual(res.data['slug'], 'open-day')
        pk = res.data['id']
        # duplicate title gets a distinct slug
        res2 = self.client.post(BASE + 'events/', {'title_en': 'Open day', 'start_at': when(days=6)}, format='json')
        self.assertEqual(res2.data['slug'], 'open-day-2')
        res = self.client.patch(f'{BASE}events/{pk}/', {'location': 'Gym'}, format='json')
        self.assertEqual(res.data['location'], 'Gym')
        self.assertEqual(self.client.post(f'{BASE}events/{pk}/publish/').data['status'], 'published')
        self.assertEqual(self.client.post(f'{BASE}events/{pk}/unpublish/').data['status'], 'draft')
        self.assertEqual(self.client.delete(f'{BASE}events/{pk}/').status_code, 204)
        self.assertFalse(PublicEvent.objects.filter(pk=pk).exists())

    def test_sub_admin_follows_existing_public_site_rule(self):
        self.login(self.sub_a)
        res = self.client.post(BASE + 'events/', {'title_en': 'Sub event', 'start_at': when(days=2)}, format='json')
        self.assertEqual(res.status_code, 201)

    def test_validation(self):
        self.login(self.admin_a)
        bad = self.client.post(BASE + 'events/', {'start_at': when(days=1)}, format='json')
        self.assertEqual(bad.status_code, 400)
        bad = self.client.post(BASE + 'events/', {'title_en': 'x', 'start_at': when(days=2), 'end_at': when(days=1)},
                               format='json')
        self.assertIn('end_at', bad.data['errors'])
        bad = self.client.post(BASE + 'events/', {'title_en': 'x', 'start_at': when(days=2), 'status': 'published'},
                               format='json')
        # status is read-only: it is ignored, never honoured, and the event stays a draft
        self.assertEqual(bad.status_code, 201)
        self.assertEqual(bad.data['status'], 'draft')
        self.assertEqual(PublicEvent.objects.get(pk=bad.data['id']).status, 'draft')
        smuggle = self.client.post(BASE + 'events/', {'title_en': 'x', 'start_at': when(days=2), 'slug': 'hacked'}, format='json')
        self.assertEqual(smuggle.status_code, 201)
        self.assertNotEqual(smuggle.data['slug'], 'hacked')  # slug is server-generated, never client-set
        other = self.client.post(BASE + 'events/', {'title_en': 'x', 'start_at': when(days=2), 'school': 'SEB'},
                                 format='json')
        self.assertEqual(other.status_code, 403)  # cannot target another school
        res = self.client.post(BASE + 'events/', {'title_en': '<script>alert(1)</script>Fair', 'start_at': when(days=2)},
                               format='json')
        self.assertNotIn('<', res.data['title_en'])

    def test_tenant_isolation(self):
        ev_b = self.mk_event(self.b)
        al_b = self.mk_album(self.b)
        self.login(self.admin_a)
        self.assertEqual(self.client.get(BASE + 'events/').data['results'], [])
        self.assertEqual(self.client.get(f'{BASE}events/{ev_b.id}/').status_code, 404)
        self.assertEqual(self.client.patch(f'{BASE}events/{ev_b.id}/', {'location': 'x'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'{BASE}events/{ev_b.id}/').status_code, 404)
        self.assertEqual(self.client.post(f'{BASE}albums/{al_b.id}/publish/').status_code, 404)
        self.assertEqual(self.client.get(f'{BASE}albums/{al_b.id}/media/').status_code, 404)
        self.assertEqual(self.client.get(BASE + 'events/?school=SEB').status_code, 403)
        # cannot link another school's internal event
        foreign = SchoolEvent.objects.create(school=self.b, title='Internal B')
        res = self.client.post(BASE + 'events/', {'title_en': 'x', 'start_at': when(days=1), 'linked_event': str(foreign.id)},
                               format='json')
        self.assertEqual(res.status_code, 400)
        self.assertTrue(PublicEvent.objects.filter(pk=ev_b.pk).exists())

    def test_link_to_internal_event_does_not_notify_or_change_it(self):
        own = SchoolEvent.objects.create(school=self.a, title='Internal A')
        self.login(self.admin_a)
        res = self.client.post(BASE + 'events/', {'title_en': 'Linked', 'start_at': when(days=1), 'linked_event': str(own.id)},
                               format='json')
        self.assertEqual(res.status_code, 201)
        own.refresh_from_db()
        self.assertEqual(own.title, 'Internal A')

    def test_executive_oversight_requires_module_and_school(self):
        self.login(self.ceo)
        self.assertEqual(self.client.get(BASE + 'events/').status_code, 400)  # must name a school
        res = self.client.get(BASE + 'events/?school=SEA')
        self.assertEqual(res.status_code, 200)
        self.login(self.coo)
        self.assertEqual(self.client.get(BASE + 'events/?school=SEA').status_code, 403)

    def test_publish_requires_title(self):
        album = PublicAlbum.objects.create(school=self.a, title_en='', title_fr='')
        self.login(self.admin_a)
        res = self.client.post(f'{BASE}albums/{album.id}/publish/')
        self.assertEqual(res.status_code, 400)
        self.assertIn('title', res.data['errors'])


class AlbumAndMediaManagementTests(Base):
    def test_album_media_flow_reorder_cover_delete(self):
        self.login(self.admin_a)
        res = self.client.post(BASE + 'albums/', {'title_en': 'Labs', 'category': 'labs'}, format='json')
        self.assertEqual(res.status_code, 201)
        album_id = res.data['id']
        ids = []
        for i in range(3):
            res = self.client.post(f'{BASE}albums/{album_id}/media/', {
                'image': upload(f'a{i}.png'), 'caption_en': f'Cap {i}', 'alt_en': 'Alt'}, format='multipart')
            self.assertEqual(res.status_code, 201, res.content)
            ids.append(res.data['id'])
        album = PublicAlbum.objects.get(pk=album_id)
        self.assertEqual(str(album.cover_id), ids[0])  # first image becomes the cover
        rev = list(reversed(ids))
        self.assertEqual(self.client.post(f'{BASE}albums/{album_id}/media/reorder/', {'ids': rev}, format='json').status_code, 200)
        listed = [m['id'] for m in self.client.get(f'{BASE}albums/{album_id}/media/').data['results']]
        self.assertEqual(listed, rev)
        self.assertEqual(self.client.post(f'{BASE}albums/{album_id}/media/reorder/', {'ids': rev[:2]}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'{BASE}albums/{album_id}/cover/', {'media_id': ids[2]}, format='json').status_code, 200)
        media = PublicMedia.objects.get(pk=ids[2])
        path = media.image.path
        self.assertEqual(self.client.delete(f'{BASE}media/{ids[2]}/').status_code, 204)
        import os
        self.assertFalse(os.path.exists(path))  # file removed with the row
        album.refresh_from_db()
        self.assertIsNotNone(album.cover_id)  # falls back to another image
        # album reorder needs every album exactly once
        other = self.client.post(BASE + 'albums/', {'title_en': 'Sports'}, format='json').data['id']
        self.assertEqual(self.client.post(BASE + 'albums/reorder/', {'ids': [other, album_id]}, format='json').status_code, 200)
        self.assertEqual(self.client.post(BASE + 'albums/reorder/', {'ids': [other]}, format='json').status_code, 400)
        self.assertEqual(self.client.delete(f'{BASE}albums/{album_id}/').status_code, 204)
        self.assertEqual(PublicMedia.objects.filter(school=self.a).count(), 0)

    def test_cannot_upload_into_other_schools_album(self):
        al_b = self.mk_album(self.b)
        self.login(self.admin_a)
        res = self.client.post(f'{BASE}albums/{al_b.id}/media/', {'image': upload()}, format='multipart')
        self.assertEqual(res.status_code, 404)

    def test_event_cover_upload_and_remove(self):
        event = self.mk_event(publish=False)
        self.login(self.admin_a)
        res = self.client.post(f'{BASE}events/{event.id}/cover/', {'image': upload()}, format='multipart')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.data['cover_url'])
        res = self.client.delete(f'{BASE}events/{event.id}/cover/')
        self.assertIsNone(res.data['cover_url'])

    def test_upload_rejections_via_api(self):
        album = self.mk_album()
        self.login(self.admin_a)
        url = f'{BASE}albums/{album.id}/media/'
        for name, data, ctype in [
            ('evil.php', b'<?php echo 1;', 'application/x-php'),
            ('fake.png', b'not really a png at all', 'image/png'),
            ('anim.gif', png_bytes(fmt='GIF'), 'image/gif'),
            ('x.svg', b'<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'),
        ]:
            res = self.client.post(url, {'image': upload(name, data, ctype)}, format='multipart')
            self.assertEqual(res.status_code, 400, name)
        res = self.client.post(url, {}, format='multipart')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(PublicMedia.objects.count(), 0)

    def test_quota_enforced(self):
        album = self.mk_album()
        self.login(self.admin_a)
        original = services.IMAGE_QUOTA_PER_SCHOOL
        services.IMAGE_QUOTA_PER_SCHOOL = 2
        try:
            url = f'{BASE}albums/{album.id}/media/'
            self.assertEqual(self.client.post(url, {'image': upload()}, format='multipart').status_code, 201)
            self.assertEqual(self.client.post(url, {'image': upload()}, format='multipart').status_code, 201)
            res = self.client.post(url, {'image': upload()}, format='multipart')
            self.assertEqual(res.status_code, 400)
            self.assertIn('limit', res.data['detail'].lower())
            # another school is unaffected
            al_b = self.mk_album(self.b)
            self.login(self.admin_b)
            self.assertEqual(self.client.post(f'{BASE}albums/{al_b.id}/media/', {'image': upload()}, format='multipart').status_code, 201)
        finally:
            services.IMAGE_QUOTA_PER_SCHOOL = original


class ImageProcessingTests(SimpleTestCase):
    def test_exif_stripped_and_reencoded(self):
        raw = png_bytes(fmt='JPEG', exif=True)
        self.assertTrue(Image.open(io.BytesIO(raw)).getexif())  # sanity: the source has EXIF
        out = images.process_upload(upload('cam.jpg', raw, 'image/jpeg'))
        data = out.main.read()
        result = Image.open(io.BytesIO(data))
        self.assertEqual(result.format, 'JPEG')
        self.assertEqual(dict(result.getexif()), {})
        self.assertNotIn(b'SecretCamera', data)
        self.assertTrue(out.main.name.endswith('.jpg'))
        self.assertNotIn('cam', out.main.name)  # the uploader's filename is discarded

    def test_orientation_applied(self):
        img = Image.new('RGB', (60, 20), (10, 200, 10))
        e = Image.Exif()
        e[0x0112] = 6  # rotate 90 clockwise to display
        buf = io.BytesIO()
        img.save(buf, 'JPEG', exif=e.tobytes())
        out = images.process_upload(upload('r.jpg', buf.getvalue(), 'image/jpeg'))
        self.assertEqual((out.width, out.height), (20, 60))

    def test_downscale_and_thumbnail(self):
        out = images.process_upload(upload('big.png', png_bytes(size=(3000, 1500))))
        self.assertEqual(max(out.width, out.height), images.MAX_STORED_SIDE)
        thumb = Image.open(io.BytesIO(out.thumb.read()))
        self.assertEqual(thumb.format, 'WEBP')
        self.assertLessEqual(max(thumb.size), images.THUMB_SIDE)

    def test_rejects_wrong_type_size_dimensions(self):
        with self.assertRaises(images.ImageRejected):
            images.process_upload(upload('a.gif', png_bytes(fmt='GIF'), 'image/gif'))
        with self.assertRaises(images.ImageRejected):  # extension lies about content
            images.process_upload(upload('a.png', b'GIF89a-not-an-image', 'image/png'))
        with self.assertRaises(images.ImageRejected):  # content-type lies
            images.process_upload(upload('a.png', png_bytes(), 'text/html'))
        big = SimpleUploadedFile('big.png', b'0' * (images.MAX_UPLOAD_BYTES + 1), content_type='image/png')
        with self.assertRaises(images.ImageRejected):
            images.process_upload(big)
        with self.assertRaises(images.ImageRejected):  # too many pixels on a side
            images.process_upload(upload('wide.png', png_bytes(size=(images.MAX_SOURCE_SIDE + 1, 4))))

    def test_webp_accepted(self):
        out = images.process_upload(upload('w.webp', png_bytes(fmt='WEBP'), 'image/webp'))
        self.assertTrue(out.main.name.endswith('.webp'))


class ClassificationTests(SimpleTestCase):
    def test_douala_day_end_when_no_end_time(self):
        # 22:30 UTC on 1 June is 23:30 in Douala, so that local day ends at 22:59:59 UTC.
        start = datetime(2026, 6, 1, 22, 30, tzinfo=dt_tz.utc)
        end = timeutil.effective_end(start, None)
        self.assertEqual(end, datetime(2026, 6, 1, 22, 59, 59, tzinfo=dt_tz.utc))
        # 23:30 UTC on 1 June is 00:30 on 2 June in Douala.
        start2 = datetime(2026, 6, 1, 23, 30, tzinfo=dt_tz.utc)
        self.assertEqual(timeutil.effective_end(start2, None), datetime(2026, 6, 2, 22, 59, 59, tzinfo=dt_tz.utc))

    def test_classify(self):
        now = datetime(2026, 6, 1, 12, 0, tzinfo=dt_tz.utc)
        h = timedelta(hours=1)
        self.assertEqual(timeutil.classify(now + h, now + 2 * h, now), 'upcoming')
        self.assertEqual(timeutil.classify(now - h, now + h, now), 'ongoing')
        self.assertEqual(timeutil.classify(now - 2 * h, now - h, now), 'past')


class PublicEventsTests(Base):
    def test_buckets_ordering_and_counts(self):
        up1 = self.mk_event(title_en='Later', start_at=timezone.now() + timedelta(days=10))
        up2 = self.mk_event(title_en='Sooner', start_at=timezone.now() + timedelta(days=2))
        ongoing = self.mk_event(title_en='Fair', start_at=timezone.now() - timedelta(hours=1),
                                end_at=timezone.now() + timedelta(days=1))
        past_old = self.mk_event(title_en='Old', start_at=timezone.now() - timedelta(days=30),
                                 end_at=timezone.now() - timedelta(days=29))
        past_new = self.mk_event(title_en='Recent', start_at=timezone.now() - timedelta(days=5),
                                 end_at=timezone.now() - timedelta(days=4))
        url = f'{self.p}events/'
        up = self.client.get(url + '?when=upcoming').data
        self.assertEqual([e['slug'] for e in up['results']], [up2.slug, up1.slug])
        self.assertEqual([e['slug'] for e in self.client.get(url + '?when=ongoing').data['results']], [ongoing.slug])
        past = self.client.get(url + '?when=past').data
        self.assertEqual([e['slug'] for e in past['results']], [past_new.slug, past_old.slug])
        self.assertEqual(past['counts'], {'upcoming': 2, 'ongoing': 1, 'past': 2})
        self.assertEqual(self.client.get(url + '?when=all').data['count'], 5)
        self.assertEqual(up['results'][0]['bucket'], 'upcoming')

    def test_single_day_event_is_ongoing_until_local_midnight(self):
        # No end set, started this morning: still "ongoing" this evening, not past.
        now = timezone.now()
        local = now.astimezone(timeutil.DOUALA)
        start_local = local.replace(hour=0, minute=1, second=0, microsecond=0)
        if start_local >= now:  # edge: run just after local midnight
            self.skipTest('too close to local midnight')
        ev = self.mk_event(start_at=start_local)
        row = self.client.get(f'{self.p}events/?when=ongoing').data['results']
        self.assertEqual([e['slug'] for e in row], [ev.slug])

    def test_pagination(self):
        for i in range(5):
            self.mk_event(title_en=f'E{i}', start_at=timezone.now() + timedelta(days=i + 1))
        res = self.client.get(f'{self.p}events/?when=upcoming&page_size=2&page=3').data
        self.assertEqual((res['count'], res['num_pages'], len(res['results'])), (5, 3, 1))
        self.assertEqual(self.client.get(f'{self.p}events/?page=99').data['results'], [])

    def test_drafts_and_other_schools_hidden(self):
        self.mk_event(title_en='Draft one', publish=False)
        self.mk_event(self.b, title_en='Other school')
        res = self.client.get(f'{self.p}events/?when=all').data
        self.assertEqual(res['count'], 0)

    def test_detail_visibility(self):
        live = self.mk_event(title_en='Gala')
        draft = self.mk_event(title_en='Hidden gala', publish=False)
        other = self.mk_event(self.b, title_en='Elsewhere')
        self.assertEqual(self.client.get(f'{self.p}events/{live.slug}/').status_code, 200)
        self.assertEqual(self.client.get(f'{self.p}events/{draft.slug}/').status_code, 404)
        self.assertEqual(self.client.get(f'{self.p}events/{other.slug}/').status_code, 404)  # not via the wrong school
        self.assertEqual(self.client.get(f'{self.p}events/nope/').status_code, 404)

    def test_unpublished_site_returns_404(self):
        self.mk_event(self.draft_school, title_en='Whatever')
        self.mk_album(self.draft_school)
        slug = self.draft_school.public_slug
        self.assertEqual(self.client.get(f'{PUB}{slug}/events/').status_code, 404)
        self.assertEqual(self.client.get(f'{PUB}{slug}/gallery/').status_code, 404)
        # An unpublish after publication hides it again.
        profile = SchoolPublicProfile.objects.get(school=self.a)
        profile.publication_status = PublicationStatus.UNPUBLISHED
        profile.save()
        self.assertEqual(self.client.get(f'{self.p}events/').status_code, 404)

    def test_preview_token_shows_draft_site_but_only_published_items(self):
        profile = SchoolPublicProfile.objects.get(school=self.draft_school)
        profile.preview_token = 'tok-123'
        profile.save()
        self.mk_event(self.draft_school, title_en='Live item')
        self.mk_event(self.draft_school, title_en='Draft item', publish=False)
        slug = self.draft_school.public_slug
        res = self.client.get(f'{PUB}{slug}/events/?when=all&preview=tok-123')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res['Cache-Control'], 'no-store')
        self.assertEqual(self.client.get(f'{PUB}{slug}/events/?preview=wrong').status_code, 404)

    def test_language_fallback(self):
        self.mk_event(title_en='', title_fr='Fete du sport', description_fr='Texte')
        row = self.client.get(f'{self.p}events/?when=all&lang=en').data['results'][0]
        self.assertEqual(row['title'], 'Fete du sport')

    def test_no_private_fields_and_cache_headers(self):
        ev = self.mk_event(title_en='Public thing')
        res = self.client.get(f'{self.p}events/{ev.slug}/')
        self.assertIn('public', res['Cache-Control'])
        forbidden = {'id', 'school', 'created_by', 'status', 'linked_event', 'published_at', 'effective_end', 'created_at'}
        self.assertFalse(forbidden & set(res.data), forbidden & set(res.data))
        body = res.content.decode()
        self.assertNotIn('ADM-SEA', body)
        self.assertNotIn('sea@example.org', body)

    def test_public_endpoints_need_no_auth_and_use_public_throttle_scope(self):
        self.assertEqual(PublicEventListView.throttle_scope, 'public_site')
        self.assertEqual(PublicGalleryView.throttle_scope, 'public_site')
        self.assertIn('public_site', settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'{self.p}events/').status_code, 200)


class PublicGalleryTests(Base):
    def _fill(self, album, n):
        self.login(self.admin_a)
        for i in range(n):
            res = self.client.post(f'{BASE}albums/{album.id}/media/', {'image': upload(), 'caption_en': f'c{i}'},
                                   format='multipart')
            self.assertEqual(res.status_code, 201)
        self.client.force_authenticate(None)

    def test_only_published_albums_with_media(self):
        pub = self.mk_album(title_en='Sports field', category='sports')
        draft = self.mk_album(title_en='Secret', publish=False)
        other = self.mk_album(self.b, title_en='Other school')
        self._fill(pub, 3)
        self._fill(draft, 1)
        res = self.client.get(f'{self.p}gallery/').data
        self.assertEqual(res['count'], 1)
        self.assertEqual(res['results'][0]['media_count'], 3)
        self.assertEqual(len(res['results'][0]['media']), 3)
        self.assertEqual(res['category_counts'], {'sports': 1})
        self.assertEqual(self.client.get(f'{self.p}gallery/{draft.id}/').status_code, 404)
        self.assertEqual(self.client.get(f'{self.p}gallery/{other.id}/').status_code, 404)

    def test_category_filter_and_album_detail_pagination(self):
        sports = self.mk_album(title_en='Sports', category='sports')
        self.mk_album(title_en='Campus', category='campus')
        self._fill(sports, 5)
        res = self.client.get(f'{self.p}gallery/?category=sports').data
        self.assertEqual([a['category'] for a in res['results']], ['sports'])
        detail = self.client.get(f'{self.p}gallery/{sports.id}/?page_size=2&page=3').data
        self.assertEqual((detail['count'], detail['num_pages'], len(detail['results'])), (5, 3, 1))
        self.assertEqual(detail['album']['title'], 'Sports')

    def test_no_private_fields(self):
        album = self.mk_album()
        self._fill(album, 1)
        res = self.client.get(f'{self.p}gallery/')
        item = res.data['results'][0]['media'][0]
        self.assertEqual(set(item), {'id', 'url', 'thumb', 'width', 'height', 'caption', 'alt'})
        self.assertEqual(set(res.data['results'][0]) - {'media'},
                         {'id', 'title', 'title_en', 'title_fr', 'category', 'cover', 'media_count', 'updated_at'})
        self.assertIn('/school_site/SEA/', item['url'])
        self.assertNotIn('uploaded_by', res.content.decode())
        self.assertNotIn('private_media', res.content.decode())

    def test_stored_files_are_sanitised_names(self):
        album = self.mk_album()
        self.login(self.admin_a)
        res = self.client.post(f'{BASE}albums/{album.id}/media/',
                               {'image': upload('../../etc/passwd.png')}, format='multipart')
        self.assertEqual(res.status_code, 201)
        media = PublicMedia.objects.get()
        self.assertRegex(media.image.name, r'^school_site/SEA/[0-9a-f]{32}\.png$')
        self.assertRegex(media.thumbnail.name, r'^school_site/SEA/[0-9a-f]{32}_t\.webp$')


class ContentIndexTests(Base):
    def test_index_lists_only_published_items_of_published_sites(self):
        live = self.mk_event(title_en='Gala')
        self.mk_event(title_en='Draft', publish=False)
        self.mk_event(self.draft_school, title_en='Unpublished site')
        album = self.mk_album()
        self.login(self.admin_a)
        self.client.post(f'{BASE}albums/{album.id}/media/', {'image': upload()}, format='multipart')
        self.mk_album(title_en='Empty album')
        self.client.force_authenticate(None)
        res = self.client.get('/api/v1/schools/public-content/index/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual([(e['school'], e['slug']) for e in res.data['events']], [(self.a.public_slug, live.slug)])
        self.assertEqual([g['school'] for g in res.data['galleries']], [self.a.public_slug])
        self.assertEqual(set(res.data['events'][0]), {'school', 'slug', 'updated_at'})

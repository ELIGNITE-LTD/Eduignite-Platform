import io

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APITestCase

from apps.schools.models import PublicationStatus, PublicSiteAuditLog, School, SchoolPublicProfile, SchoolStatus

from .models import PostStatus, PublicLeader, SchoolPost
from .sanitize import sanitize_html

User = get_user_model()
MGMT = '/api/v1/schools/public-site/'
PUBLIC = '/api/v1/schools/public/'


def make_school(sid, published=True, **extra):
    fields = dict(
        id=sid, name=f'School {sid}', short_name=sid, principal='P. Head', location='Buea',
        email=f'{sid.lower()}@example.org', phone='237650000000', school_type='general',
        subsystem='anglophone', description='A fine school.', status=SchoolStatus.ACTIVE,
    )
    fields.update(extra)
    school = School.objects.create(**fields)
    SchoolPublicProfile.objects.update_or_create(
        school=school,
        defaults={'publication_status': PublicationStatus.PUBLISHED if published else PublicationStatus.DRAFT,
                  'preview_token': f'site-token-{sid}'})
    return school


def make_user(matricule, role, school=None, **extra):
    return User.objects.create_user(
        matricule=matricule, name=f'User {matricule}', email=f'{matricule.lower()}@example.org',
        role=role, school=school, password='password123', is_license_paid=True, **extra)


def png_bytes():
    from PIL import Image

    buffer = io.BytesIO()
    Image.new('RGB', (4, 4), (10, 20, 30)).save(buffer, 'PNG')
    return buffer.getvalue()


class SanitizerTests(SimpleTestCase):
    def test_script_iframe_and_handlers_are_removed(self):
        dirty = (
            '<p onclick="x()" style="color:red">Hi<script>alert(1)</script></p>'
            '<iframe src="https://evil.example"></iframe><object data="x"></object>'
            '<img src="x" onerror="alert(1)"><svg onload="alert(1)"></svg><style>p{}</style>'
        )
        clean = sanitize_html(dirty)
        for bad in ('<script', 'alert', 'iframe', 'onclick', 'onerror', 'onload', '<svg', '<style', 'style=', '<object'):
            self.assertNotIn(bad, clean)
        self.assertIn('<p>Hi', clean)

    def test_javascript_and_data_links_are_removed_and_https_links_get_rel(self):
        clean = sanitize_html(
            '<a href="javascript:alert(1)">a</a><a href="data:text/html,x">b</a><a href="//evil.example">c</a>'
            '<a href="http://insecure.example">d</a><a href=" JaVaScRiPt:alert(1)">e</a>'
            '<a href="https://ok.example/x" target="_blank" rel="opener" onclick="x">f</a>')
        self.assertNotIn('javascript', clean.lower())
        self.assertNotIn('data:', clean)
        self.assertNotIn('evil.example', clean)
        self.assertNotIn('insecure.example', clean)
        self.assertIn('<a href="https://ok.example/x" rel="noopener nofollow ugc">f</a>', clean)
        self.assertNotIn('target', clean)

    def test_images_only_from_the_schools_own_uploads(self):
        own = '/media/school_site/ABC/one.png'
        clean = sanitize_html(
            f'<img src="{own}" alt="ok" onerror="x"><img src="https://evil.example/t.png">'
            '<img src="javascript:alert(1)"><img src="data:image/png;base64,AAAA"><img src="/media/school_site/XYZ/two.png">',
            {own})
        self.assertEqual(clean, f'<img src="{own}" alt="ok">')

    def test_allowed_formatting_survives(self):
        html = '<h2>T</h2><p>a <strong>b</strong> <em>c</em><br></p><ul><li>x</li></ul><ol><li>y</li></ol><blockquote>q</blockquote>'
        self.assertEqual(sanitize_html(html), html.replace('<br>', '<br>'))

    def test_comments_and_odd_markup(self):
        clean = sanitize_html('<!-- c --><p>x</p><<script>script>alert(1)</script><form action="x"><input></form>')
        self.assertNotIn('<!--', clean)
        self.assertNotIn('<script', clean)
        self.assertNotIn('<form', clean)


class BlogBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = make_school('BLA')
        cls.b = make_school('BLB')
        cls.admin_a = make_user('ADM-BLA', 'SCHOOL_ADMIN', cls.a)
        cls.sub_a = make_user('SUB-BLA', 'SUB_ADMIN', cls.a)
        cls.admin_b = make_user('ADM-BLB', 'SCHOOL_ADMIN', cls.b)
        cls.teacher_a = make_user('TCH-BLA', 'TEACHER', cls.a)
        cls.coo = make_user('COO-BL', 'COO')
        cls.sa, cls.sb = cls.a.public_slug, cls.b.public_slug

    def setUp(self):
        cache.clear()

    def login(self, user):
        self.client.force_authenticate(user)

    def new_post(self, **extra):
        body = {'title_en': 'Open day', 'body_en': '<p>Welcome everyone.</p>'}
        body.update(extra)
        response = self.client.post(MGMT + 'blog/posts/', body, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data


class BlogManagementTests(BlogBase):
    def test_only_school_managers_can_use_it(self):
        self.assertIn(self.client.get(MGMT + 'blog/posts/').status_code, (401, 403))
        self.login(self.teacher_a)
        self.assertEqual(self.client.get(MGMT + 'blog/posts/').status_code, 403)
        self.assertEqual(self.client.post(MGMT + 'blog/posts/', {'title_en': 'x'}, format='json').status_code, 403)

    def test_create_sanitises_body_and_snapshots_author(self):
        self.login(self.admin_a)
        data = self.new_post(body_en='<p onclick="x">Hi</p><script>alert(1)</script>', title_en='<b>Big</b> news')
        self.assertEqual(data['body_en'], '<p>Hi</p>')
        self.assertEqual(data['title_en'], 'Big news')
        self.assertEqual(data['status'], 'draft')
        self.assertEqual(data['author_name'], 'User ADM-BLA')
        self.assertTrue(data['preview_token'])
        self.assertEqual(data['slug'], 'big-news')
        # Authors cannot be spoofed.
        spoof = self.client.post(MGMT + 'blog/posts/', {'title_en': 'S', 'author_name': 'The Pope'}, format='json')
        self.assertEqual(spoof.status_code, 400)

    def test_slug_unique_per_school_and_reusable_across_schools(self):
        self.login(self.admin_a)
        first = self.new_post()
        second = self.new_post()
        self.assertEqual((first['slug'], second['slug']), ('open-day', 'open-day-2'))
        clash = self.client.patch(MGMT + f"blog/posts/{second['id']}/", {'slug': 'open-day'}, format='json')
        self.assertEqual(clash.status_code, 400)
        self.login(self.admin_b)
        self.assertEqual(self.new_post()['slug'], 'open-day')

    def test_cross_school_isolation(self):
        self.login(self.admin_a)
        mine = self.new_post()
        self.login(self.admin_b)
        self.assertEqual(self.client.get(MGMT + 'blog/posts/').data['results'], [])
        for method, suffix in (('get', ''), ('patch', ''), ('delete', ''), ('post', 'publish/')):
            response = getattr(self.client, method)(MGMT + f"blog/posts/{mine['id']}/{suffix}", {}, format='json')
            self.assertEqual(response.status_code, 404, (method, suffix))
        self.assertEqual(self.client.get(MGMT + 'blog/posts/?school=BLA').status_code, 403)
        self.assertEqual(self.client.get(MGMT + 'blog/posts/not-a-uuid/').status_code, 404)

    def test_cannot_use_another_schools_category_or_image(self):
        self.login(self.admin_b)
        cat_b = self.client.post(MGMT + 'blog/categories/', {'name_en': 'Sports'}, format='json').data
        image_b = self.client.post(
            MGMT + 'blog/images/', {'file': SimpleUploadedFile('a.png', png_bytes(), 'image/png')}, format='multipart').data
        self.login(self.admin_a)
        post = self.new_post()
        for field, value in (('category', cat_b['id']), ('cover_image', image_b['id'])):
            response = self.client.patch(MGMT + f"blog/posts/{post['id']}/", {field: value}, format='json')
            self.assertEqual(response.status_code, 400, field)

    def test_sub_admin_and_executive_with_module(self):
        self.login(self.sub_a)
        self.new_post()
        self.login(self.coo)
        self.assertEqual(self.client.get(MGMT + 'blog/posts/?school=BLA').status_code, 403)
        self.coo.allowed_modules = ['school_websites']
        self.coo.save(update_fields=['allowed_modules'])
        self.assertEqual(self.client.get(MGMT + 'blog/posts/').status_code, 400)
        response = self.client.get(MGMT + 'blog/posts/?school=BLA')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 1)

    def test_workflow_draft_publish_unpublish_republish(self):
        self.login(self.admin_a)
        post = self.new_post()
        url = MGMT + f"blog/posts/{post['id']}/"
        self.assertEqual(self.client.post(url + 'unpublish/').status_code, 400)  # draft cannot be unpublished
        published = self.client.post(url + 'publish/')
        self.assertEqual(published.status_code, 200)
        self.assertEqual(published.data['status'], 'published')
        first_date = published.data['published_at']
        self.assertEqual(self.client.post(url + 'publish/').status_code, 400)  # already published
        self.assertEqual(self.client.post(url + 'unpublish/').data['status'], 'unpublished')
        again = self.client.post(url + 'publish/')
        self.assertEqual(again.data['published_at'], first_date)
        actions = list(PublicSiteAuditLog.objects.filter(school=self.a).order_by('created_at')
                       .values_list('action', flat=True))
        self.assertEqual(actions, ['blog_post_created', 'blog_post_published', 'blog_post_unpublished',
                                   'blog_post_published'])

    def test_cannot_publish_without_body_or_title(self):
        self.login(self.admin_a)
        post = self.new_post(body_en='<script>x</script>')
        response = self.client.post(MGMT + f"blog/posts/{post['id']}/publish/")
        self.assertEqual(response.status_code, 400)
        self.assertIn('body', response.data['errors'])

    def test_delete(self):
        self.login(self.admin_a)
        post = self.new_post()
        self.assertEqual(self.client.delete(MGMT + f"blog/posts/{post['id']}/").status_code, 204)
        self.assertFalse(SchoolPost.objects.filter(school=self.a).exists())

    def test_image_upload_validates_type_and_size(self):
        self.login(self.admin_a)
        bad = self.client.post(MGMT + 'blog/images/', {'file': SimpleUploadedFile('a.png', b'<script>', 'image/png')},
                               format='multipart')
        self.assertEqual(bad.status_code, 400)
        svg = self.client.post(MGMT + 'blog/images/', {'file': SimpleUploadedFile(
            'a.svg', b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml')},
            format='multipart')
        self.assertEqual(svg.status_code, 400)
        ok = self.client.post(MGMT + 'blog/images/', {'file': SimpleUploadedFile('evil.php', png_bytes(), 'image/png')},
                              format='multipart')
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertTrue(ok.data['url'].endswith('.png'))
        self.assertIn('school_site/BLA/', ok.data['url'])

    def test_embedded_image_must_be_the_schools_own(self):
        self.login(self.admin_a)
        upload = self.client.post(MGMT + 'blog/images/', {'file': SimpleUploadedFile('a.png', png_bytes(), 'image/png')},
                                  format='multipart').data
        body = (f'<p>x</p><img src="{upload["url"]}" alt="mine"><img src="https://evil.example/t.png">'
                f'<img src="/media/school_site/BLB/other.png">')
        data = self.new_post(body_en=body)
        self.assertIn(upload['url'], data['body_en'])
        self.assertNotIn('evil.example', data['body_en'])
        self.assertNotIn('BLB', data['body_en'])

    def test_categories_crud_and_isolation(self):
        self.login(self.admin_a)
        cat = self.client.post(MGMT + 'blog/categories/', {'name_en': 'News', 'name_fr': 'Actualités'}, format='json')
        self.assertEqual(cat.status_code, 201)
        self.assertEqual(cat.data['slug'], 'news')
        self.assertEqual(self.client.patch(MGMT + f"blog/categories/{cat.data['id']}/", {'name_en': 'Updates'},
                                           format='json').data['name_en'], 'Updates')
        self.assertEqual(self.client.post(MGMT + 'blog/categories/', {}, format='json').status_code, 400)
        self.login(self.admin_b)
        self.assertEqual(self.client.delete(MGMT + f"blog/categories/{cat.data['id']}/").status_code, 404)
        self.assertEqual(self.client.get(MGMT + 'blog/categories/').data['results'], [])
        self.login(self.admin_a)
        post = self.new_post(category=cat.data['id'])
        self.assertEqual(self.client.delete(MGMT + f"blog/categories/{cat.data['id']}/").status_code, 204)
        self.assertIsNone(self.client.get(MGMT + f"blog/posts/{post['id']}/").data['category'])


class PublicBlogTests(BlogBase):
    def publish(self, user, **extra):
        self.login(user)
        post = self.new_post(**extra)
        self.client.post(MGMT + f"blog/posts/{post['id']}/publish/")
        self.client.force_authenticate(None)
        return post

    def test_only_published_posts_of_published_sites(self):
        live = self.publish(self.admin_a)
        self.login(self.admin_a)
        draft = self.new_post(title_en='Secret draft')
        self.client.force_authenticate(None)
        listing = self.client.get(PUBLIC + f'{self.sa}/blog/').data
        self.assertEqual([p['slug'] for p in listing['results']], [live['slug']])
        self.assertEqual(self.client.get(PUBLIC + f"{self.sa}/blog/{draft['slug']}/").status_code, 404)
        self.assertEqual(self.client.get(PUBLIC + f"{self.sa}/blog/{live['slug']}/").status_code, 200)
        # Unpublished post disappears.
        self.login(self.admin_a)
        self.client.post(MGMT + f"blog/posts/{live['id']}/unpublish/")
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(PUBLIC + f"{self.sa}/blog/{live['slug']}/").status_code, 404)
        self.assertEqual(self.client.get(PUBLIC + f'{self.sa}/blog/').data['results'], [])

    def test_unpublished_site_hides_even_published_posts(self):
        post = self.publish(self.admin_a)
        SchoolPublicProfile.objects.filter(school=self.a).update(publication_status=PublicationStatus.UNPUBLISHED)
        self.assertEqual(self.client.get(PUBLIC + f'{self.sa}/blog/').status_code, 404)
        self.assertEqual(self.client.get(PUBLIC + f"{self.sa}/blog/{post['slug']}/").status_code, 404)
        self.assertEqual(self.client.get(PUBLIC + 'blog-index/').data, [])

    def test_posts_never_leak_between_schools(self):
        post = self.publish(self.admin_a)
        self.assertEqual(self.client.get(PUBLIC + f"{self.sb}/blog/{post['slug']}/").status_code, 404)
        self.assertEqual(self.client.get(PUBLIC + f'{self.sb}/blog/').data['results'], [])

    def test_draft_preview_needs_the_posts_own_token(self):
        self.login(self.admin_a)
        draft = self.new_post()
        other = self.new_post(title_en='Other')
        self.client.force_authenticate(None)
        url = PUBLIC + f"{self.sa}/blog/{draft['slug']}/"
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(url + '?preview=wrong').status_code, 404)
        self.assertEqual(self.client.get(url + f"?preview={other['preview_token']}").status_code, 404)
        response = self.client.get(url + f"?preview={draft['preview_token']}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_preview'])
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertIn('noindex', response['X-Robots-Tag'])
        # A token for school A never opens school B's address.
        self.assertEqual(self.client.get(PUBLIC + f"{self.sb}/blog/{draft['slug']}/?preview={draft['preview_token']}").status_code, 404)
        # Rotating invalidates the old link.
        self.login(self.admin_a)
        self.client.post(MGMT + f"blog/posts/{draft['id']}/preview-token/rotate/")
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url + f"?preview={draft['preview_token']}").status_code, 404)

    def test_published_response_has_cache_headers_and_is_sanitised_on_read(self):
        post = self.publish(self.admin_a)
        # Tampered straight in the database: still clean when served.
        SchoolPost.objects.filter(pk=post['id']).update(
            body_en='<p>Hello</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="x" onerror="y">')
        response = self.client.get(PUBLIC + f"{self.sa}/blog/{post['slug']}/")
        self.assertIn('max-age', response['Cache-Control'])
        body = response.data['body']
        for bad in ('script', 'javascript', 'onerror', '<img'):
            self.assertNotIn(bad, body)
        self.assertIn('<p>Hello</p>', body)

    def test_list_pagination_category_filter_reading_time_and_neighbours(self):
        self.login(self.admin_a)
        cat = self.client.post(MGMT + 'blog/categories/', {'name_en': 'Sports', 'name_fr': 'Sport'}, format='json').data
        slugs = []
        for i in range(5):
            words = ' '.join(['word'] * (450 if i == 0 else 10))
            post = self.new_post(title_en=f'Post {i}', body_en=f'<p>{words}</p>', category=cat['id'] if i < 3 else None)
            self.client.post(MGMT + f"blog/posts/{post['id']}/publish/")
            slugs.append(post['slug'])
        self.client.force_authenticate(None)
        page1 = self.client.get(PUBLIC + f'{self.sa}/blog/?page_size=2').data
        self.assertEqual((page1['count'], page1['total_pages'], len(page1['results'])), (5, 3, 2))
        self.assertEqual(page1['results'][0]['slug'], 'post-4')  # newest first
        page3 = self.client.get(PUBLIC + f'{self.sa}/blog/?page_size=2&page=3').data
        self.assertEqual([p['slug'] for p in page3['results']], ['post-0'])
        self.assertEqual(self.client.get(PUBLIC + f'{self.sa}/blog/?page_size=2&page=99').data['page'], 3)
        filtered = self.client.get(PUBLIC + f'{self.sa}/blog/?category=sports').data
        self.assertEqual(filtered['count'], 3)
        self.assertEqual(filtered['categories'], [{'slug': 'sports', 'name': 'Sports', 'count': 3}])
        self.assertEqual(self.client.get(PUBLIC + f'{self.sa}/blog/?category=sports&lang=fr').data['categories'][0]['name'], 'Sport')
        oldest = self.client.get(PUBLIC + f'{self.sa}/blog/post-0/').data
        self.assertEqual(oldest['reading_time'], 3)  # 450 words at 200 wpm
        self.assertIsNone(oldest['previous'])
        self.assertEqual(oldest['next']['slug'], 'post-1')
        middle = self.client.get(PUBLIC + f'{self.sa}/blog/post-2/').data
        self.assertEqual((middle['previous']['slug'], middle['next']['slug']), ('post-1', 'post-3'))

    def test_language_fallback_and_index(self):
        post = self.publish(self.admin_a, title_fr='Journée portes ouvertes', body_fr='<p>Bienvenue</p>')
        en = self.client.get(PUBLIC + f"{self.sa}/blog/{post['slug']}/?lang=en").data
        fr = self.client.get(PUBLIC + f"{self.sa}/blog/{post['slug']}/?lang=fr").data
        self.assertEqual((en['title'], fr['title']), ('Open day', 'Journée portes ouvertes'))
        self.assertEqual(fr['body'], '<p>Bienvenue</p>')
        self.assertEqual(fr['languages'], ['en', 'fr'])
        index = self.client.get(PUBLIC + 'blog-index/').data
        self.assertEqual([(r['school'], r['slug']) for r in index], [(self.sa, 'open-day')])


class LeadershipTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = make_school('LDA')
        cls.b = make_school('LDB')
        cls.admin_a = make_user('ADM-LDA', 'SCHOOL_ADMIN', cls.a, avatar='data:image/png;base64,AAAA')
        cls.teacher_a = make_user('TCH-LDA', 'TEACHER', cls.a, public_title='Math Teacher')
        cls.student_a = make_user('STU-LDA', 'STUDENT', cls.a)
        cls.parent_a = make_user('PAR-LDA', 'PARENT', cls.a)
        cls.admin_b = make_user('ADM-LDB', 'SCHOOL_ADMIN', cls.b, avatar='data:image/png;base64,BBBB')
        cls.teacher_b = make_user('TCH-LDB', 'TEACHER', cls.b)
        cls.ceo = make_user('CEO-LD', 'CEO')
        cls.sa = cls.a.public_slug

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.admin_a)

    def add(self, user, **extra):
        body = {'user': str(user.pk), **extra}
        return self.client.post(MGMT + 'leadership/', body, format='json')

    def test_candidates_are_only_the_schools_own_staff(self):
        rows = self.client.get(MGMT + 'leadership/candidates/').data['results']
        names = {r['name'] for r in rows}
        self.assertEqual(names, {'User ADM-LDA', 'User TCH-LDA'})
        admin = next(r for r in rows if r['name'] == 'User ADM-LDA')
        self.assertTrue(admin['has_photo'])
        self.assertEqual(admin['suggested_role_category'], 'principal')
        self.assertTrue(admin['role_label'])
        for forbidden in ('email', 'phone', 'avatar'):
            self.assertNotIn(forbidden, admin)

    def test_cannot_add_another_schools_staff_students_or_duplicates(self):
        self.assertEqual(self.add(self.teacher_b).status_code, 400)
        self.assertEqual(self.add(self.student_a).status_code, 400)
        self.assertEqual(self.add(self.parent_a).status_code, 400)
        self.assertEqual(self.add(self.teacher_a).status_code, 201)
        self.assertEqual(self.add(self.teacher_a).status_code, 400)
        self.assertEqual(PublicLeader.objects.count(), 1)
        self.assertEqual(User.objects.filter(school=self.a).count(), 4)  # no staff record duplicated

    def test_isolation_of_management(self):
        mine = self.add(self.admin_a).data
        self.client.force_authenticate(self.admin_b)
        self.assertEqual(self.client.get(MGMT + 'leadership/').data['results'], [])
        for method in ('patch', 'delete'):
            self.assertEqual(getattr(self.client, method)(MGMT + f"leadership/{mine['id']}/", {}, format='json').status_code, 404)
        self.assertEqual(self.client.post(MGMT + 'leadership/reorder/', {'ids': [mine['id']]}, format='json').status_code, 400)
        self.client.force_authenticate(self.teacher_a)
        self.assertEqual(self.client.get(MGMT + 'leadership/').status_code, 403)

    def test_edit_reorder_hide_remove(self):
        one = self.add(self.admin_a, role_category='principal', public_title_en='Principal', public_title_fr='Directeur').data
        two = self.add(self.teacher_a, role_category='head_of_studies').data
        self.assertEqual((one['order'], two['order']), (0, 1))
        reordered = self.client.post(MGMT + 'leadership/reorder/', {'ids': [two['id'], one['id']]}, format='json')
        self.assertEqual([r['name'] for r in reordered.data['results']], ['User TCH-LDA', 'User ADM-LDA'])
        self.assertEqual(self.client.post(MGMT + 'leadership/reorder/', {'ids': [one['id']]}, format='json').status_code, 400)
        bad = self.client.patch(MGMT + f"leadership/{one['id']}/", {'role_category': 'king'}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.client.patch(MGMT + f"leadership/{one['id']}/", {'user': str(self.teacher_a.pk)},
                                           format='json').status_code, 400)
        hidden = self.client.patch(MGMT + f"leadership/{two['id']}/", {'is_visible': False}, format='json')
        self.assertFalse(hidden.data['is_visible'])
        self.assertEqual(self.client.delete(MGMT + f"leadership/{two['id']}/").status_code, 204)

    def test_public_endpoint_privacy(self):
        self.add(self.admin_a, role_category='principal', public_title_en='Principal', public_title_fr='Directeur',
                 bio_en='Leads the school.', show_photo=True)
        self.add(self.teacher_a, show_photo=False)  # has no avatar anyway
        self.admin_a.email = 'secret.principal@example.org'
        self.admin_a.phone = '+237699999999'
        self.admin_a.save()
        self.client.force_authenticate(None)
        response = self.client.get(PUBLIC + f'{self.sa}/leadership/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('max-age', response['Cache-Control'])
        leaders = response.data['leaders']
        self.assertEqual([l['name'] for l in leaders], ['User ADM-LDA', 'User TCH-LDA'])
        self.assertEqual(set(leaders[0]), {'name', 'title', 'role_category', 'photo', 'bio', 'order'})
        self.assertEqual(leaders[0]['photo'], 'data:image/png;base64,AAAA')
        self.assertEqual(leaders[0]['title'], 'Principal')
        self.assertEqual(leaders[1]['title'], 'Math Teacher')  # reconciled with the staff-directory title
        raw = response.content.decode()
        for secret in ('secret.principal', '699999999', 'matricule', 'adm-lda@example.org'):
            self.assertNotIn(secret, raw)
        self.assertEqual(self.client.get(PUBLIC + f'{self.sa}/leadership/?lang=fr').data['leaders'][0]['title'], 'Directeur')

    def test_photo_requires_both_avatar_and_switch(self):
        leader = self.add(self.admin_a, show_photo=False).data
        self.client.force_authenticate(None)
        self.assertIsNone(self.client.get(PUBLIC + f'{self.sa}/leadership/').data['leaders'][0]['photo'])
        self.client.force_authenticate(self.admin_a)
        self.client.patch(MGMT + f"leadership/{leader['id']}/", {'show_photo': True}, format='json')
        self.admin_a.avatar = None
        self.admin_a.save()
        self.client.force_authenticate(None)
        self.assertIsNone(self.client.get(PUBLIC + f'{self.sa}/leadership/').data['leaders'][0]['photo'])

    def test_hidden_inactive_and_unpublished_are_not_public(self):
        a = self.add(self.admin_a).data
        self.add(self.teacher_a)
        self.client.patch(MGMT + f"leadership/{a['id']}/", {'is_visible': False}, format='json')
        self.client.force_authenticate(None)
        self.assertEqual([l['name'] for l in self.client.get(PUBLIC + f'{self.sa}/leadership/').data['leaders']], ['User TCH-LDA'])
        self.teacher_a.is_active = False
        self.teacher_a.save()
        self.assertEqual(self.client.get(PUBLIC + f'{self.sa}/leadership/').data['leaders'], [])
        SchoolPublicProfile.objects.filter(school=self.a).update(publication_status=PublicationStatus.DRAFT)
        self.assertEqual(self.client.get(PUBLIC + f'{self.sa}/leadership/').status_code, 404)

    def test_executive_acts_for_a_school_only_with_module(self):
        self.client.force_authenticate(self.ceo)
        self.assertEqual(self.client.get(MGMT + 'leadership/').status_code, 400)
        self.assertEqual(self.client.post(MGMT + 'leadership/', {'school': 'LDA', 'user': str(self.admin_a.pk)},
                                          format='json').status_code, 201)
        # ...but still cannot add staff of a different school to that school.
        self.assertEqual(self.client.post(MGMT + 'leadership/', {'school': 'LDA', 'user': str(self.teacher_b.pk)},
                                          format='json').status_code, 400)


class MigrationStateTests(TestCase):
    def test_makemigrations_check_is_clean(self):
        call_command('makemigrations', 'school_site_content', '--check', '--dry-run')

"""Tests for EduIgnite Academy (Phase 1 MVP).

Follows the same conventions used elsewhere in this backend (see
``apps/offline_licensing/tests/test_offline_licensing.py``): plain
``django.test.TestCase`` + DRF's ``APIClient`` with ``force_authenticate``,
no factory_boy fixtures.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.academy.models import (
    AcademyPermission,
    Certificate,
    Course,
    CourseEnrollment,
    DeepLinkCache,
    Lesson,
    Module,
    Quiz,
    QuizQuestion,
)

User = get_user_model()


def _make_user(matricule, role, name=None, email=None):
    return User.objects.create_user(
        matricule=matricule,
        name=name or matricule,
        email=email or f'{matricule.lower()}@example.com',
        role=role,
        password='pass12345',
    )


def _grant(user, scope, granted_by=None):
    return AcademyPermission.objects.create(user=user, scope=scope, granted_by=granted_by)


class CourseCreationPermissionTests(TestCase):
    """A Course Creator may only build courses formally assigned by a
    COURSE_ASSIGN holder — never self-assigned."""

    def setUp(self):
        self.ceo = _make_user('EDU-CEO-0001', 'CEO')
        _grant(self.ceo, AcademyPermission.Scope.COURSE_ASSIGN)
        _grant(self.ceo, AcademyPermission.Scope.COURSE_APPROVE)

        self.creator = _make_user('EDU-CREATOR-0001', 'TEACHER')
        self.client = APIClient()

    def _payload(self, **overrides):
        payload = {
            'title': 'EduIgnite for Teachers',
            'description': 'Learn to record attendance and grades.',
            'role_pathway': 'TEACHER',
        }
        payload.update(overrides)
        return payload

    def test_creator_without_course_create_scope_cannot_create(self):
        self.client.force_authenticate(self.creator)

        response = self.client.post(
            '/api/v1/academy/courses/', self._payload(assigned_by=str(self.ceo.id)), format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Course.objects.count(), 0)

    def test_creator_with_scope_but_no_valid_assignment_cannot_create(self):
        _grant(self.creator, AcademyPermission.Scope.COURSE_CREATE)
        self.client.force_authenticate(self.creator)

        # No assigned_by at all.
        response = self.client.post('/api/v1/academy/courses/', self._payload(), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Course.objects.count(), 0)

        # Self-assignment: creator does not hold COURSE_ASSIGN.
        response = self.client.post(
            '/api/v1/academy/courses/', self._payload(assigned_by=str(self.creator.id)), format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Course.objects.count(), 0)

    def test_creator_with_valid_ceo_assignment_can_create(self):
        _grant(self.creator, AcademyPermission.Scope.COURSE_CREATE)
        self.client.force_authenticate(self.creator)

        response = self.client.post(
            '/api/v1/academy/courses/', self._payload(assigned_by=str(self.ceo.id)), format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Course.objects.count(), 1)
        course = Course.objects.get()
        self.assertEqual(course.status, Course.Status.DRAFT)
        self.assertEqual(course.assigned_by_id, self.ceo.id)
        self.assertEqual(course.created_by_id, self.creator.id)


class CoursePublishGatingTests(TestCase):
    """A course can only ever reach PUBLISHED via the dedicated approve
    action, gated by COURSE_APPROVE — never a generic update."""

    def setUp(self):
        self.ceo = _make_user('EDU-CEO-0002', 'CEO')
        _grant(self.ceo, AcademyPermission.Scope.COURSE_ASSIGN)
        _grant(self.ceo, AcademyPermission.Scope.COURSE_APPROVE)

        self.creator = _make_user('EDU-CREATOR-0002', 'TEACHER')
        _grant(self.creator, AcademyPermission.Scope.COURSE_CREATE)

        self.course = Course.objects.create(
            title='EduIgnite for Librarians',
            slug='eduignite-for-librarians',
            role_pathway=Course.RolePathway.LIBRARIAN,
            status=Course.Status.PENDING_REVIEW,
            created_by=self.creator,
            assigned_by=self.ceo,
        )
        self.client = APIClient()

    def test_generic_update_cannot_change_status(self):
        self.client.force_authenticate(self.creator)

        response = self.client.patch(
            f'/api/v1/academy/courses/{self.course.slug}/',
            {'status': 'PUBLISHED', 'title': 'EduIgnite for Librarians (v2)'},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.course.refresh_from_db()
        self.assertEqual(self.course.status, Course.Status.PENDING_REVIEW)
        self.assertEqual(self.course.title, 'EduIgnite for Librarians (v2)')

    def test_approve_requires_course_approve_scope(self):
        self.client.force_authenticate(self.creator)

        response = self.client.post(f'/api/v1/academy/courses/{self.course.slug}/approve/')

        self.assertEqual(response.status_code, 403)
        self.course.refresh_from_db()
        self.assertEqual(self.course.status, Course.Status.PENDING_REVIEW)

    def test_approve_by_course_approve_holder_publishes(self):
        self.client.force_authenticate(self.ceo)

        response = self.client.post(f'/api/v1/academy/courses/{self.course.slug}/approve/')

        self.assertEqual(response.status_code, 200, response.data)
        self.course.refresh_from_db()
        self.assertEqual(self.course.status, Course.Status.PUBLISHED)
        self.assertEqual(self.course.approved_by_id, self.ceo.id)
        self.assertIsNotNone(self.course.approved_at)


class CoursePlayerAccessTests(TestCase):
    def setUp(self):
        creator = _make_user('EDU-CREATOR-0003', 'TEACHER')
        self.course = Course.objects.create(
            title='EduIgnite for Accountants',
            slug='eduignite-for-accountants',
            role_pathway=Course.RolePathway.ACCOUNTANT,
            status=Course.Status.PUBLISHED,
            created_by=creator,
        )
        self.learner = _make_user('EDU-LEARNER-0001', 'ACADEMY_LEARNER')
        self.client = APIClient()

    def test_unenrolled_user_gets_403_from_player(self):
        self.client.force_authenticate(self.learner)

        response = self.client.get(f'/api/v1/academy/courses/{self.course.slug}/player/')

        self.assertEqual(response.status_code, 403)
        self.assertIn('enroll', response.data['detail'].lower())


class CertificateIssuanceTests(TestCase):
    def setUp(self):
        creator = _make_user('EDU-CREATOR-0004', 'TEACHER')
        self.course = Course.objects.create(
            title='EduIgnite for Principals',
            slug='eduignite-for-principals',
            role_pathway=Course.RolePathway.PRINCIPAL,
            status=Course.Status.PUBLISHED,
            created_by=creator,
        )
        module = Module.objects.create(course=self.course, title='Getting Started', order=0)
        self.lesson_1 = Lesson.objects.create(module=module, title='School Setup', order=0, duration_minutes=5)
        self.lesson_2 = Lesson.objects.create(module=module, title='Class Assignments', order=1, duration_minutes=6)

        self.learner = _make_user('EDU-LEARNER-0002', 'ACADEMY_LEARNER')
        CourseEnrollment.objects.create(user=self.learner, course=self.course, source=CourseEnrollment.Source.DIRECT)

        self.client = APIClient()
        self.client.force_authenticate(self.learner)

    def test_completing_all_lessons_issues_exactly_one_completion_certificate(self):
        r1 = self.client.post(f'/api/v1/academy/lessons/{self.lesson_1.id}/complete/')
        self.assertEqual(r1.status_code, 200, r1.data)
        self.assertEqual(Certificate.objects.filter(tier=Certificate.Tier.COMPLETION).count(), 0)

        r2 = self.client.post(f'/api/v1/academy/lessons/{self.lesson_2.id}/complete/')
        self.assertEqual(r2.status_code, 200, r2.data)
        self.assertEqual(Certificate.objects.filter(tier=Certificate.Tier.COMPLETION).count(), 1)

        # Completing the last lesson again must not issue a second certificate.
        r3 = self.client.post(f'/api/v1/academy/lessons/{self.lesson_2.id}/complete/')
        self.assertEqual(r3.status_code, 200, r3.data)
        self.assertEqual(Certificate.objects.filter(tier=Certificate.Tier.COMPLETION).count(), 1)

        certificate = Certificate.objects.get(tier=Certificate.Tier.COMPLETION)
        self.assertEqual(certificate.user_id, self.learner.id)
        self.assertEqual(certificate.course_id, self.course.id)
        self.assertTrue(certificate.verification_id.startswith(f'EDU-{timezone.now().year}-'))


class CertificateVerifyTests(TestCase):
    def setUp(self):
        creator = _make_user('EDU-CREATOR-0005', 'TEACHER')
        self.course = Course.objects.create(
            title='EduIgnite for Librarians',
            slug='eduignite-for-librarians-verify',
            role_pathway=Course.RolePathway.LIBRARIAN,
            status=Course.Status.PUBLISHED,
            created_by=creator,
        )
        self.learner = _make_user('EDU-LEARNER-0003', 'ACADEMY_LEARNER', name='Ada Learner')
        self.certificate = Certificate.objects.create(
            user=self.learner, course=self.course, tier=Certificate.Tier.COMPLETION,
        )
        self.client = APIClient()

    def test_verify_returns_404_for_unknown_id(self):
        response = self.client.get('/api/v1/academy/verify/EDU-2026-999999/')
        self.assertEqual(response.status_code, 404)

    def test_verify_returns_200_with_correct_data_for_real_certificate(self):
        response = self.client.get(f'/api/v1/academy/verify/{self.certificate.verification_id}/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['verification_id'], self.certificate.verification_id)
        self.assertEqual(response.data['learner_name'], 'Ada Learner')
        self.assertEqual(response.data['course_title'], self.course.title)
        self.assertEqual(response.data['tier'], Certificate.Tier.COMPLETION)


class DeepLinkCacheTests(TestCase):
    def setUp(self):
        self.learner = _make_user('EDU-LEARNER-0004', 'ACADEMY_LEARNER')
        self.client = APIClient()

    def test_deep_link_round_trip_through_sso_continue(self):
        create_response = self.client.post(
            '/api/v1/academy/deep-link/',
            {'returnPath': '/academy/courses/eduignite-for-teachers'},
            format='json',
        )
        self.assertEqual(create_response.status_code, 201, create_response.data)
        state = create_response.data['state']
        self.assertTrue(state)

        self.client.force_authenticate(self.learner)
        continue_response = self.client.post(f'/api/v1/academy/sso/continue/?state={state}')

        self.assertEqual(continue_response.status_code, 200, continue_response.data)
        self.assertEqual(continue_response.data['return_path'], '/academy/courses/eduignite-for-teachers')

    def test_expired_deep_link_cache_is_not_returned(self):
        cache = DeepLinkCache.objects.create(
            state='expired-state-token', return_path='/academy/courses/expired-course',
        )
        # Force it to look 31 minutes old (auto_now_add can't be overridden at create()).
        DeepLinkCache.objects.filter(pk=cache.pk).update(
            created_at=timezone.now() - timedelta(minutes=31),
        )

        self.client.force_authenticate(self.learner)
        response = self.client.post(f'/api/v1/academy/sso/continue/?state={cache.state}')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotEqual(response.data['return_path'], '/academy/courses/expired-course')
        self.assertEqual(response.data['return_path'], '/academy')


class DeepLinkOpenRedirectTests(TestCase):
    """Regression tests for a security review finding: returnPath was never
    validated, letting an anonymous caller cache an external URL and hand a
    victim a same-domain /academy/start?state=... link that redirects them
    off-site immediately after a real login."""

    def setUp(self):
        self.client = APIClient()

    def test_external_url_return_path_is_rejected(self):
        for bad in [
            'https://evil.example/phish',
            'http://evil.example',
            '//evil.example/phish',
        ]:
            response = self.client.post('/api/v1/academy/deep-link/', {'returnPath': bad}, format='json')
            self.assertEqual(response.status_code, 400, f'{bad!r} should have been rejected: {response.data}')
            self.assertEqual(DeepLinkCache.objects.filter(return_path=bad).count(), 0)

    def test_internal_path_return_path_is_accepted(self):
        response = self.client.post(
            '/api/v1/academy/deep-link/', {'returnPath': '/academy/courses/eduignite-for-teachers'}, format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)


class QuizEnrollmentGateTests(TestCase):
    """Regression test for a security review finding: quiz_id is a small
    sequential int and QuizAttemptView had no enrollment check, letting any
    authenticated user enumerate and take quizzes -- including for
    unpublished/non-enrolled courses -- without ever enrolling."""

    def setUp(self):
        self.creator = _make_user('EDU-CREATOR-0002', 'TEACHER')
        self.course = Course.objects.create(
            title='EduIgnite for Librarians', slug='eduignite-for-librarians',
            role_pathway=Course.RolePathway.LIBRARIAN, status=Course.Status.PUBLISHED,
            created_by=self.creator,
        )
        module = Module.objects.create(course=self.course, title='Module 1', order=1)
        lesson = Lesson.objects.create(module=module, title='Lesson 1', order=1, duration_minutes=5)
        self.quiz = Quiz.objects.create(lesson=lesson, kind=Quiz.Kind.MODULE_QUIZ)
        QuizQuestion.objects.create(quiz=self.quiz, text='2+2?', choices=['3', '4'], correct_index=1)

        self.outsider = _make_user('EDU-LEARNER-0005', 'ACADEMY_LEARNER')
        self.client = APIClient()
        self.client.force_authenticate(self.outsider)

    def test_unenrolled_user_cannot_view_quiz_questions(self):
        response = self.client.get(f'/api/v1/academy/quizzes/{self.quiz.id}/attempt/')
        self.assertEqual(response.status_code, 403)

    def test_unenrolled_user_cannot_submit_quiz_attempt(self):
        response = self.client.post(
            f'/api/v1/academy/quizzes/{self.quiz.id}/attempt/',
            {'answers': [{'question_id': 1, 'selected_index': 1}]}, format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_enrolled_user_can_take_the_quiz(self):
        CourseEnrollment.objects.create(user=self.outsider, course=self.course, source='direct')
        response = self.client.get(f'/api/v1/academy/quizzes/{self.quiz.id}/attempt/')
        self.assertEqual(response.status_code, 200, response.data)


class CourseFeaturedGateTests(TestCase):
    """Regression test for a security review finding: is_featured (the CMS
    "Course Spotlight" toggle) was a plain writable field on the generic
    course-update path, reachable by ownership alone -- a Course Creator
    with no PROFILE_EDIT scope could self-feature their own course onto the
    public homepage."""

    def setUp(self):
        self.creator = _make_user('EDU-CREATOR-0003', 'TEACHER')
        self.course = Course.objects.create(
            title='EduIgnite for Accountants', slug='eduignite-for-accountants',
            role_pathway=Course.RolePathway.ACCOUNTANT, status=Course.Status.DRAFT,
            created_by=self.creator, is_featured=False,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.creator)

    def test_owner_without_profile_edit_cannot_self_feature(self):
        response = self.client.patch(
            f'/api/v1/academy/courses/{self.course.slug}/', {'is_featured': True}, format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.course.refresh_from_db()
        self.assertFalse(self.course.is_featured)

    def test_profile_edit_holder_can_feature_a_course(self):
        _grant(self.creator, AcademyPermission.Scope.PROFILE_EDIT)
        response = self.client.patch(
            f'/api/v1/academy/courses/{self.course.slug}/', {'is_featured': True}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.course.refresh_from_db()
        self.assertTrue(self.course.is_featured)

    def test_owner_can_still_edit_other_fields_without_profile_edit(self):
        """The is_featured gate must not block ordinary content edits."""
        response = self.client.patch(
            f'/api/v1/academy/courses/{self.course.slug}/', {'description': 'Updated description.'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)


class CertificateVerificationIdTests(TestCase):
    """Regression test for a security review finding: verification_id was a
    dense per-year sequential counter (EDU-2026-000001, 000002, ...),
    letting an unauthenticated caller enumerate the entire ~10^6 space
    against the public /verify/{id}/ endpoint and harvest every learner's
    real name + course + date -- a full roster dump. The spec itself
    explicitly requires a "non-sequential" ID (Section 7)."""

    def setUp(self):
        self.creator = _make_user('EDU-CREATOR-0004', 'TEACHER')
        self.course = Course.objects.create(
            title='EduIgnite for Principals', slug='eduignite-for-principals',
            role_pathway=Course.RolePathway.PRINCIPAL, status=Course.Status.PUBLISHED,
            created_by=self.creator,
        )

    def test_verification_ids_are_not_sequential(self):
        learners = [_make_user(f'EDU-LEARNER-VID-{i}', 'ACADEMY_LEARNER') for i in range(5)]
        certs = [
            Certificate.objects.create(user=learner, course=self.course, tier=Certificate.Tier.COMPLETION)
            for learner in learners
        ]
        suffixes = [c.verification_id.rsplit('-', 1)[1] for c in certs]

        # Every id is unique (the actual security property that matters).
        self.assertEqual(len(set(suffixes)), len(suffixes))
        # Not the old digit-only sequential format (000001, 000002, ...) --
        # random alphanumeric output should not be all-digits across a run
        # of 5 independent 6-character draws (33-char alphabet, only 10 of
        # which are digits: astronomically unlikely to coincidentally be
        # all-digits 5 times running unless the old sequential generator
        # were still in use).
        self.assertFalse(all(s.isdigit() for s in suffixes))

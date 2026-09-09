"""URL routes for EduIgnite Academy, matching ``scratchpad/academy-contract.md``
exactly. Mounted at ``/api/v1/academy/`` by ``config.urls``.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademyProfilePublicView,
    AcademyRegisterView,
    CertificateDownloadView,
    CertificateVerifyView,
    CourseTestimonialViewSet,
    CourseViewSet,
    DeepLinkCreateView,
    FAQEntryViewSet,
    LessonCompleteView,
    MyCertificatesView,
    PermissionGrantView,
    PermissionRevokeView,
    ProfileConfigUpdateView,
    QuizAttemptView,
    SearchView,
    SSOContinueView,
    TrainerProfileViewSet,
)

app_name = 'academy'

router = DefaultRouter()
router.register(r'courses', CourseViewSet, basename='academy-course')
router.register(r'trainers', TrainerProfileViewSet, basename='academy-trainer')
router.register(r'faqs', FAQEntryViewSet, basename='academy-faq')
router.register(r'testimonials', CourseTestimonialViewSet, basename='academy-testimonial')

urlpatterns = [
    # Public
    path('profile/', AcademyProfilePublicView.as_view(), name='profile-public'),
    path('search/', SearchView.as_view(), name='search'),
    path('verify/<str:verification_id>/', CertificateVerifyView.as_view(), name='certificate-verify'),
    path('deep-link/', DeepLinkCreateView.as_view(), name='deep-link-create'),

    # Authenticated identity / SSO
    path('sso/continue/', SSOContinueView.as_view(), name='sso-continue'),
    path('register/', AcademyRegisterView.as_view(), name='register'),

    # Authenticated learning actions
    path('lessons/<int:lesson_id>/complete/', LessonCompleteView.as_view(), name='lesson-complete'),
    path('quizzes/<int:quiz_id>/attempt/', QuizAttemptView.as_view(), name='quiz-attempt'),
    # Not in the original endpoint list — added additively so the learner's
    # own "View Certificates" page has something to list against (see
    # MyCertificatesView docstring). Placed before the router include so it
    # isn't shadowed by any future top-level router registration.
    path('certificates/', MyCertificatesView.as_view(), name='my-certificates'),
    # Same rationale, additive: the "View Certificates" page (and the
    # course-completion modal) had nothing to actually download. Scoped to
    # the caller's own certificates only -- see CertificateDownloadView.
    path('certificates/<uuid:certificate_id>/download/', CertificateDownloadView.as_view(), name='certificate-download'),

    # CMS
    path('profile-config/', ProfileConfigUpdateView.as_view(), name='profile-config-update'),
    path('permissions/grant/', PermissionGrantView.as_view(), name='permission-grant'),
    path('permissions/revoke/', PermissionRevokeView.as_view(), name='permission-revoke'),

    # Course / trainer / faq / testimonial CRUD + custom actions (enroll,
    # player, submit-for-review, approve, reject, approve/reject testimonial)
    path('', include(router.urls)),
]

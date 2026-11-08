from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PlatformSettingsView,
    PlatformLogoUploadView,
    PlatformEventMediaUploadView,
    PlatformFeesViewSet,
    PublicEventViewSet,
    TutorialLinkViewSet,
    PlatformStatsView,
)
from .billing_views import (
    MyPlatformBillView,
    MyPlatformBillHistoryView,
    SchoolsBillingOverviewView,
    PlatformBillingChangesView,
)

from .public_site_views import (
    PublicBlogDetailView,
    PublicBlogListView,
    PublicGalleryView,
    PublicSiteControlView,
    PublicPlatformStatsView,
    PublicTestimonialsView,
    PublicFoundersView,
    PublicContactView,
    ContactMessagesView,
)

from .app_version_views import (
    AppVersionListView,
    AppVersionUpdateView,
)

from .integration_views import IntegrationSecretsView

app_name = 'platform'

router = DefaultRouter()
router.register(r'fees', PlatformFeesViewSet, basename='fee')
router.register(r'events', PublicEventViewSet, basename='event')
router.register(r'tutorials', TutorialLinkViewSet, basename='tutorial')

urlpatterns = [
    path('', include(router.urls)),
    path('settings/', PlatformSettingsView.as_view(), name='settings'),
    path('integration-secrets/', IntegrationSecretsView.as_view(), name='integration-secrets'),
    path('upload-logo/', PlatformLogoUploadView.as_view(), name='upload-logo'),
    path('upload-event-media/', PlatformEventMediaUploadView.as_view(), name='upload-event-media'),
    path('stats/', PlatformStatsView.as_view(), name='stats'),
    path('billing/my-bill/', MyPlatformBillView.as_view(), name='billing-my-bill'),
    path('billing/history/', MyPlatformBillHistoryView.as_view(), name='billing-history'),
    path('billing/schools/', SchoolsBillingOverviewView.as_view(), name='billing-schools'),
    path('billing/changes/', PlatformBillingChangesView.as_view(), name='billing-changes'),
    # Public marketing site — see apps/platform/public_site_views.py
    path('public-stats/', PublicPlatformStatsView.as_view(), name='public-stats'),
    path('public-testimonials/', PublicTestimonialsView.as_view(), name='public-testimonials'),
    path('public-blog/', PublicBlogListView.as_view(), name='public-blog'),
    path('public-blog/<slug:slug>/', PublicBlogDetailView.as_view(), name='public-blog-detail'),
    path('public-gallery/', PublicGalleryView.as_view(), name='public-gallery'),
    path('public-founders/', PublicFoundersView.as_view(), name='public-founders'),
    path('public-contact/', PublicContactView.as_view(), name='public-contact'),
    path('contact-messages/', ContactMessagesView.as_view(), name='contact-messages'),
    path('public-site/', PublicSiteControlView.as_view(), name='public-site-control'),
    # App update-check — see apps/platform/app_version_views.py
    path('app-versions/', AppVersionListView.as_view(), name='app-versions-list'),
    path('app-versions/<str:app_key>/', AppVersionUpdateView.as_view(), name='app-versions-update'),
]

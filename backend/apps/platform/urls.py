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

app_name = 'platform'

router = DefaultRouter()
router.register(r'fees', PlatformFeesViewSet, basename='fee')
router.register(r'events', PublicEventViewSet, basename='event')
router.register(r'tutorials', TutorialLinkViewSet, basename='tutorial')

urlpatterns = [
    path('', include(router.urls)),
    path('settings/', PlatformSettingsView.as_view(), name='settings'),
    path('upload-logo/', PlatformLogoUploadView.as_view(), name='upload-logo'),
    path('upload-event-media/', PlatformEventMediaUploadView.as_view(), name='upload-event-media'),
    path('stats/', PlatformStatsView.as_view(), name='stats'),
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
]

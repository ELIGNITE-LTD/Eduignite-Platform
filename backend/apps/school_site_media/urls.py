from django.urls import path

from . import public_views as pub
from . import views
from .public_index import PublicContentIndexView

# Mounted at /api/v1/schools/ (see config/urls.py), after apps.schools.urls.
urlpatterns = [
    # Management (school administrators; executives with the school_websites module)
    path('public-site/events/', views.EventListCreateView.as_view(), name='site-events'),
    path('public-site/events/<uuid:pk>/', views.EventDetailView.as_view(), name='site-event'),
    path('public-site/events/<uuid:pk>/publish/', views.EventPublishView.as_view(), name='site-event-publish'),
    path('public-site/events/<uuid:pk>/unpublish/', views.EventPublishView.as_view(unpublish=True),
         name='site-event-unpublish'),
    path('public-site/events/<uuid:pk>/cover/', views.EventCoverView.as_view(), name='site-event-cover'),
    path('public-site/albums/', views.AlbumListCreateView.as_view(), name='site-albums'),
    path('public-site/albums/reorder/', views.AlbumReorderView.as_view(), name='site-albums-reorder'),
    path('public-site/albums/<uuid:pk>/', views.AlbumDetailView.as_view(), name='site-album'),
    path('public-site/albums/<uuid:pk>/publish/', views.AlbumPublishView.as_view(), name='site-album-publish'),
    path('public-site/albums/<uuid:pk>/unpublish/', views.AlbumPublishView.as_view(unpublish=True),
         name='site-album-unpublish'),
    path('public-site/albums/<uuid:pk>/cover/', views.AlbumCoverView.as_view(), name='site-album-cover'),
    path('public-site/albums/<uuid:pk>/media/', views.MediaListCreateView.as_view(), name='site-album-media'),
    path('public-site/albums/<uuid:pk>/media/reorder/', views.MediaReorderView.as_view(),
         name='site-album-media-reorder'),
    path('public-site/media/<uuid:pk>/', views.MediaDetailView.as_view(), name='site-media'),
    # Public (no authentication)
    path('public-content/index/', PublicContentIndexView.as_view(), name='school-public-content-index'),
    path('public/<slug:slug>/events/', pub.PublicEventListView.as_view(), name='school-public-events'),
    path('public/<slug:slug>/events/<slug:event_slug>/', pub.PublicEventDetailView.as_view(),
         name='school-public-event'),
    path('public/<slug:slug>/gallery/', pub.PublicGalleryView.as_view(), name='school-public-gallery'),
    path('public/<slug:slug>/gallery/<uuid:album_id>/', pub.PublicAlbumDetailView.as_view(),
         name='school-public-album'),
]

"""Mounted under ``/api/v1/schools/`` BEFORE the schools app (see config/urls.py)."""

from django.urls import path

from . import public_views, views

app_name = 'school_site_content'

urlpatterns = [
    # Public (no authentication)
    path('public/blog-index/', public_views.PublicBlogIndexView.as_view(), name='public-blog-index'),
    path('public/<slug:slug>/blog/', public_views.PublicBlogListView.as_view(), name='public-blog-list'),
    path('public/<slug:slug>/blog/<slug:post_slug>/', public_views.PublicBlogDetailView.as_view(),
         name='public-blog-detail'),
    path('public/<slug:slug>/leadership/', public_views.PublicLeadershipView.as_view(), name='public-leadership'),
    # Management
    path('public-site/blog/posts/', views.PostListView.as_view(), name='post-list'),
    path('public-site/blog/posts/<str:pk>/', views.PostDetailView.as_view(), name='post-detail'),
    path('public-site/blog/posts/<str:pk>/publish/', views.PostPublishView.as_view(), name='post-publish'),
    path('public-site/blog/posts/<str:pk>/unpublish/', views.PostUnpublishView.as_view(), name='post-unpublish'),
    path('public-site/blog/posts/<str:pk>/preview-token/rotate/', views.PostPreviewRotateView.as_view(),
         name='post-preview-rotate'),
    path('public-site/blog/images/', views.ImageUploadView.as_view(), name='post-image'),
    path('public-site/blog/categories/', views.CategoryListView.as_view(), name='category-list'),
    path('public-site/blog/categories/<str:pk>/', views.CategoryDetailView.as_view(), name='category-detail'),
    path('public-site/leadership/candidates/', views.LeaderCandidatesView.as_view(), name='leader-candidates'),
    path('public-site/leadership/reorder/', views.LeaderReorderView.as_view(), name='leader-reorder'),
    path('public-site/leadership/', views.LeaderListView.as_view(), name='leader-list'),
    path('public-site/leadership/<str:pk>/', views.LeaderDetailView.as_view(), name='leader-detail'),
]

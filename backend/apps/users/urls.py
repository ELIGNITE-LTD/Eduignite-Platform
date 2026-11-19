from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, FounderProfileViewSet
from .leadership_views import LeadershipEntryViewSet
from .public_profile_views import FounderPublicProfileView
from .teacher_workspace import (
    teacher_workspace,
    teacher_workspace_setup,
    teacher_workspace_switch,
)

from apps.proprietors.urls import founder_urlpatterns as proprietor_founder_urls

app_name = 'users'

router = DefaultRouter()
router.register(r'founders', FounderProfileViewSet, basename='founder')
router.register(r'leadership', LeadershipEntryViewSet, basename='leadership')
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    # Explicit paths must precede the catch-all UserViewSet router, or its
    # detail route would swallow "teacher-workspace" as a user id.
    path('teacher-workspace/', teacher_workspace, name='teacher-workspace'),
    path('teacher-workspace/setup/', teacher_workspace_setup, name='teacher-workspace-setup'),
    path('teacher-workspace/switch/', teacher_workspace_switch, name='teacher-workspace-switch'),
    path('founder-public-profile/', FounderPublicProfileView.as_view(), name='founder-public-profile'),
    path('proprietors/', include(proprietor_founder_urls)),
    path('', include(router.urls)),
]

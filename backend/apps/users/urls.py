from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, FounderProfileViewSet
from .teacher_workspace import (
    teacher_workspace,
    teacher_workspace_setup,
    teacher_workspace_switch,
)

from .linked_accounts import (
    CreatePrimarySchoolView,
    LinkedSchoolsView,
    LinkExistingSchoolView,
    SwitchSchoolView,
    UnlinkSchoolView,
)

app_name = 'users'

router = DefaultRouter()
router.register(r'founders', FounderProfileViewSet, basename='founder')
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    # Explicit paths must precede the catch-all UserViewSet router, or its
    # detail route would swallow "teacher-workspace" as a user id.
    path('teacher-workspace/', teacher_workspace, name='teacher-workspace'),
    path('teacher-workspace/setup/', teacher_workspace_setup, name='teacher-workspace-setup'),
    path('teacher-workspace/switch/', teacher_workspace_switch, name='teacher-workspace-switch'),
    path('linked-schools/', LinkedSchoolsView.as_view(), name='linked-schools'),
    path('linked-schools/create-primary/', CreatePrimarySchoolView.as_view(), name='linked-schools-create-primary'),
    path('linked-schools/link/', LinkExistingSchoolView.as_view(), name='linked-schools-link'),
    path('linked-schools/switch/', SwitchSchoolView.as_view(), name='linked-schools-switch'),
    path('linked-schools/unlink/', UnlinkSchoolView.as_view(), name='linked-schools-unlink'),
    path('', include(router.urls)),
]

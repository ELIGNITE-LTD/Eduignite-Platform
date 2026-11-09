from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SchoolViewSet,
    SchoolSettingsViewSet,
    SubSchoolViewSet,
    SubAdminViewSet,
    SchoolClassViewSet,
    ClassSubjectViewSet,
    HierarchyStaffViewSet,
    ClassTeacherAssignmentViewSet,
    SchoolScopedClassListCreateView,
    SchoolScopedStaffCreateView,
    SchoolScopedStudentCreateView,
    SchoolScopedStudentBulkCreateView,
    SchoolScopedSubSchoolDetailView,
    SchoolScopedSubSchoolListView,
    SchoolEventViewSet,
    SchoolCommunityDirectoryView,
    TimetableEntryViewSet,
)
from .public_profile import (
    PublicSchoolDirectoryView,
    PublicSchoolProfileView,
    PublicStaffDirectoryView,
)
from .public_site_views import (
    FounderForceUnpublishView,
    FounderPublicSiteListView,
    FounderUnlockView,
    PublicSiteAuditView,
    PublicSiteMineView,
    PublicSitePreviewTokenRotateView,
    PublicSiteProfileView,
    PublicSitePublishView,
    PublicSiteUnpublishView,
)
from .admissions_views import (
    AdmissionSettingsView,
    ApplicationDetailView,
    ApplicationDocumentDownloadView,
    ApplicationDocumentLinkView,
    ApplicationEnrolView,
    ApplicationExportView,
    ApplicationListView,
    PublicEnrollmentView,
)
from .hierarchy_setup_views import (
    BulkClassSubjectsView,
    AssignClassLevelView,
    BulkClassesView,
    LevelDetailView,
    LevelListView,
    LevelReorderView,
    LevelSeedView,
    QuickSetupView,
    SetClassTeacherView,
    SetupSummaryView,
)
from apps.students.views import StudentGuardianCollectionView, StudentGuardianDetailView

app_name = 'schools'

router = DefaultRouter()
router.register(r'schools', SchoolViewSet, basename='school')
router.register(r'settings', SchoolSettingsViewSet, basename='school-settings')
router.register(r'hierarchy/sub-schools', SubSchoolViewSet, basename='sub-school')
router.register(r'hierarchy/sub-admins', SubAdminViewSet, basename='sub-admin')
router.register(r'hierarchy/classes', SchoolClassViewSet, basename='school-class')
router.register(r'hierarchy/subjects', ClassSubjectViewSet, basename='class-subject')
router.register(r'hierarchy/class-teachers', ClassTeacherAssignmentViewSet, basename='class-teacher-assignment')
router.register(r'hierarchy/staff', HierarchyStaffViewSet, basename='hierarchy-staff')
router.register(r'timetable', TimetableEntryViewSet, basename='school-timetable')
router.register(r'events', SchoolEventViewSet, basename='school-event')

settings_calendar = SchoolSettingsViewSet.as_view({
    'patch': 'calendar',
    'put': 'calendar',
    'post': 'calendar',
})
settings_honour_roll_threshold = SchoolSettingsViewSet.as_view({
    'get': 'honour_roll_threshold',
    'patch': 'honour_roll_threshold',
    'post': 'honour_roll_threshold',
})
timetable_collection = TimetableEntryViewSet.as_view({
    'get': 'list',
    'post': 'create',
})
timetable_detail = TimetableEntryViewSet.as_view({
    'get': 'retrieve',
    'put': 'update',
    'patch': 'partial_update',
    'delete': 'destroy',
})
timetable_publish = TimetableEntryViewSet.as_view({'post': 'publish'})
timetable_unpublish = TimetableEntryViewSet.as_view({'post': 'unpublish'})
timetable_publish_all = TimetableEntryViewSet.as_view({'post': 'publish_all'})

urlpatterns = [
    path('hierarchy/setup-summary/', SetupSummaryView.as_view(), name='hierarchy-setup-summary'),
    path('hierarchy/setup/quick/', QuickSetupView.as_view(), name='hierarchy-setup-quick'),
    path('hierarchy/classes/<uuid:pk>/assign-level/', AssignClassLevelView.as_view(), name='hierarchy-class-assign-level'),
    path('hierarchy/levels/', LevelListView.as_view(), name='hierarchy-levels'),
    path('hierarchy/levels/seed/', LevelSeedView.as_view(), name='hierarchy-levels-seed'),
    path('hierarchy/levels/reorder/', LevelReorderView.as_view(), name='hierarchy-levels-reorder'),
    path('hierarchy/levels/<uuid:pk>/', LevelDetailView.as_view(), name='hierarchy-level-detail'),
    path('hierarchy/classes/bulk/', BulkClassesView.as_view(), name='hierarchy-classes-bulk'),
    path('hierarchy/class-subjects/bulk/', BulkClassSubjectsView.as_view(), name='hierarchy-class-subjects-bulk'),
    path('hierarchy/classes/<uuid:pk>/class-teacher/', SetClassTeacherView.as_view(), name='hierarchy-class-teacher'),
    path('public-site/mine/', PublicSiteMineView.as_view(), name='public-site-mine'),
    path('public-site/profile/', PublicSiteProfileView.as_view(), name='public-site-profile'),
    path('public-site/publish/', PublicSitePublishView.as_view(), name='public-site-publish'),
    path('public-site/unpublish/', PublicSiteUnpublishView.as_view(), name='public-site-unpublish'),
    path('public-site/preview-token/rotate/', PublicSitePreviewTokenRotateView.as_view(),
         name='public-site-preview-rotate'),
    path('public-site/audit/', PublicSiteAuditView.as_view(), name='public-site-audit'),
    path('public-site/schools/', FounderPublicSiteListView.as_view(), name='public-site-founder-list'),
    path('public-site/schools/<str:school_id>/force-unpublish/', FounderForceUnpublishView.as_view(),
         name='public-site-force-unpublish'),
    path('public-site/schools/<str:school_id>/unlock/', FounderUnlockView.as_view(),
         name='public-site-unlock'),
    path('admissions/settings/', AdmissionSettingsView.as_view(), name='admissions-settings'),
    path('admissions/applications/', ApplicationListView.as_view(), name='admissions-applications'),
    path('admissions/export/', ApplicationExportView.as_view(), name='admissions-export'),
    path('admissions/applications/<uuid:pk>/', ApplicationDetailView.as_view(), name='admissions-application'),
    path('admissions/applications/<uuid:pk>/enrol/', ApplicationEnrolView.as_view(), name='admissions-enrol'),
    path('admissions/applications/<uuid:pk>/documents/<uuid:doc_id>/link/',
         ApplicationDocumentLinkView.as_view(), name='admissions-document-link'),
    path('admissions/documents/download/<path:token>/', ApplicationDocumentDownloadView.as_view(),
         name='admissions-document-download'),
    path('public/<slug:slug>/enrollment/', PublicEnrollmentView.as_view(), name='school-public-enrollment'),
    path('public/', PublicSchoolDirectoryView.as_view(), name='school-public-directory'),
    path('public/<slug:slug>/', PublicSchoolProfileView.as_view(), name='school-public-profile'),
    path('public/<slug:slug>/staff/', PublicStaffDirectoryView.as_view(), name='school-public-staff'),
    path('community/', SchoolCommunityDirectoryView.as_view(), name='school-community'),
    path(
        'settings/<str:school>/honour-roll-threshold/',
        settings_honour_roll_threshold,
        name='school-settings-honour-roll-threshold',
    ),
    path(
        'settings/<str:school>/calendar/',
        settings_calendar,
        name='school-settings-calendar',
    ),
    path('timetable/', timetable_collection, name='school-timetable-collection-direct'),
    path('timetable/publish-all/', timetable_publish_all, name='school-timetable-publish-all-direct'),
    path('timetable/<uuid:pk>/', timetable_detail, name='school-timetable-detail-direct'),
    path('timetable/<uuid:pk>/publish/', timetable_publish, name='school-timetable-publish-direct'),
    path('timetable/<uuid:pk>/unpublish/', timetable_unpublish, name='school-timetable-unpublish-direct'),
    path('schools/timetable/', timetable_collection, name='school-timetable-collection-nested-alias'),
    path('schools/timetable/publish-all/', timetable_publish_all, name='school-timetable-publish-all-nested-alias'),
    path('schools/timetable/<uuid:pk>/', timetable_detail, name='school-timetable-detail-nested-alias'),
    path('schools/timetable/<uuid:pk>/publish/', timetable_publish, name='school-timetable-publish-nested-alias'),
    path('schools/timetable/<uuid:pk>/unpublish/', timetable_unpublish, name='school-timetable-unpublish-nested-alias'),
    path('', include(router.urls)),
    path('<str:school_id>/sub-schools/', SchoolScopedSubSchoolListView.as_view(), name='school-sub-schools'),
    path('<str:school_id>/sub-schools/<uuid:sub_school_id>/', SchoolScopedSubSchoolDetailView.as_view(), name='school-sub-school-detail'),
    path('<str:school_id>/classes/', SchoolScopedClassListCreateView.as_view(), name='school-classes'),
    path('<str:school_id>/staff/', SchoolScopedStaffCreateView.as_view(), name='school-staff-create'),
    path('<str:school_id>/students/', SchoolScopedStudentCreateView.as_view(), name='school-students-create'),
    path('<str:school_id>/students/bulk/', SchoolScopedStudentBulkCreateView.as_view(), name='school-students-bulk'),
    path('<str:school_id>/students/<uuid:student_id>/guardians/', StudentGuardianCollectionView.as_view(), name='school-student-guardians'),
    path('<str:school_id>/students/<uuid:student_id>/guardians/<uuid:guardian_id>/', StudentGuardianDetailView.as_view(), name='school-student-guardian-detail'),
]

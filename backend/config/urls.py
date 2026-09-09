from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include, re_path
from django.http import JsonResponse
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)
from apps.config.views import translate_text
from apps.ai_features.urls import urlpatterns as ai_feature_urlpatterns
from apps.grades.views import publish_report_cards_api
from apps.schools.views import TimetableEntryViewSet
from apps.students.views import GuardianStudentsView
from apps.offline_licensing.urls import (
    licensing_urlpatterns as offline_licensing_urlpatterns,
    migration_urlpatterns as offline_migration_urlpatterns,
    sync_urlpatterns as offline_sync_urlpatterns,
)


def root_view(request):
    """Human-friendly root endpoint for local backend runs."""
    return JsonResponse(
        {
            'name': 'EduIgnite API',
            'status': 'ok',
            'health': '/api/health/',
            'api': '/api/v1/',
            'docs': '/api/docs/',
            'schema': '/api/schema/',
            'redoc': '/api/redoc/',
        }
    )


def health_check(request):
    """Lightweight health-check used by nginx and Docker healthchecks."""
    return JsonResponse({'status': 'ok'})

timetable_collection_api = TimetableEntryViewSet.as_view({
    'get': 'list',
    'post': 'create',
})
timetable_detail_api = TimetableEntryViewSet.as_view({
    'get': 'retrieve',
    'put': 'update',
    'patch': 'partial_update',
    'delete': 'destroy',
})
timetable_publish_api = TimetableEntryViewSet.as_view({'post': 'publish'})
timetable_unpublish_api = TimetableEntryViewSet.as_view({'post': 'unpublish'})
timetable_publish_all_api = TimetableEntryViewSet.as_view({'post': 'publish_all'})

api_v1_patterns = [
    path('auth/', include('apps.authentication.urls', namespace='authentication')),
    path('users/', include('apps.users.urls', namespace='users')),
    path('timetable/', timetable_collection_api, name='timetable-direct'),
    path('timetable/publish-all/', timetable_publish_all_api, name='timetable-publish-all-direct'),
    path('timetable/<uuid:pk>/', timetable_detail_api, name='timetable-detail-direct'),
    path('timetable/<uuid:pk>/publish/', timetable_publish_api, name='timetable-publish-direct'),
    path('timetable/<uuid:pk>/unpublish/', timetable_unpublish_api, name='timetable-unpublish-direct'),
    path('schools/timetable/', timetable_collection_api, name='school-timetable-direct'),
    path('schools/timetable/publish-all/', timetable_publish_all_api, name='school-timetable-publish-all-direct'),
    path('schools/timetable/<uuid:pk>/', timetable_detail_api, name='school-timetable-detail-direct'),
    path('schools/timetable/<uuid:pk>/publish/', timetable_publish_api, name='school-timetable-publish-direct'),
    path('schools/timetable/<uuid:pk>/unpublish/', timetable_unpublish_api, name='school-timetable-unpublish-direct'),
    path('schools/', include('apps.schools.urls', namespace='schools')),
    path('students/', include('apps.students.urls', namespace='students')),
    path('assignments/', include('apps.assignments.urls', namespace='assignments')),
    path('grades/publish-report-cards/', publish_report_cards_api, name='grade-report-card-publish-direct'),
    path('grades/publish_report_cards/', publish_report_cards_api, name='grade-report-card-publish-direct-underscore'),
    path('grades/report-cards/publish/', publish_report_cards_api, name='grade-report-card-publish-direct-hyphen'),
    path('grades/report_cards/publish/', publish_report_cards_api, name='grade-report-card-publish-direct-legacy'),
    path('grades/grades/publish-report-cards/', publish_report_cards_api, name='grade-report-card-publish-nested-direct'),
    path('grades/grades/publish_report_cards/', publish_report_cards_api, name='grade-report-card-publish-nested-direct-underscore'),
    path('grades/grades/report-cards/publish/', publish_report_cards_api, name='grade-report-card-publish-nested-direct-hyphen'),
    path('grades/grades/report_cards/publish/', publish_report_cards_api, name='grade-report-card-publish-nested-direct-legacy'),
    path('grades/', include('apps.grades.urls', namespace='grades')),
    path('attendance/', include('apps.attendance.urls', namespace='attendance')),
    path('fees/', include('apps.fees.urls', namespace='fees')),
    path('library/', include('apps.library.urls', namespace='library')),
    path('announcements/', include('apps.announcements.urls', namespace='announcements')),
    path('community/', include('apps.community.urls', namespace='community')),
    path('chat/', include('apps.chat.urls', namespace='chat')),
    path('ai/', include('apps.ai_features.urls', namespace='ai_features')),
    path('orders/', include('apps.orders.urls', namespace='orders')),
    path('platform/', include('apps.platform.urls', namespace='platform')),
    path('registry/', include('apps.registry.urls', namespace='registry')),
    path('feedback/', include('apps.feedback.urls', namespace='feedback')),
    path('support/', include('apps.support.urls', namespace='support')),
    path('staff-remarks/', include('apps.staff_remarks.urls', namespace='staff_remarks')),
    path('live-classes/', include('apps.live_classes.urls', namespace='live_classes')),
    path('exams/', include('apps.exams.urls', namespace='exams')),
    path('notifications/', include('apps.notifications.urls', namespace='notifications')),
    path('app-store/', include('apps.app_store.urls', namespace='app_store')),
    path('relationships/', include('apps.relationships.urls', namespace='relationships')),
    path('config/', include('apps.config.urls', namespace='config')),
    path('guardians/me/students/', GuardianStudentsView.as_view(), name='guardian-me-students'),
    path('guardians/<uuid:guardian_id>/students/', GuardianStudentsView.as_view(), name='guardian-students'),
    path('offline-licensing/', include((offline_licensing_urlpatterns, 'offline_licensing'), namespace='offline_licensing')),
    path('offline-sync/', include((offline_sync_urlpatterns, 'offline_licensing'), namespace='offline_sync')),
    path('offline-migration/', include((offline_migration_urlpatterns, 'offline_licensing'), namespace='offline_migration')),
    path('academy/', include('apps.academy.urls', namespace='academy')),
    path('surveys/', include('apps.surveys.urls', namespace='surveys')),
]

urlpatterns = [
    path('', root_view, name='root'),
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),
    path('api/translate', translate_text, name='translate'),
    path('api/translate/', translate_text, name='translate-slash'),
    path('api/ai/', include((ai_feature_urlpatterns, 'ai_features_alias'), namespace='ai_features_alias')),
    re_path(r'^api/v1/grades/publish-report-cards/?$', publish_report_cards_api, name='grade-report-card-publish-api-v1'),
    re_path(r'^api/v1/grades/publish_report_cards/?$', publish_report_cards_api, name='grade-report-card-publish-api-v1-underscore'),
    re_path(r'^api/v1/grades/report-cards/publish/?$', publish_report_cards_api, name='grade-report-card-publish-api-v1-hyphen'),
    re_path(r'^api/v1/grades/report_cards/publish/?$', publish_report_cards_api, name='grade-report-card-publish-api-v1-legacy'),
    re_path(r'^api/v1/grades/grades/publish-report-cards/?$', publish_report_cards_api, name='grade-report-card-publish-api-v1-nested'),
    re_path(r'^api/v1/grades/grades/publish_report_cards/?$', publish_report_cards_api, name='grade-report-card-publish-api-v1-nested-underscore'),
    re_path(r'^api/v1/grades/grades/report-cards/publish/?$', publish_report_cards_api, name='grade-report-card-publish-api-v1-nested-hyphen'),
    re_path(r'^api/v1/grades/grades/report_cards/publish/?$', publish_report_cards_api, name='grade-report-card-publish-api-v1-nested-legacy'),
    re_path(r'^api/v1/timetable/?$', timetable_collection_api, name='timetable-api-v1'),
    re_path(r'^api/v1/timetable/publish-all/?$', timetable_publish_all_api, name='timetable-publish-all-api-v1'),
    re_path(r'^api/v1/timetable/(?P<pk>[0-9a-f-]+)/?$', timetable_detail_api, name='timetable-detail-api-v1'),
    re_path(r'^api/v1/timetable/(?P<pk>[0-9a-f-]+)/publish/?$', timetable_publish_api, name='timetable-publish-api-v1'),
    re_path(r'^api/v1/timetable/(?P<pk>[0-9a-f-]+)/unpublish/?$', timetable_unpublish_api, name='timetable-unpublish-api-v1'),
    re_path(r'^api/v1/schools/timetable/?$', timetable_collection_api, name='school-timetable-api-v1'),
    re_path(r'^api/v1/schools/timetable/publish-all/?$', timetable_publish_all_api, name='school-timetable-publish-all-api-v1'),
    re_path(r'^api/v1/schools/timetable/(?P<pk>[0-9a-f-]+)/?$', timetable_detail_api, name='school-timetable-detail-api-v1'),
    re_path(r'^api/v1/schools/timetable/(?P<pk>[0-9a-f-]+)/publish/?$', timetable_publish_api, name='school-timetable-publish-api-v1'),
    re_path(r'^api/v1/schools/timetable/(?P<pk>[0-9a-f-]+)/unpublish/?$', timetable_unpublish_api, name='school-timetable-unpublish-api-v1'),
    re_path(r'^api/v1/schools/schools/timetable/?$', timetable_collection_api, name='school-timetable-nested-api-v1'),
    re_path(r'^api/v1/schools/schools/timetable/publish-all/?$', timetable_publish_all_api, name='school-timetable-publish-all-nested-api-v1'),
    re_path(r'^api/v1/schools/schools/timetable/(?P<pk>[0-9a-f-]+)/?$', timetable_detail_api, name='school-timetable-detail-nested-api-v1'),
    re_path(r'^api/v1/schools/schools/timetable/(?P<pk>[0-9a-f-]+)/publish/?$', timetable_publish_api, name='school-timetable-publish-nested-api-v1'),
    re_path(r'^api/v1/schools/schools/timetable/(?P<pk>[0-9a-f-]+)/unpublish/?$', timetable_unpublish_api, name='school-timetable-unpublish-nested-api-v1'),
    re_path(r'^api/timetable/?$', timetable_collection_api, name='timetable-api'),
    re_path(r'^api/timetable/publish-all/?$', timetable_publish_all_api, name='timetable-publish-all-api'),
    re_path(r'^api/timetable/(?P<pk>[0-9a-f-]+)/?$', timetable_detail_api, name='timetable-detail-api'),
    re_path(r'^api/timetable/(?P<pk>[0-9a-f-]+)/publish/?$', timetable_publish_api, name='timetable-publish-api'),
    re_path(r'^api/timetable/(?P<pk>[0-9a-f-]+)/unpublish/?$', timetable_unpublish_api, name='timetable-unpublish-api'),
    re_path(r'^api/schools/timetable/?$', timetable_collection_api, name='school-timetable-api'),
    re_path(r'^api/schools/timetable/publish-all/?$', timetable_publish_all_api, name='school-timetable-publish-all-api'),
    re_path(r'^api/schools/timetable/(?P<pk>[0-9a-f-]+)/?$', timetable_detail_api, name='school-timetable-detail-api'),
    re_path(r'^api/schools/timetable/(?P<pk>[0-9a-f-]+)/publish/?$', timetable_publish_api, name='school-timetable-publish-api'),
    re_path(r'^api/schools/timetable/(?P<pk>[0-9a-f-]+)/unpublish/?$', timetable_unpublish_api, name='school-timetable-unpublish-api'),
    re_path(r'^api/grades/publish-report-cards/?$', publish_report_cards_api, name='grade-report-card-publish-api'),
    re_path(r'^api/grades/report-cards/publish/?$', publish_report_cards_api, name='grade-report-card-publish-api-hyphen'),
    path('api/v1/', include(api_v1_patterns)),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

# django.conf.urls.static.static() is a no-op when DEBUG=False, which made
# every uploaded file (chat attachments, announcement files) 404 in
# production. Serve media explicitly regardless of DEBUG.
from django.urls import re_path
from django.views.static import serve as _media_serve

urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', _media_serve, {'document_root': settings.MEDIA_ROOT}),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

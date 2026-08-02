from django.urls import path

from .data_views import AppCoreView, AppDataView
from .execute_views import AppCallView
from .store_views import AppStoreInstallView, AppStoreUninstallView, AppStoreView
from .frame_views import AppAssetView, AppFrameView
from .payload_views import AppScreenPayloadView
from .build_views import AppAudienceView, AppDetailsView, AppIconView, AppPricingView,  AppBuildActionView, AppBuildListView, AppBuildUploadView
from .views import CatalogueView, MyAppsView, SchoolAppsView

app_name = 'registry'

urlpatterns = [
    path('my-apps/', MyAppsView.as_view(), name='my-apps'),
    path('store/', AppStoreView.as_view(), name='store'),
    path('store/<str:app_key>/install/', AppStoreInstallView.as_view(), name='store-install'),
    path('store/<str:app_key>/uninstall/', AppStoreUninstallView.as_view(), name='store-uninstall'),
    path('catalogue/', CatalogueView.as_view(), name='catalogue'),
    path('schools/<str:school_id>/apps/', SchoolAppsView.as_view(), name='school-apps'),

    # Uploaded apps: developer upload and the review lifecycle. Founders only.
    path('builds/', AppBuildListView.as_view(), name='builds'),
    path('apps/<str:app_key>/audience/', AppAudienceView.as_view(), name='app-audience'),
    path('apps/<str:app_key>/icon/', AppIconView.as_view(), name='app-icon'),
    path('apps/<str:app_key>/details/', AppDetailsView.as_view(), name='app-details'),
    path('builds/upload/', AppBuildUploadView.as_view(), name='build-upload'),
    path('apps/<str:app_key>/data/<str:collection>/<str:action>/', AppDataView.as_view(), name='app-data'),
    path('apps/<str:app_key>/core/<str:resource>/', AppCoreView.as_view(), name='app-core'),
    path('apps/<str:app_key>/screen/<str:screen_id>/payload/', AppScreenPayloadView.as_view(), name='app-screen-payload'),
    path('apps/<str:app_key>/frame/<str:screen_id>/', AppFrameView.as_view(), name='app-frame'),
    path('apps/<str:app_key>/asset/<path:path>', AppAssetView.as_view(), name='app-asset'),
    path('apps/<str:app_key>/call/<str:handler>/', AppCallView.as_view(), name='app-call'),
    path('apps/<str:app_key>/pricing/', AppPricingView.as_view(), name='app-pricing'),
    path('builds/<int:build_id>/<str:action>/', AppBuildActionView.as_view(), name='build-action'),
]

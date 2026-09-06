"""URL routes for EduIgnite Offline licensing/QR activation, chunked sync, and
offline-to-cloud migration. Paths match the wire contract
(``scratchpad/wave2-contract.md``) exactly:

- POST /api/v1/offline-licensing/challenges/redeem/
- POST /api/v1/offline-licensing/device-replacement/
- POST /api/v1/offline-sync/sessions/
- POST /api/v1/offline-sync/sessions/{sessionId}/chunks/
- GET  /api/v1/offline-sync/sessions/{sessionId}/status/
- POST /api/v1/offline-sync/sessions/{sessionId}/complete/
- POST /api/v1/offline-migration/import/

This module is included twice from ``config.urls`` under three different
prefixes (``offline-licensing/``, ``offline-sync/``, ``offline-migration/``)
because the contract splits one app's endpoints across three URL namespaces.
"""

from django.urls import path

from .views import (
    ChallengeRedeemView,
    ChunkUploadView,
    CompleteSyncSessionView,
    CreateSyncSessionView,
    DeviceReplacementView,
    MigrationImportView,
    SyncSessionStatusView,
)

app_name = 'offline_licensing'

licensing_urlpatterns = [
    path('challenges/redeem/', ChallengeRedeemView.as_view(), name='challenge-redeem'),
    path('device-replacement/', DeviceReplacementView.as_view(), name='device-replacement'),
]

sync_urlpatterns = [
    path('sessions/', CreateSyncSessionView.as_view(), name='sync-session-create'),
    path('sessions/<uuid:session_id>/chunks/', ChunkUploadView.as_view(), name='sync-session-chunk-upload'),
    path('sessions/<uuid:session_id>/status/', SyncSessionStatusView.as_view(), name='sync-session-status'),
    path('sessions/<uuid:session_id>/complete/', CompleteSyncSessionView.as_view(), name='sync-session-complete'),
]

migration_urlpatterns = [
    path('import/', MigrationImportView.as_view(), name='migration-import'),
]

# Kept for any code that wants "all of them" via a single include(); config.urls
# instead includes the three sub-lists individually under their own prefixes.
urlpatterns = licensing_urlpatterns + sync_urlpatterns + migration_urlpatterns

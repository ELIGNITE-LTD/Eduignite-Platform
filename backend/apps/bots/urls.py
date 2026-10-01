from django.urls import path

from . import views

app_name = 'bots'

urlpatterns = [
    path('telegram/webhook/', views.telegram_webhook, name='telegram-webhook'),
    path('telegram/', views.telegram_status, name='telegram-status'),
    path('telegram/link-code/', views.telegram_link_code, name='telegram-link-code'),
    path('telegram/connections/<int:identity_id>/', views.telegram_unlink, name='telegram-unlink'),
    path('render/<str:token>/', views.render_payload, name='render-payload'),
]

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = 'partners'

router = DefaultRouter()
router.register(r'admin/types', views.PartnerTypeViewSet, basename='partner-type')

urlpatterns = [
    # Public
    path('types/', views.public_partner_types, name='public-types'),
    path('applications/', views.submit_application, name='submit-application'),
    path('public/', views.public_partners, name='public-partners'),
    path('public/<slug:slug>/', views.public_partner_detail, name='public-partner'),
    path('track-click/', views.track_click, name='track-click'),

    # Account creation + auth
    path('account/check/', views.account_token_check, name='account-check'),
    path('account/', views.create_account, name='create-account'),
    path('login/', views.partner_login, name='login'),
    path('password-reset/', views.password_reset_request, name='password-reset'),
    path('password-reset/confirm/', views.password_reset_confirm, name='password-reset-confirm'),

    # Partner portal (own data)
    path('activate/', views.activate_partner, name='activate'),
    path('me/', views.portal_me, name='portal-me'),
    path('me/profile/', views.portal_update_profile, name='portal-profile'),

    # CEO/CTO management
    path('admin/overview/', views.admin_overview, name='admin-overview'),
    path('admin/applications/', views.admin_applications, name='admin-applications'),
    path('admin/applications/<uuid:pk>/', views.admin_application_detail, name='admin-application'),
    path('admin/applications/<uuid:pk>/review/', views.admin_review_application, name='admin-review'),
    path('admin/partners/', views.admin_partners, name='admin-partners'),
    path('admin/partners/<uuid:pk>/', views.admin_partner_detail, name='admin-partner'),
    path('admin/partners/<uuid:pk>/action/', views.admin_partner_action, name='admin-partner-action'),
    path('admin/performance/', views.admin_performance, name='admin-performance'),

    path('', include(router.urls)),
]

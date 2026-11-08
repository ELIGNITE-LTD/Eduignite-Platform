from django.urls import path

from . import views

# Mounted at /api/v1/users/proprietors/ (founders only). Must be included in
# apps/users/urls.py BEFORE the catch-all user router.
founder_urlpatterns = [
    path('', views.ProprietorListCreateView.as_view(), name='proprietor-list'),
    path('schools/', views.SchoolChoicesView.as_view(), name='proprietor-school-choices'),
    path('<uuid:pk>/', views.ProprietorDetailView.as_view(), name='proprietor-detail'),
    path('<uuid:pk>/deactivate/', views.ProprietorActiveView.as_view(make_active=False), name='proprietor-deactivate'),
    path('<uuid:pk>/activate/', views.ProprietorActiveView.as_view(make_active=True), name='proprietor-activate'),
    path('<uuid:pk>/reset-password/', views.ProprietorResetPasswordView.as_view(), name='proprietor-reset-password'),
    path('<uuid:pk>/schools/', views.ProprietorSchoolsView.as_view(), name='proprietor-schools'),
]

# Mounted at /api/v1/proprietor/ (the PROPRIETOR role only).
app_name = 'proprietor'
urlpatterns = [
    path('overview/', views.OverviewView.as_view(), name='overview'),
    path('schools/<str:school_id>/', views.SchoolDetailView.as_view(), name='school-detail'),
    path('schools/<str:school_id>/admins/', views.SchoolAdminsView.as_view(), name='school-admins'),
    path('schools/<str:school_id>/admins/<str:user_id>/credentials/', views.AdminCredentialsView.as_view(),
         name='admin-credentials'),
]

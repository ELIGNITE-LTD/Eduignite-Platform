from django.urls import path
from .views import (
    MatriculeLoginView,
    FirebaseLoginView,
    RefreshTokenView,
    LogoutView,
    ActivateAccountView,
    ChangePasswordView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    MeView,
)

app_name = 'authentication'

urlpatterns = [
    path('login/', MatriculeLoginView.as_view(), name='matricule-login'),
    path('firebase-login/', FirebaseLoginView.as_view(), name='firebase-login'),
    path('refresh/', RefreshTokenView.as_view(), name='refresh-token'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('activate/', ActivateAccountView.as_view(), name='activate-account'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset-request'),
    path(
        'password-reset/confirm/',
        PasswordResetConfirmView.as_view(),
        name='password-reset-confirm',
    ),
    path('me/', MeView.as_view(), name='me'),
]

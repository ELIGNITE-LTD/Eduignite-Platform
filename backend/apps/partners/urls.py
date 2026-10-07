from django.urls import path

from . import views

app_name = 'partners'

urlpatterns = [
    path('register/', views.partner_register, name='partner-register'),
    path('login/', views.partner_login, name='partner-login'),
    path('me/', views.partner_me, name='partner-me'),
    path('investments/', views.partner_investments, name='partner-investments'),
]

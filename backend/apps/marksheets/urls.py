from django.urls import path

from . import views

app_name = 'marksheets'

urlpatterns = [
    path('', views.SheetCreateView.as_view(), name='create'),
    path('<uuid:pk>/pdf/', views.SheetPdfView.as_view(), name='pdf'),
    path('<uuid:pk>/read/', views.SheetReadView.as_view(), name='read'),
    path('<uuid:pk>/import/', views.SheetImportView.as_view(), name='import'),
]

"""Mounted under ``/api/v1/schools/`` BEFORE the schools app (see config/urls.py)."""

from django.urls import path

from . import public_views

urlpatterns = [
    path('public/<slug:slug>/programmes/', public_views.PublicProgrammesView.as_view(), name='public-programmes'),
    path('public/<slug:slug>/departments/', public_views.PublicDepartmentsView.as_view(), name='public-departments'),
]

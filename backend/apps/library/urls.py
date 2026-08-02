from django.urls import path, include
from rest_framework.routers import DefaultRouter

app_name = 'library'
from .views import BookCategoryViewSet, BookViewSet, BookLoanViewSet, BookRequestViewSet

router = DefaultRouter()
router.register(r'categories', BookCategoryViewSet, basename='bookcategory')
router.register(r'books', BookViewSet, basename='book')
router.register(r'loans', BookLoanViewSet, basename='bookloan')
router.register(r'requests', BookRequestViewSet, basename='bookrequest')

urlpatterns = [
    path('', include(router.urls)),
]

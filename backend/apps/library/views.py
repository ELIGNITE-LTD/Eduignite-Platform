from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db.models import Q, Sum
from .models import BookCategory, Book, BookLoan, BookRequest
from .serializers import (
    BookCategorySerializer, BookListSerializer, BookDetailSerializer,
    BookCreateSerializer, BookLoanSerializer, IssueLoanSerializer,
    ReturnLoanSerializer, LibraryStatsSerializer, BookRequestSerializer,
    BookRequestCreateSerializer, BookRequestReviewSerializer
)
from apps.registry.permissions import RequiresApp

LIBRARY_MANAGEMENT_ROLES = ['LIBRARIAN', 'SCHOOL_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN', 'CEO', 'CTO', 'COO']
LIBRARY_ACCESS_ROLES = LIBRARY_MANAGEMENT_ROLES + ['TEACHER', 'STUDENT', 'BURSAR']


class BookCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = BookCategorySerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('library')]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']

    def get_queryset(self):
        return BookCategory.objects.filter(school=self.request.user.school)

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    def check_permissions(self, request):
        # super().check_permissions() runs IsAuthenticated first and
        # rejects an unauthenticated request cleanly (401) -- it must run
        # before anything below touches request.user.role, which crashes
        # with an AttributeError for Django's AnonymousUser (no .role at
        # all). Same bug class as apps.announcements.views's identical fix.
        super().check_permissions(request)
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            if request.user.role not in LIBRARY_MANAGEMENT_ROLES:
                self.permission_denied(request)


class BookViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, RequiresApp('library')]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['title', 'author', 'isbn']
    filterset_fields = ['category', 'is_active']
    ordering_fields = ['title', 'author', 'available_copies', 'created_at']
    ordering = ['title']

    def get_queryset(self):
        queryset = Book.objects.filter(school=self.request.user.school)
        if self.request.user.role not in LIBRARY_MANAGEMENT_ROLES:
            queryset = queryset.filter(is_active=True)
        return queryset

    def get_serializer_class(self):
        if self.action == 'create' or self.action == 'update' or self.action == 'partial_update':
            return BookCreateSerializer
        elif self.action == 'retrieve':
            return BookDetailSerializer
        return BookListSerializer

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    def destroy(self, request, *args, **kwargs):
        book = self.get_object()
        has_active_loans = book.loans.filter(status__in=['Active', 'Overdue']).exists()
        has_open_requests = book.requests.filter(status__in=['pending', 'approved']).exists()
        if has_active_loans or has_open_requests:
            return Response(
                {
                    'detail': 'This book still has active circulation records. Archive it or resolve the pending loans/requests before deleting it.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def check_permissions(self, request):
        # super().check_permissions() runs IsAuthenticated first and
        # rejects an unauthenticated request cleanly (401) -- it must run
        # before anything below touches request.user.role, which crashes
        # with an AttributeError for Django's AnonymousUser (no .role at
        # all). Same bug class as apps.announcements.views's identical fix.
        super().check_permissions(request)
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            if request.user.role not in LIBRARY_MANAGEMENT_ROLES:
                self.permission_denied(request)

    @action(detail=False, methods=['get'])
    def search(self, request):
        """Search books by title, author, isbn, or category"""
        query = request.query_params.get('q', '')
        category_id = request.query_params.get('category', None)

        books = self.get_queryset()

        if query:
            books = books.filter(
                Q(title__icontains=query) |
                Q(author__icontains=query) |
                Q(isbn__icontains=query)
            )

        if category_id:
            books = books.filter(category_id=category_id)

        serializer = BookListSerializer(books, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Get books with available copies less than 3"""
        books = self.get_queryset().filter(available_copies__lt=3)
        serializer = BookListSerializer(books, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_category(self, request):
        """Get books grouped by category"""
        categories = BookCategory.objects.filter(school=request.user.school)
        result = {}
        for category in categories:
            books = self.get_queryset().filter(category=category)
            result[category.name] = BookListSerializer(books, many=True).data
        return Response(result)


class BookLoanViewSet(viewsets.ModelViewSet):
    serializer_class = BookLoanSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('library')]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'borrower', 'book']
    ordering_fields = ['issued_date', 'due_date', 'status']
    ordering = ['-issued_date']

    def get_queryset(self):
        user = self.request.user
        if user.role in LIBRARY_MANAGEMENT_ROLES:
            return BookLoan.objects.filter(school=user.school)
        else:
            return BookLoan.objects.filter(borrower=user)

    def check_permissions(self, request):
        # super().check_permissions() runs IsAuthenticated first and
        # rejects an unauthenticated request cleanly (401) -- it must run
        # before anything below touches request.user.role, which crashes
        # with an AttributeError for Django's AnonymousUser (no .role at
        # all). Same bug class as apps.announcements.views's identical fix.
        super().check_permissions(request)
        if self.action in ['create', 'destroy']:
            if request.user.role not in LIBRARY_MANAGEMENT_ROLES:
                self.permission_denied(request)

    @action(detail=False, methods=['post'])
    def issue(self, request):
        """Issue a book to a borrower"""
        if request.user.role not in LIBRARY_MANAGEMENT_ROLES:
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        serializer = IssueLoanSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save(school=request.user.school, librarian=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def return_book(self, request, pk=None):
        """Mark a book loan as returned"""
        if request.user.role not in LIBRARY_MANAGEMENT_ROLES:
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        loan = self.get_object()
        serializer = ReturnLoanSerializer(loan, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def my_loans(self, request):
        """Get current user's loans"""
        loans = BookLoan.objects.filter(borrower=request.user)
        serializer = BookLoanSerializer(loans, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get all overdue loans"""
        if request.user.role not in LIBRARY_MANAGEMENT_ROLES:
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        today = timezone.now().date()
        loans = BookLoan.objects.filter(
            school=request.user.school,
            due_date__lt=today,
            returned_date__isnull=True,
            status='Active'
        )
        serializer = BookLoanSerializer(loans, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get library statistics"""
        if request.user.role not in LIBRARY_ACCESS_ROLES:
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        from apps.students import api as students_api
        today = timezone.now().date()
        school_books = Book.objects.filter(school=request.user.school)
        stats = {
            'total_books': school_books.count(),
            'available_books': school_books.aggregate(total=Sum('available_copies'))['total'] or 0,
            'active_loans': BookLoan.objects.filter(school=request.user.school, status='Active').count(),
            'loans_today': BookLoan.objects.filter(school=request.user.school, issued_date=today).count(),
            'overdue_loans': BookLoan.objects.filter(
                school=request.user.school,
                due_date__lt=today,
                returned_date__isnull=True,
                status='Active'
            ).count(),
            'low_stock_books': school_books.filter(available_copies__lt=3).count(),
            'total_students': students_api.list_students(school=request.user.school).count(),
            'pending_requests': BookRequest.objects.filter(school=request.user.school, status='pending').count(),
        }
        serializer = LibraryStatsSerializer(stats)
        return Response(serializer.data)


class BookRequestViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, RequiresApp('library')]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'request_type', 'book']
    ordering_fields = ['created_at', 'approved_at', 'fulfilled_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return BookRequestCreateSerializer
        if self.action in ['approve', 'reject', 'fulfill']:
            return BookRequestReviewSerializer
        return BookRequestSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = BookRequest.objects.select_related('book', 'requester', 'reviewed_by', 'loan')
        if user.role in LIBRARY_MANAGEMENT_ROLES:
            return queryset.filter(school=user.school)
        return queryset.filter(requester=user)

    def perform_create(self, serializer):
        serializer.save(
            school=self.request.user.school,
            requester=self.request.user,
        )

    def create(self, request, *args, **kwargs):
        if request.user.role not in LIBRARY_ACCESS_ROLES:
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(school=request.user.school, requester=request.user)
        return Response(BookRequestSerializer(instance).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if request.user.role not in LIBRARY_MANAGEMENT_ROLES:
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        book_request = self.get_object()
        serializer = self.get_serializer(book_request, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        book_request.status = 'approved'
        book_request.review_note = serializer.validated_data.get('review_note', book_request.review_note)
        book_request.reviewed_by = request.user
        book_request.approved_at = timezone.now()
        book_request.save(update_fields=['status', 'review_note', 'reviewed_by', 'approved_at', 'updated_at'])
        return Response(BookRequestSerializer(book_request).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if request.user.role not in LIBRARY_MANAGEMENT_ROLES:
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        book_request = self.get_object()
        serializer = self.get_serializer(book_request, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        book_request.status = 'rejected'
        book_request.review_note = serializer.validated_data.get('review_note', book_request.review_note)
        book_request.reviewed_by = request.user
        book_request.save(update_fields=['status', 'review_note', 'reviewed_by', 'updated_at'])
        return Response(BookRequestSerializer(book_request).data)

    @action(detail=True, methods=['post'])
    def fulfill(self, request, pk=None):
        if request.user.role not in LIBRARY_MANAGEMENT_ROLES:
            return Response({'detail': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        book_request = self.get_object()
        serializer = self.get_serializer(book_request, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        if book_request.request_type == 'loan':
            due_date = serializer.validated_data.get('due_date')
            if not due_date:
                return Response({'due_date': 'A due date is required to fulfill a loan request.'}, status=status.HTTP_400_BAD_REQUEST)
            if book_request.book.available_copies < 1:
                return Response({'detail': 'This book is not currently available.'}, status=status.HTTP_400_BAD_REQUEST)
            loan = BookLoan.objects.create(
                school=book_request.school,
                book=book_request.book,
                borrower=book_request.requester,
                librarian=request.user,
                due_date=due_date,
                status='Active',
            )
            book_request.book.available_copies -= 1
            book_request.book.save(update_fields=['available_copies'])
            book_request.loan = loan

        book_request.status = 'fulfilled'
        book_request.review_note = serializer.validated_data.get('review_note', book_request.review_note)
        book_request.reviewed_by = request.user
        book_request.fulfilled_at = timezone.now()
        if not book_request.approved_at:
            book_request.approved_at = book_request.fulfilled_at
        book_request.save(
            update_fields=[
                'status',
                'review_note',
                'reviewed_by',
                'approved_at',
                'fulfilled_at',
                'loan',
                'updated_at',
            ]
        )
        return Response(BookRequestSerializer(book_request).data)

from django.db import models
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class BookCategory(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default='#264D73')

    class Meta:
        unique_together = ['school', 'name']
        ordering = ['name']

    def __str__(self):
        return f"{self.name} - {self.school.name}"


class Book(TimeStampedModel):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255)
    isbn = models.CharField(max_length=20, null=True, blank=True, unique=True)
    category = models.ForeignKey(BookCategory, on_delete=models.SET_NULL, null=True)
    publisher = models.CharField(max_length=255, blank=True)
    publication_year = models.IntegerField(null=True, blank=True)
    total_copies = models.IntegerField(default=1)
    available_copies = models.IntegerField(default=1)
    description = models.TextField(blank=True)
    cover_image = models.TextField(null=True, blank=True)
    digital_copy_url = models.URLField(max_length=2000, null=True, blank=True)
    location = models.CharField(max_length=255, blank=True, help_text="Shelf/row information")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['title']
        indexes = [
            models.Index(fields=['school', 'is_active']),
            models.Index(fields=['title', 'author']),
        ]

    def __str__(self):
        return f"{self.title} by {self.author}"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.available_copies > self.total_copies:
            raise ValidationError("Available copies cannot exceed total copies")


class BookLoan(TimeStampedModel):
    LOAN_STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Returned', 'Returned'),
        ('Overdue', 'Overdue'),
        ('Lost', 'Lost'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE)
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='loans')
    borrower = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='borrowed_books')
    librarian = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True,
                                   related_name='issued_loans')
    issued_date = models.DateField(auto_now_add=True)
    due_date = models.DateField()
    returned_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=LOAN_STATUS_CHOICES, default='Active')
    fine_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    fine_paid = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-issued_date']
        indexes = [
            models.Index(fields=['borrower', 'status']),
            models.Index(fields=['school', 'status']),
        ]

    def __str__(self):
        return f"{self.book.title} - {self.borrower.get_full_name()} ({self.status})"

    def is_overdue(self):
        if self.returned_date:
            return False
        return self.due_date < timezone.now().date()

    def days_overdue(self):
        if self.is_overdue():
            return (timezone.now().date() - self.due_date).days
        return 0

    def calculate_fine(self, daily_rate=100):
        if self.returned_date:
            if self.returned_date > self.due_date:
                days = (self.returned_date - self.due_date).days
                return Decimal(str(days * daily_rate))
        else:
            if self.is_overdue():
                days = self.days_overdue()
                return Decimal(str(days * daily_rate))
        return Decimal(0)


class BookRequest(TimeStampedModel):
    REQUEST_TYPE_CHOICES = [
        ('loan', 'Loan'),
        ('soft_copy', 'Soft Copy'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('fulfilled', 'Fulfilled'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='book_requests')
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='requests')
    requester = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='book_requests')
    request_type = models.CharField(max_length=20, choices=REQUEST_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    note = models.TextField(blank=True)
    review_note = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_book_requests',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    fulfilled_at = models.DateTimeField(null=True, blank=True)
    loan = models.OneToOneField(
        BookLoan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_request',
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', 'status']),
            models.Index(fields=['requester', 'status']),
            models.Index(fields=['book', 'request_type']),
        ]

    def __str__(self):
        return f"{self.requester.get_full_name()} - {self.book.title} ({self.request_type})"

import base64

from rest_framework import serializers
from .models import BookCategory, Book, BookLoan, BookRequest
from apps.users.models import User
from django.utils import timezone


class BookCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = BookCategory
        fields = ['id', 'name', 'color']


class BookListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Book
        fields = [
            'id',
            'title',
            'author',
            'isbn',
            'category',
            'category_name',
            'publisher',
            'publication_year',
            'available_copies',
            'total_copies',
            'description',
            'cover_image',
            'digital_copy_url',
            'location',
            'is_active',
        ]


class BookDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True)

    class Meta:
        model = Book
        fields = ['id', 'school', 'school_name', 'title', 'author', 'isbn', 'category', 'category_name',
                  'publisher', 'publication_year', 'total_copies', 'available_copies', 'description',
                  'cover_image', 'digital_copy_url', 'location', 'is_active', 'created_at', 'updated_at']


class BookCreateSerializer(serializers.ModelSerializer):
    cover_file = serializers.ImageField(write_only=True, required=False, allow_null=True)
    remove_cover_image = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Book
        fields = [
            'title',
            'author',
            'isbn',
            'category',
            'publisher',
            'publication_year',
            'total_copies',
            'available_copies',
            'description',
            'cover_image',
            'cover_file',
            'remove_cover_image',
            'digital_copy_url',
            'location',
            'is_active',
        ]

    def _encode_cover_file(self, file_obj):
        if not file_obj:
            return None
        mime_type = getattr(file_obj, 'content_type', None) or 'image/png'
        encoded = base64.b64encode(file_obj.read()).decode('utf-8')
        return f'data:{mime_type};base64,{encoded}'

    def validate(self, data):
        category = data.get('category')
        school = getattr(self.context.get('request'), 'user', None)
        school = getattr(school, 'school', None)
        if category and school and category.school_id != school.id:
            raise serializers.ValidationError({'category': 'The selected category does not belong to your school library.'})

        if data.get('available_copies', 0) > data.get('total_copies', 0):
            raise serializers.ValidationError("Available copies cannot exceed total copies")

        if self.instance:
            total_copies = data.get('total_copies', self.instance.total_copies)
            available_copies = data.get('available_copies')
            borrowed_copies = max(self.instance.total_copies - self.instance.available_copies, 0)
            if available_copies is None:
                data['available_copies'] = max(total_copies - borrowed_copies, 0)
            elif available_copies > total_copies:
                raise serializers.ValidationError("Available copies cannot exceed total copies")
            if total_copies < borrowed_copies:
                raise serializers.ValidationError("Total copies cannot be reduced below the number of books currently on loan.")
        else:
            if 'available_copies' not in data:
                data['available_copies'] = data.get('total_copies', 1)

        return data

    def create(self, validated_data):
        cover_file = validated_data.pop('cover_file', None)
        remove_cover_image = validated_data.pop('remove_cover_image', False)
        if cover_file:
            validated_data['cover_image'] = self._encode_cover_file(cover_file)
        elif remove_cover_image:
            validated_data['cover_image'] = ''
        return super().create(validated_data)

    def update(self, instance, validated_data):
        cover_file = validated_data.pop('cover_file', None)
        remove_cover_image = validated_data.pop('remove_cover_image', False)
        if cover_file:
            validated_data['cover_image'] = self._encode_cover_file(cover_file)
        elif remove_cover_image:
            validated_data['cover_image'] = ''
        return super().update(instance, validated_data)


class BookLoanSerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source='book.title', read_only=True)
    borrower_name = serializers.CharField(source='borrower.get_full_name', read_only=True)
    days_overdue = serializers.SerializerMethodField()
    requester_name = serializers.CharField(source='source_request.requester.get_full_name', read_only=True)

    class Meta:
        model = BookLoan
        fields = ['id', 'book', 'book_title', 'borrower', 'borrower_name', 'issued_date',
                  'due_date', 'status', 'days_overdue', 'fine_amount', 'fine_paid', 'requester_name']

    def get_days_overdue(self, obj):
        return obj.days_overdue() if obj.is_overdue() else 0


class IssueLoanSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookLoan
        fields = ['book', 'borrower', 'due_date']

    def validate(self, attrs):
        request = self.context.get('request')
        book = attrs['book']
        borrower = attrs['borrower']
        if borrower.school_id != book.school_id:
            raise serializers.ValidationError({'borrower': 'Borrower must belong to the same school as the library book.'})
        if borrower.role == 'PARENT':
            raise serializers.ValidationError({'borrower': 'Parents do not have direct library borrowing access.'})
        return attrs

    def create(self, validated_data):
        book = validated_data['book']
        if book.available_copies < 1:
            raise serializers.ValidationError("Book is not available")
        loan = BookLoan.objects.create(**validated_data)
        book.available_copies -= 1
        book.save()
        return loan


class ReturnLoanSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookLoan
        fields = ['returned_date', 'notes']

    def update(self, instance, validated_data):
        instance.returned_date = validated_data.get('returned_date', timezone.now().date())
        instance.notes = validated_data.get('notes', instance.notes)
        instance.status = 'Returned'
        instance.fine_amount = instance.calculate_fine()
        instance.save()

        book = instance.book
        book.available_copies += 1
        book.save()

        return instance


class LibraryStatsSerializer(serializers.Serializer):
    total_books = serializers.IntegerField()
    available_books = serializers.IntegerField(required=False)
    active_loans = serializers.IntegerField(required=False)
    loans_today = serializers.IntegerField()
    overdue_loans = serializers.IntegerField()
    low_stock_books = serializers.IntegerField()
    total_students = serializers.IntegerField()
    pending_requests = serializers.IntegerField(required=False)


class BookRequestSerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source='book.title', read_only=True)
    requester_name = serializers.CharField(source='requester.get_full_name', read_only=True)
    requester_role = serializers.CharField(source='requester.role', read_only=True)
    reviewer_name = serializers.CharField(source='reviewed_by.get_full_name', read_only=True)
    digital_copy_url = serializers.CharField(source='book.digital_copy_url', read_only=True)

    class Meta:
        model = BookRequest
        fields = [
            'id',
            'book',
            'book_title',
            'requester',
            'requester_name',
            'requester_role',
            'request_type',
            'status',
            'note',
            'review_note',
            'reviewed_by',
            'reviewer_name',
            'approved_at',
            'fulfilled_at',
            'loan',
            'digital_copy_url',
            'created_at',
            'updated_at',
        ]


class BookRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookRequest
        fields = ['book', 'request_type', 'note']

    def validate(self, attrs):
        request = self.context['request']
        book = attrs['book']
        if request.user.role == 'PARENT':
            raise serializers.ValidationError({'request_type': 'Parents do not have direct access to the school library portal.'})
        if request.user.school_id != book.school_id:
            raise serializers.ValidationError({'book': 'You can only request books from your school library.'})
        if attrs['request_type'] == 'soft_copy' and not book.digital_copy_url:
            raise serializers.ValidationError({'request_type': 'This book is not available as a soft copy.'})
        return attrs


class BookRequestReviewSerializer(serializers.ModelSerializer):
    due_date = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = BookRequest
        fields = ['review_note', 'due_date']

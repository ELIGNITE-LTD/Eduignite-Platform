from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Sum, Q
from django.utils import timezone
from rest_framework import serializers

from .ledger import apply_school_fee_status, sync_class_fee_assignment_records
from .models import (
    FeeStructure,
    Payment,
    Invoice,
    SchoolFeeAssignment,
    StudentSchoolFeeRecord,
)


User = get_user_model()


class FeeStructureSerializer(serializers.ModelSerializer):
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    # A fee can target a sub-school directly, or inherit it from the chosen class.
    sub_school_name = serializers.SerializerMethodField()

    class Meta:
        model = FeeStructure
        fields = [
            'id', 'school', 'name', 'role', 'sub_school', 'school_class', 'school_class_name',
            'sub_school_name', 'amount', 'currency', 'academic_year', 'due_date',
            'is_mandatory', 'description', 'created'
        ]
        read_only_fields = ['id', 'created']
        extra_kwargs = {
            'role': {'required': False},
            'sub_school': {'required': False, 'allow_null': True},
            'academic_year': {'required': False},
        }

    def get_sub_school_name(self, obj):
        if obj.sub_school_id:
            return obj.sub_school.name
        if obj.school_class_id and obj.school_class.sub_school_id:
            return obj.school_class.sub_school.name
        return None

    def validate_school_class(self, value):
        request = self.context.get('request')
        if value and request and request.user.school_id and value.school_id != request.user.school_id:
            raise serializers.ValidationError('Choose a class that belongs to your school.')
        return value

    def validate_sub_school(self, value):
        request = self.context.get('request')
        if value and request and request.user.school_id and value.school_id != request.user.school_id:
            raise serializers.ValidationError('Choose a sub-school that belongs to your school.')
        return value

    def validate(self, attrs):
        # Fee types are always student-facing charges in the bursar workflow.
        role = attrs.get('role') or getattr(self.instance, 'role', None) or 'STUDENT'
        attrs['role'] = role
        school_class = attrs.get('school_class', getattr(self.instance, 'school_class', None))
        sub_school = attrs.get('sub_school', getattr(self.instance, 'sub_school', None))
        # Keep the sub_school consistent with the chosen class so the my_fees
        # applicability check (sub_school AND class) never contradicts itself.
        if school_class is not None and school_class.sub_school_id:
            attrs['sub_school'] = school_class.sub_school
        elif sub_school is not None:
            attrs['sub_school'] = sub_school
        if not (attrs.get('academic_year') or getattr(self.instance, 'academic_year', None)):
            request = self.context.get('request')
            school = getattr(getattr(request, 'user', None), 'school', None)
            year = ''
            try:
                year = school.settings.academic_year
            except Exception:
                year = ''
            attrs['academic_year'] = year or str(timezone.now().year)
        return attrs


class InvoiceSerializer(serializers.ModelSerializer):
    payment_reference = serializers.CharField(source='payment.reference_number', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'payment', 'payment_reference', 'invoice_number', 'issued_at',
            'issued_by', 'pdf_file'
        ]
        read_only_fields = ['id', 'invoice_number', 'issued_at']


class PaymentListSerializer(serializers.ModelSerializer):
    payer_name = serializers.CharField(source='payer.get_full_name', read_only=True)
    fee_name = serializers.CharField(source='fee_structure.name', read_only=True, allow_null=True)
    bursar_name = serializers.CharField(source='bursar.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = Payment
        fields = [
            'id', 'reference_number', 'payer', 'payer_name', 'fee_name', 'amount',
            'currency', 'payment_method', 'status', 'payment_date', 'created', 'bursar_name'
        ]
        read_only_fields = ['id', 'reference_number', 'created']


class PaymentDetailSerializer(serializers.ModelSerializer):
    payer_name = serializers.CharField(source='payer.get_full_name', read_only=True)
    bursar_name = serializers.CharField(source='bursar.get_full_name', read_only=True, allow_null=True)
    fee_structure_detail = FeeStructureSerializer(source='fee_structure', read_only=True)
    invoice = InvoiceSerializer(read_only=True)

    # Everything a printed fee receipt has to show. Sourced from the records
    # already linked to the payment, so a receipt never has to be told what
    # school, student or year it belongs to.
    payer_matricule = serializers.SerializerMethodField()
    payer_class = serializers.SerializerMethodField()
    academic_year = serializers.SerializerMethodField()
    school_name = serializers.CharField(source='school.name', read_only=True)
    school_motto = serializers.CharField(source='school.motto', read_only=True)
    # The school's crest, drawn in the official header of the printed receipt.
    school_logo = serializers.CharField(source='school.logo', read_only=True, allow_null=True)
    school_address = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            'id', 'reference_number', 'payer', 'payer_name', 'fee_structure', 'fee_structure_detail',
            'bursar', 'bursar_name', 'amount', 'currency', 'payment_method', 'status',
            'payment_date', 'confirmed_at', 'receipt_number', 'notes', 'invoice', 'created', 'modified',
            'payer_matricule', 'payer_class', 'academic_year',
            'school_name', 'school_motto', 'school_logo', 'school_address',
        ]
        read_only_fields = ['id', 'reference_number', 'confirmed_at', 'receipt_number', 'created', 'modified']

    def get_payer_matricule(self, obj):
        return getattr(obj.payer, 'matricule', '') or ''

    def get_payer_class(self, obj):
        profile = getattr(obj.payer, 'student_profile', None)
        return getattr(profile, 'student_class', '') or ''

    def get_academic_year(self, obj):
        """The fee's own year when it has one, otherwise the school's current year."""
        year = getattr(obj.fee_structure, 'academic_year', '') or ''
        if year:
            return year
        current = obj.school.academic_years.filter(is_current=True).values_list('name', flat=True).first()
        return current or ''

    def get_school_address(self, obj):
        school = obj.school
        parts = [getattr(school, 'address', ''), getattr(school, 'city_village', '')]
        return ', '.join(p.strip() for p in parts if (p or '').strip())


class PaymentCreateSerializer(serializers.ModelSerializer):
    license_beneficiary = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.none(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    mark_license_paid = serializers.BooleanField(required=False, default=False, write_only=True)

    class Meta:
        model = Payment
        fields = [
            'payer', 'fee_structure', 'amount', 'currency', 'payment_method',
            'payment_date', 'notes', 'license_beneficiary', 'mark_license_paid'
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['license_beneficiary'].queryset = User.objects.filter(role='STUDENT')

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than 0.")
        return value

    def validate(self, attrs):
        beneficiary = attrs.get('license_beneficiary')
        should_mark_paid = attrs.get('mark_license_paid')
        payer = attrs.get('payer')
        request = self.context.get('request')
        requester = getattr(request, 'user', None)
        requester_school = getattr(requester, 'school', None)

        if not payer and request and requester and requester.is_authenticated:
            attrs['payer'] = requester
            payer = requester

        if beneficiary and requester_school and beneficiary.school_id != requester_school.id:
            raise serializers.ValidationError({'license_beneficiary': 'The selected student must belong to your school.'})

        # Bursars and administrators may settle a student's platform charge on
        # their behalf. Non-financial staff (teachers, librarians) still cannot.
        FINANCIAL_STAFF_ROLES = ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']
        if should_mark_paid and requester and requester.role in ['TEACHER', 'LIBRARIAN']:
            raise serializers.ValidationError({'mark_license_paid': 'Only bursars and administrators can settle platform charges.'})

        if should_mark_paid and not beneficiary:
            if requester and requester.role in FINANCIAL_STAFF_ROLES:
                # Staff must target a specific student when settling a platform charge.
                if not payer or getattr(payer, 'role', None) != 'STUDENT':
                    raise serializers.ValidationError({'license_beneficiary': 'Select the student whose platform charge is being paid.'})
                attrs['license_beneficiary'] = payer
            else:
                attrs['license_beneficiary'] = payer

        beneficiary = attrs.get('license_beneficiary')
        if attrs.get('mark_license_paid') and beneficiary and beneficiary.role != 'STUDENT':
            raise serializers.ValidationError({'license_beneficiary': 'Platform charge payments can only be attached to student accounts.'})
        return attrs

    def create(self, validated_data):
        beneficiary = validated_data.pop('license_beneficiary', None)
        should_mark_paid = validated_data.pop('mark_license_paid', False)
        payment = Payment.objects.create(**validated_data)
        if should_mark_paid and beneficiary:
            # Settling the platform charge activates the student account even if
            # the student has not activated it themselves yet.
            beneficiary.is_license_paid = True
            beneficiary.is_active = True
            beneficiary.save(update_fields=['is_license_paid', 'is_active'])
        return payment


class PaymentConfirmSerializer(serializers.Serializer):
    receipt_number = serializers.CharField(max_length=100, required=False)
    confirmation_notes = serializers.CharField(max_length=500, required=False)

    def validate_receipt_number(self, value):
        if Invoice.objects.filter(payment__receipt_number=value).exists():
            raise serializers.ValidationError("This receipt number is already in use.")
        return value


class RevenueReportSerializer(serializers.Serializer):
    total_collected = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_pending = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_rejected = serializers.DecimalField(max_digits=12, decimal_places=2)
    period = serializers.CharField()
    by_method = serializers.DictField(child=serializers.DecimalField(max_digits=12, decimal_places=2))
    by_fee_type = serializers.DictField(child=serializers.DecimalField(max_digits=12, decimal_places=2))
    payment_count = serializers.IntegerField()


class FeeComplianceSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    user_name = serializers.CharField()
    total_owed = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_paid = serializers.DecimalField(max_digits=12, decimal_places=2)
    pending_payments = serializers.IntegerField()
    paid_payments = serializers.IntegerField()
    compliance_percentage = serializers.DecimalField(max_digits=5, decimal_places=2)


class SchoolFeeAssignmentSerializer(serializers.ModelSerializer):
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    sub_school_id = serializers.UUIDField(source='school_class.sub_school_id', read_only=True)
    sub_school_name = serializers.CharField(source='school_class.sub_school.name', read_only=True)
    student_count = serializers.SerializerMethodField()
    total_expected = serializers.SerializerMethodField()
    total_collected = serializers.SerializerMethodField()
    total_outstanding = serializers.SerializerMethodField()
    paid_students = serializers.SerializerMethodField()
    incomplete_students = serializers.SerializerMethodField()
    unpaid_students = serializers.SerializerMethodField()

    class Meta:
        model = SchoolFeeAssignment
        fields = [
            'id',
            'school',
            'school_class',
            'school_class_name',
            'sub_school_id',
            'sub_school_name',
            'academic_year',
            'amount',
            'currency',
            'notes',
            'is_active',
            'student_count',
            'total_expected',
            'total_collected',
            'total_outstanding',
            'paid_students',
            'incomplete_students',
            'unpaid_students',
            'created',
            'modified',
        ]
        read_only_fields = [
            'id',
            'school',
            'school_class_name',
            'sub_school_id',
            'sub_school_name',
            'student_count',
            'total_expected',
            'total_collected',
            'total_outstanding',
            'paid_students',
            'incomplete_students',
            'unpaid_students',
            'created',
            'modified',
        ]

    def validate_school_class(self, value):
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        if school and value.school_id != school.id:
            raise serializers.ValidationError('Selected class must belong to your school.')
        return value

    def validate_amount(self, value):
        if value < Decimal('0.00'):
            raise serializers.ValidationError('School fees amount cannot be negative.')
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        academic_year = (attrs.get('academic_year') or '').strip()
        if not academic_year and school:
            try:
                academic_year = school.settings.academic_year
            except Exception:
                academic_year = ''
        if not academic_year:
            academic_year = str(timezone.now().year)
        attrs['academic_year'] = academic_year
        school_class = attrs.get('school_class') or getattr(self.instance, 'school_class', None)
        if school_class:
            duplicate_qs = SchoolFeeAssignment.objects.filter(
                school_class=school_class,
                academic_year=academic_year,
            )
            if self.instance:
                duplicate_qs = duplicate_qs.exclude(pk=self.instance.pk)
            if duplicate_qs.exists():
                raise serializers.ValidationError({
                    'school_class': 'A school-fee plan already exists for this class and academic year.',
                })
        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        assignment = SchoolFeeAssignment.objects.create(
            school=request.user.school,
            created_by=request.user,
            updated_by=request.user,
            **validated_data,
        )
        sync_class_fee_assignment_records(assignment)
        return assignment

    def update(self, instance, validated_data):
        request = self.context.get('request')
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if request and request.user.is_authenticated:
            instance.updated_by = request.user
        instance.save()
        sync_class_fee_assignment_records(instance)
        return instance

    def _records(self, obj):
        return obj.student_records.filter(is_active=True)

    # Each of these prefers the queryset annotation SchoolFeeAssignmentViewSet
    # sets up (ann_*), which covers a whole page in the base query instead of
    # 7 extra round trips per row. hasattr(), not a truthiness/None check --
    # Sum() over zero matching rows annotates None, which is a valid "0", not
    # "not annotated". Falls back to the original per-instance query for a
    # serializer instance created outside that queryset (e.g. serializer.save()
    # returning an un-refetched instance).
    def get_student_count(self, obj):
        if hasattr(obj, 'ann_student_count'):
            return obj.ann_student_count
        return self._records(obj).count()

    def get_total_expected(self, obj):
        return obj.amount * self.get_student_count(obj)

    def get_total_collected(self, obj):
        if hasattr(obj, 'ann_total_collected'):
            return obj.ann_total_collected or Decimal('0.00')
        return self._records(obj).aggregate(total=Sum('amount_paid')).get('total') or Decimal('0.00')

    def get_total_outstanding(self, obj):
        if hasattr(obj, 'ann_total_outstanding'):
            return obj.ann_total_outstanding or Decimal('0.00')
        return self._records(obj).aggregate(total=Sum('balance')).get('total') or Decimal('0.00')

    def get_paid_students(self, obj):
        if hasattr(obj, 'ann_paid_students'):
            return obj.ann_paid_students
        return self._records(obj).filter(status=StudentSchoolFeeRecord.STATUS_PAID).count()

    def get_incomplete_students(self, obj):
        if hasattr(obj, 'ann_incomplete_students'):
            return obj.ann_incomplete_students
        return self._records(obj).filter(status=StudentSchoolFeeRecord.STATUS_INCOMPLETE).count()

    def get_unpaid_students(self, obj):
        if hasattr(obj, 'ann_unpaid_students'):
            return obj.ann_unpaid_students
        return self._records(obj).filter(status=StudentSchoolFeeRecord.STATUS_UNPAID).count()


class StudentSchoolFeeRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.user.get_full_name', read_only=True)
    student_email = serializers.CharField(source='student.user.email', read_only=True)
    student_matricule = serializers.CharField(source='student.user.matricule', read_only=True)
    admission_number = serializers.CharField(source='student.admission_number', read_only=True)
    class_name = serializers.CharField(source='fee_assignment.school_class.name', read_only=True)
    class_id = serializers.UUIDField(source='fee_assignment.school_class_id', read_only=True)
    sub_school_name = serializers.CharField(source='fee_assignment.school_class.sub_school.name', read_only=True)
    updated_by_name = serializers.CharField(source='updated_by.get_full_name', read_only=True)
    parent_count = serializers.IntegerField(source='student.parent_links.count', read_only=True)

    class Meta:
        model = StudentSchoolFeeRecord
        fields = [
            'id',
            'school',
            'fee_assignment',
            'student',
            'student_name',
            'student_email',
            'student_matricule',
            'admission_number',
            'class_id',
            'class_name',
            'sub_school_name',
            'total_amount',
            'amount_paid',
            'balance',
            'status',
            'notes',
            'is_active',
            'last_recorded_at',
            'updated_by',
            'updated_by_name',
            'parent_count',
            'created',
            'modified',
        ]
        read_only_fields = [
            'id',
            'school',
            'fee_assignment',
            'student',
            'student_name',
            'student_email',
            'student_matricule',
            'admission_number',
            'class_id',
            'class_name',
            'sub_school_name',
            'balance',
            'status',
            'is_active',
            'last_recorded_at',
            'updated_by',
            'updated_by_name',
            'parent_count',
            'created',
            'modified',
        ]


class StudentSchoolFeeRecordUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentSchoolFeeRecord
        fields = ['amount_paid', 'notes']

    def validate_amount_paid(self, value):
        if value < Decimal('0.00'):
            raise serializers.ValidationError('Amount paid cannot be negative.')
        return value

    def validate(self, attrs):
        instance = self.instance
        total_amount = attrs.get('amount_paid', instance.amount_paid)
        if instance and total_amount > instance.total_amount:
            raise serializers.ValidationError({'amount_paid': 'Amount paid cannot be greater than the total school fees for this student.'})
        return attrs

    def update(self, instance, validated_data):
        instance.amount_paid = validated_data.get('amount_paid', instance.amount_paid)
        instance.notes = validated_data.get('notes', instance.notes)
        instance.last_recorded_at = timezone.now()
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            instance.updated_by = request.user
        apply_school_fee_status(instance)
        instance.save()
        return instance


class SchoolFeeSummarySerializer(serializers.Serializer):
    class_count = serializers.IntegerField()
    student_count = serializers.IntegerField()
    total_expected = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_collected = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_outstanding = serializers.DecimalField(max_digits=12, decimal_places=2)
    paid_students = serializers.IntegerField()
    incomplete_students = serializers.IntegerField()
    unpaid_students = serializers.IntegerField()
    collection_rate = serializers.DecimalField(max_digits=7, decimal_places=2)

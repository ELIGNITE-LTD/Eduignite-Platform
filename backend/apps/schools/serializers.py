from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from decimal import Decimal
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_serializer, OpenApiExample
import re
from apps.grades.models import Subject, ClassSubject
from apps.users.models import UserRole
from .relations import resolve_school_class
from .models import School, SchoolSettings, SubSchool, SchoolClass, TimetableEntry

User = get_user_model()
TEACHING_STAFF_ROLES = ['TEACHER', 'SUB_ADMIN', 'SCHOOL_ADMIN']


def _live_student_count(obj):
    annotated = getattr(obj, 'live_student_count', None)
    if annotated is not None:
        return annotated
    return obj.students.count()


def _live_teacher_count(obj):
    annotated = getattr(obj, 'live_teacher_count', None)
    if annotated is not None:
        return annotated
    return obj.users.filter(role=UserRole.TEACHER).count()


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'School List Item',
            value={
                'id': 'GBHS-D',
                'name': 'Government Bilingual High School Douala',
                'short_name': 'GBHS-D',
                'location': 'Douala',
                'status': 'Active',
                'student_count': 450,
                'teacher_count': 35,
                'logo': 'https://example.com/logos/gbhs-d.jpg',
            },
        ),
    ]
)
class SchoolListSerializer(serializers.ModelSerializer):
    """Serializer for school list view."""

    student_count = serializers.SerializerMethodField()
    teacher_count = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()

    def get_subscription(self, obj):
        from apps.platform.access import school_subscription_state

        return {
            'status': obj.subscription_status,
            'effective_state': school_subscription_state(obj),
            'amount': float(obj.subscription_amount or 0),
            'currency': obj.subscription_currency,
            'free_until': obj.subscription_free_until.isoformat() if obj.subscription_free_until else None,
            'expires_on': obj.subscription_expires_on.isoformat() if obj.subscription_expires_on else None,
        }

    class Meta:
        model = School
        fields = [
            'id',
            'name',
            'short_name',
            'principal',
            'email',
            'phone',
            'location',
            'region',
            'division',
            'school_type',
            'subsystem',
            'status',
            'subscription',
            'student_count',
            'teacher_count',
            'logo',
            'matricule',
            'is_drafted',
            'drafted_at',
            'draft_delete_after',
            'draft_reason',
            'draft_reminder_count',
        ]

    def get_student_count(self, obj):
        return _live_student_count(obj)

    def get_teacher_count(self, obj):
        return _live_teacher_count(obj)


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'School Public Search Result',
            value={
                'id': 'GBHS-D',
                'name': 'Government Bilingual High School Douala',
                'shortName': 'GBHS-D',
                'matricule': 'GBHS0125',
                'region_or_town': 'Littoral',
            },
        ),
    ]
)
class SchoolPublicSearchSerializer(serializers.ModelSerializer):
    """
    Deliberately narrow, unauthenticated-safe serializer for the public school
    search endpoint (used by the offline installer wizard before a technician
    has any login credentials). Exposes only a school's own public identity —
    the same handful of facts you'd see on a business's public listing — never
    principal contact details, financial/subscription data, counts, logos, or
    any field that belongs to a *person* rather than the school itself.

    Keep this serializer's field list frozen to exactly these five keys. If a
    future change to SchoolListSerializer/SchoolDetailSerializer adds a new
    field, it must NOT leak here automatically (that's the whole point of a
    dedicated serializer instead of reusing/relaxing an internal one).
    """

    shortName = serializers.CharField(source='short_name', read_only=True)
    region_or_town = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = ['id', 'name', 'shortName', 'matricule', 'region_or_town']

    def get_region_or_town(self, obj):
        return obj.region or obj.city_village or obj.division or obj.sub_division or ''


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'School Detail',
            value={
                'id': 'GBHS-D',
                'name': 'Government Bilingual High School Douala',
                'short_name': 'GBHS-D',
                'principal': 'Mr. John Nkongho',
                'motto': 'Excellence and Integrity',
                'logo': 'https://example.com/logos/gbhs-d.jpg',
                'banner': 'https://example.com/banners/gbhs-d.jpg',
                'description': 'A leading secondary school in Douala',
                'location': 'Douala',
                'region': 'Littoral',
                'division': 'Douala Division',
                'sub_division': 'Douala',
                'city_village': 'Douala',
                'address': 'Akwa District',
                'postal_code': '00237',
                'phone': '+237670123456',
                'email': 'gbhs@example.com',
                'status': 'Active',
                'founded_year': 1995,
                'student_count': 450,
                'teacher_count': 35,
                'settings': {
                    'licence_expiry': '2025-12-31',
                    'max_students': 500,
                    'max_teachers': 50,
                    'academic_year': '2024-2025',
                    'term': 'First',
                    'allow_ai_features': True,
                    'ai_request_limit': 1000,
                },
            },
        ),
    ]
)
class SchoolDetailSerializer(serializers.ModelSerializer):
    """Serializer for school detail view with settings."""

    settings = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()
    teacher_count = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = [
            'id',
            'name',
            'short_name',
            'principal',
            'motto',
            'logo',
            'banner',
            'description',
            'location',
            'region',
            'division',
            'sub_division',
            'city_village',
            'address',
            'postal_code',
            'phone',
            'email',
            'status',
            'founded_year',
            'student_count',
            'teacher_count',
            'matricule',
            'settings',
            'is_drafted',
            'drafted_at',
            'draft_delete_after',
            'draft_reason',
            'draft_reminder_count',
            'created_at',
            'updated_at',
        ]

    def get_settings(self, obj):
        """Return school settings if they exist."""
        try:
            settings = obj.settings
            return SchoolSettingsSerializer(settings).data
        except SchoolSettings.DoesNotExist:
            return None

    def get_student_count(self, obj):
        return _live_student_count(obj)

    def get_teacher_count(self, obj):
        return _live_teacher_count(obj)


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Create School',
            value={
                'id': 'GBHS-D',
                'name': 'Government Bilingual High School Douala',
                'short_name': 'GBHS-D',
                'principal': 'Mr. John Nkongho',
                'location': 'Douala',
                'region': 'Littoral',
                'division': 'Douala Division',
                'sub_division': 'Douala',
                'city_village': 'Douala',
                'address': 'Akwa District',
                'phone': '+237670123456',
                'email': 'gbhs@example.com',
            },
        ),
    ]
)
class SchoolCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating schools with validation.

    ``matricule`` is auto-generated from the school name and returned in
    the response so the principal can use it to activate the school account.
    ``id`` is optional: when omitted it falls back to the uppercased short_name.
    """

    matricule = serializers.CharField(read_only=True)
    phone = serializers.CharField(max_length=20)

    class Meta:
        model = School
        fields = [
            'id',
            'name',
            'short_name',
            'principal',
            'motto',
            'logo',
            'banner',
            'description',
            'location',
            'school_type',
            'subsystem',
            'region',
            'division',
            'sub_division',
            'city_village',
            'address',
            'postal_code',
            'phone',
            'email',
            'status',
            'founded_year',
            'matricule',
        ]
        extra_kwargs = {
            'id': {'required': False, 'allow_blank': True},
        }

    def validate_id(self, value):
        """Validate and normalise the optional school ID."""
        if value:
            value = re.sub(r'[^A-Za-z0-9_-]+', '-', value.strip().upper()).strip('-')
        if value and len(value) > 50:
            raise serializers.ValidationError('School ID cannot exceed 50 characters.')
        return value

    def validate(self, attrs):
        # Auto-derive id from short_name when not supplied
        if not attrs.get('id'):
            short_name = attrs.get('short_name', '')
            raw_id = short_name.strip() or attrs['name'][:50]
            attrs['id'] = re.sub(r'[^A-Za-z0-9_-]+', '-', raw_id.upper()).strip('-')
        if attrs.get('short_name'):
            attrs['short_name'] = attrs['short_name'].strip().upper()
        if attrs.get('phone'):
            attrs['phone'] = re.sub(r'[\s().-]+', '', attrs['phone'].strip())
        email = attrs.get('email')
        duplicate_user = User.objects.filter(email=email).first() if email else None
        if duplicate_user and not (
            duplicate_user.role == 'SCHOOL_ADMIN'
            and not duplicate_user.school_id
        ):
            raise serializers.ValidationError(
                {'email': 'This email is already used by another account.'}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        school = School.objects.create(**validated_data)

        principal_user = User.objects.filter(email=school.email).first()
        if principal_user:
            principal_user.matricule = school.matricule
            principal_user.name = school.principal
            principal_user.role = 'SCHOOL_ADMIN'
            principal_user.school = school
            principal_user.is_active = True
            principal_user.set_password('!pending_activation')
            principal_user.save(update_fields=['matricule', 'name', 'role', 'school', 'is_active', 'password'])
        else:
            principal_user = User.objects.create_user(
                matricule=school.matricule,
                name=school.principal,
                email=school.email,
                role='SCHOOL_ADMIN',
                password='!pending_activation',
                school=school,
                is_active=True,
                is_license_paid=False,
            )

        school.principal_user = principal_user
        school.save(update_fields=['principal_user'])

        SchoolSettings.objects.get_or_create(school=school)
        return school


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Update School',
            value={
                'name': 'Government Bilingual High School Douala',
                'principal': 'Mr. John Nkongho',
                'status': 'Active',
            },
        ),
    ]
)
class SchoolUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating schools."""

    phone = serializers.CharField(max_length=20, required=False)

    class Meta:
        model = School
        fields = [
            'name',
            'short_name',
            'principal',
            'motto',
            'logo',
            'banner',
            'description',
            'location',
            'region',
            'division',
            'sub_division',
            'city_village',
            'address',
            'postal_code',
            'phone',
            'email',
            'status',
            'founded_year',
        ]

    def validate_email(self, value):
        school = self.instance
        principal_user_id = getattr(school.principal_user, 'id', None) if school else None
        duplicate_user = User.objects.filter(email=value)
        if principal_user_id:
            duplicate_user = duplicate_user.exclude(id=principal_user_id)
        if duplicate_user.exists():
            raise serializers.ValidationError('This email is already used by another account.')
        return value

    def validate_phone(self, value):
        return re.sub(r'[\s().-]+', '', value.strip()) if value else value

    @transaction.atomic
    def update(self, instance, validated_data):
        school = super().update(instance, validated_data)
        principal_user = school.principal_user

        if principal_user:
            updated_fields = []

            if principal_user.name != school.principal:
                principal_user.name = school.principal
                updated_fields.append('name')

            if principal_user.email != school.email:
                principal_user.email = school.email
                updated_fields.append('email')

            if principal_user.school_id != school.id:
                principal_user.school = school
                updated_fields.append('school')

            if updated_fields:
                principal_user.save(update_fields=updated_fields)

        SchoolSettings.objects.get_or_create(school=school)
        return school


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'School Settings',
            value={
                'licence_expiry': '2025-12-31',
                'max_students': 500,
                'max_teachers': 50,
                'academic_year': '2024-2025',
                'term': 'First',
                'allow_ai_features': True,
                'ai_request_limit': 1000,
            },
        ),
    ]
)
class SchoolSettingsSerializer(serializers.ModelSerializer):
    """Serializer for school settings."""

    class Meta:
        model = SchoolSettings
        fields = [
            'school',
            'licence_expiry',
            'max_students',
            'max_teachers',
            'academic_year',
            'term',
            'allow_ai_features',
            'ai_request_limit',
            'class_masters_can_edit_students',
            'honour_roll_threshold',
            'promotion_average',
            'dismissal_average',
            'sections',
            'class_levels',
            'departments',
            'streams',
        ]


class HierarchyStaffSerializer(serializers.ModelSerializer):
    profile_image = serializers.CharField(source='avatar', read_only=True)
    sub_school_name = serializers.CharField(source='sub_school.name', read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'name',
            'matricule',
            'email',
            'role',
            'profile_image',
            'sub_school',
            'sub_school_name',
        ]


class SubSchoolSerializer(serializers.ModelSerializer):
    vice_principal_user = serializers.SerializerMethodField()
    classes = serializers.SerializerMethodField()
    vice_principal_name = serializers.CharField(source='vice_principal.name', read_only=True)
    vice_principal_avatar = serializers.CharField(source='vice_principal.avatar', read_only=True)
    total_classes = serializers.SerializerMethodField()
    total_staff = serializers.SerializerMethodField()
    total_subjects = serializers.SerializerMethodField()

    class Meta:
        model = SubSchool
        fields = [
            'id',
            'school',
            'name',
            'is_system_managed',
            'vice_principal',
            'vice_principal_user',
            'vice_principal_name',
            'vice_principal_avatar',
            'classes',
            'total_classes',
            'total_staff',
            'total_subjects',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'school', 'is_system_managed', 'created_at', 'updated_at']

    def validate_name(self, value):
        normalized = (value or '').strip()
        if not normalized:
            raise serializers.ValidationError('Sub-school name is required.')
        school = self.context.get('school') or getattr(self.instance, 'school', None)
        if school:
            queryset = SubSchool.objects.filter(school=school, name__iexact=normalized)
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError('A sub-school with this name already exists for this school.')
        return normalized

    def validate_vice_principal(self, value):
        if not value:
            return value
        school = self.context.get('school') or getattr(self.instance, 'school', None)
        if school and value.school_id != school.id:
            raise serializers.ValidationError('Vice principal must belong to this school.')
        if value.role not in {'SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN'}:
            raise serializers.ValidationError('Vice principal must be selected from school staff.')
        return value

    def get_total_classes(self, obj):
        return getattr(obj, 'total_classes', obj.classes.count())

    def get_vice_principal_user(self, obj):
        if not obj.vice_principal_id:
            return None
        return HierarchyStaffSerializer(obj.vice_principal).data

    def get_classes(self, obj):
        classes = getattr(obj, 'prefetched_classes', None)
        if classes is None:
            classes = obj.classes.select_related('class_master').order_by('name')
        return [
            {
                'id': str(school_class.id),
                'name': school_class.name,
                'class_master': str(school_class.class_master_id) if school_class.class_master_id else None,
                'class_master_name': school_class.class_master.name if school_class.class_master_id else '',
                'total_students': getattr(school_class, 'total_students', school_class.students.count()),
            }
            for school_class in classes
        ]

    def get_total_staff(self, obj):
        return getattr(obj, 'total_staff', obj.staff_members.count())

    def get_total_subjects(self, obj):
        annotated = getattr(obj, 'total_subjects', None)
        if annotated is not None:
            return annotated
        return ClassSubject.objects.filter(school_class__sub_school=obj).values('subject').distinct().count()


class SubAdminAssignmentSerializer(serializers.Serializer):
    staff = serializers.PrimaryKeyRelatedField(queryset=User.objects.none())
    sub_school = serializers.PrimaryKeyRelatedField(queryset=SubSchool.objects.none())
    id = serializers.UUIDField(source='staff.id', read_only=True)
    name = serializers.CharField(source='staff.name', read_only=True)
    matricule = serializers.CharField(source='staff.matricule', read_only=True)
    profile_image = serializers.CharField(source='staff.avatar', read_only=True)
    assigned_sub_school_name = serializers.CharField(source='sub_school.name', read_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        school = self.context.get('school')
        if school:
            staff_queryset = User.objects.filter(
                school=school,
                role__in=['SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN'],
            ).order_by('name')
            self.fields['staff'].queryset = staff_queryset
            self.fields['sub_school'].queryset = SubSchool.objects.filter(school=school).order_by('name')

    def validate(self, attrs):
        school = self.context['school']
        staff = attrs['staff']
        sub_school = attrs['sub_school']
        if staff.school_id != school.id:
            raise serializers.ValidationError({'staff': 'Selected staff must belong to this school.'})
        if sub_school.school_id != school.id:
            raise serializers.ValidationError({'sub_school': 'Selected sub school must belong to this school.'})
        return attrs

    def create(self, validated_data):
        staff = validated_data['staff']
        if staff.role != UserRole.SUB_ADMIN:
            staff.previous_role = staff.role
        staff.role = 'SUB_ADMIN'
        staff.sub_school = validated_data['sub_school']
        staff.is_staff = True
        staff.save(update_fields=['role', 'previous_role', 'sub_school', 'is_staff'])
        return {'staff': staff, 'sub_school': staff.sub_school}

    def update(self, instance, validated_data):
        staff = instance
        if staff.role != UserRole.SUB_ADMIN:
            staff.previous_role = staff.role
        staff.role = 'SUB_ADMIN'
        staff.sub_school = validated_data['sub_school']
        staff.is_staff = True
        staff.save(update_fields=['role', 'previous_role', 'sub_school', 'is_staff'])
        return {'staff': staff, 'sub_school': staff.sub_school}


class SchoolClassSerializer(serializers.ModelSerializer):
    sub_school_name = serializers.CharField(source='sub_school.name', read_only=True)
    class_master_name = serializers.CharField(source='class_master.name', read_only=True)
    total_subjects = serializers.SerializerMethodField()
    total_teachers = serializers.SerializerMethodField()
    total_students = serializers.SerializerMethodField()

    class Meta:
        model = SchoolClass
        fields = [
            'id',
            'school',
            'name',
            'cycle',
            'sub_school',
            'sub_school_name',
            'class_master',
            'class_master_name',
            'total_subjects',
            'total_teachers',
            'total_students',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'school', 'created_at', 'updated_at']

    def validate(self, attrs):
        school = self.context.get('school') or getattr(self.instance, 'school', None)
        sub_school = attrs.get('sub_school') or getattr(self.instance, 'sub_school', None)
        class_master = attrs.get('class_master') or getattr(self.instance, 'class_master', None)

        if sub_school and school and sub_school.school_id != school.id:
            raise serializers.ValidationError({'sub_school': 'Sub school must belong to this school.'})
        if school and school.sub_schools.exists() and not sub_school:
            raise serializers.ValidationError({'sub_school': 'Select one of the auto-generated sub-schools for this class.'})
        if class_master and school:
            if class_master.school_id != school.id:
                raise serializers.ValidationError({'class_master': 'Class master must belong to this school.'})
            if class_master.role not in {'TEACHER', 'SUB_ADMIN', 'SCHOOL_ADMIN'}:
                raise serializers.ValidationError({'class_master': 'Class master must be selected from school staff.'})
        return attrs

    def get_total_subjects(self, obj):
        return getattr(obj, 'total_subjects', obj.class_subjects.count())

    def get_total_teachers(self, obj):
        annotated = getattr(obj, 'total_teachers', None)
        if annotated is not None:
            return annotated
        return obj.class_subjects.exclude(teacher__isnull=True).values('teacher').distinct().count()

    def get_total_students(self, obj):
        return getattr(obj, 'total_students', obj.students.count())


class SchoolClassExploreSerializer(SchoolClassSerializer):
    teachers = serializers.SerializerMethodField()
    students = serializers.SerializerMethodField()
    subjects = serializers.SerializerMethodField()

    class Meta(SchoolClassSerializer.Meta):
        fields = SchoolClassSerializer.Meta.fields + ['teachers', 'students', 'subjects']

    def get_teachers(self, obj):
        teachers = User.objects.filter(class_subject_links__school_class=obj).distinct().order_by('name')
        return HierarchyStaffSerializer(teachers, many=True).data

    def get_students(self, obj):
        return [
            {
                'id': str(student.id),
                'name': student.user.get_full_name(),
                'matricule': student.user.matricule,
                'admission_number': student.admission_number,
            }
            for student in obj.students.select_related('user').order_by('user__name')
        ]

    def get_subjects(self, obj):
        return [
            {
                'id': str(link.id),
                'subject_id': str(link.subject_id),
                'subject_name': link.subject.name,
                'teacher_id': str(link.teacher_id) if link.teacher_id else None,
                'teacher_name': link.teacher.get_full_name() if link.teacher_id else None,
                'type': link.type,
            }
            for link in obj.class_subjects.select_related('subject', 'teacher').order_by('subject__name')
        ]


class ClassSubjectSerializer(serializers.ModelSerializer):
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.none(), required=False, allow_null=True)
    class_name = serializers.CharField(source='school_class.name', read_only=True)
    sub_school = serializers.SerializerMethodField()
    subject_name = serializers.CharField(required=False, allow_blank=True)
    subject_code = serializers.CharField(required=False, allow_blank=True, write_only=True)
    coefficient = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal('0.01'), write_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)

    class Meta:
        model = ClassSubject
        fields = [
            'id',
            'school_class',
            'class_name',
            'sub_school',
            'subject',
            'subject_name',
            'subject_code',
            'coefficient',
            'teacher',
            'teacher_name',
            'type',
            'created',
            'modified',
        ]
        read_only_fields = ['id', 'created', 'modified']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        school = self.context.get('school')
        if school:
            self.fields['school_class'].queryset = SchoolClass.objects.filter(school=school).order_by('name')
            self.fields['subject'].queryset = Subject.objects.filter(school=school).order_by('name')
            self.fields['teacher'].queryset = User.objects.filter(
                school=school,
                role__in=TEACHING_STAFF_ROLES,
            ).order_by('name')

    def get_sub_school(self, obj):
        if not obj.school_class.sub_school:
            return None
        return {
            'id': str(obj.school_class.sub_school_id),
            'name': obj.school_class.sub_school.name,
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        subject_name = instance.subject.name if instance.subject_id else ''
        subject_code = instance.subject.code if instance.subject_id else ''
        coefficient = str(instance.subject.coefficient) if instance.subject_id else ''
        teacher_name = instance.teacher.get_full_name() if instance.teacher_id else ''
        data['subject_name'] = subject_name
        data['subject_code'] = subject_code
        data['coefficient'] = coefficient
        data['teacher_name'] = teacher_name
        data['display_name'] = f'{subject_name} ({teacher_name})' if teacher_name else subject_name
        return data

    def validate(self, attrs):
        school = self.context['school']
        school_class = attrs.get('school_class') or getattr(self.instance, 'school_class', None)
        subject = attrs.get('subject') or getattr(self.instance, 'subject', None)
        teacher = attrs.get('teacher') or getattr(self.instance, 'teacher', None)
        subject_name = (attrs.get('subject_name') or '').strip()
        subject_code = self._normalize_subject_code(attrs.get('subject_code'))
        coefficient = attrs.get('coefficient')

        attrs['subject_name'] = subject_name
        attrs['subject_code'] = subject_code

        if school_class and school_class.school_id != school.id:
            raise serializers.ValidationError({'school_class': 'Class must belong to this school.'})
        if subject and subject.school_id != school.id:
            raise serializers.ValidationError({'subject': 'Subject must belong to this school.'})
        if teacher and teacher.school_id != school.id:
            raise serializers.ValidationError({'teacher': 'Teacher must belong to this school.'})
        if teacher and teacher.role not in TEACHING_STAFF_ROLES:
            raise serializers.ValidationError({'teacher': 'Teacher must be selected from academic staff.'})
        if not subject and not subject_name and not subject_code:
            raise serializers.ValidationError({'subject_name': 'Provide a subject name or select an existing subject.'})
        if coefficient is None:
            raise serializers.ValidationError({'coefficient': 'Coefficient is required.'})
        return attrs

    def _build_subject_code(self, name):
        cleaned = re.sub(r'[^A-Za-z0-9]+', ' ', name).strip()
        parts = [part for part in cleaned.split() if part]
        initials = ''.join(part[0].upper() for part in parts[:4])
        return initials or cleaned[:4].upper() or 'SUBJ'

    def _normalize_subject_code(self, value):
        raw = (value or '').strip().upper()
        if not raw:
            return ''
        return re.sub(r'[^A-Z0-9_-]+', '', raw)

    def _resolve_subject(self, school, school_class, validated_data):
        subject = validated_data.get('subject')
        subject_name = (validated_data.pop('subject_name', '') or '').strip()
        subject_code = self._normalize_subject_code(validated_data.pop('subject_code', ''))
        coefficient = validated_data.pop('coefficient', None)
        if subject:
            updates = []
            if coefficient is not None and subject.coefficient != coefficient:
                subject.coefficient = coefficient
                updates.append('coefficient')
            if validated_data.get('teacher') and subject.teacher_id != validated_data.get('teacher').id:
                subject.teacher = validated_data.get('teacher')
                updates.append('teacher')
            if updates:
                subject.save(update_fields=updates)
            return subject

        existing = None
        if subject_code:
            existing = Subject.objects.filter(school=school, code__iexact=subject_code).first()
        if not existing and subject_name:
            existing = Subject.objects.filter(school=school, name__iexact=subject_name).first()
        if existing:
            updates = []
            if coefficient is not None and existing.coefficient != coefficient:
                existing.coefficient = coefficient
                updates.append('coefficient')
            if validated_data.get('teacher') and existing.teacher_id != validated_data.get('teacher').id:
                existing.teacher = validated_data.get('teacher')
                updates.append('teacher')
            if updates:
                existing.save(update_fields=updates)
            return existing

        code_seed = subject_code or self._build_subject_code(subject_name)
        code = code_seed
        counter = 1
        while Subject.objects.filter(school=school, code=code).exists():
            counter += 1
            code = f'{code_seed}{counter}'

        return Subject.objects.create(
            school=school,
            name=subject_name,
            code=code,
            level=school_class.name,
            coefficient=coefficient,
            teacher=validated_data.get('teacher'),
            is_active=True,
        )

    def _sync_subject_metadata(self, subject):
        from apps.grades.relationships import sync_subject_metadata

        sync_subject_metadata(subject)

    def create(self, validated_data):
        school = self.context['school']
        school_class = validated_data['school_class']
        subject = self._resolve_subject(school, school_class, validated_data)
        validated_data['subject'] = subject
        class_subject, _ = ClassSubject.objects.update_or_create(
            school_class=validated_data['school_class'],
            subject=subject,
            defaults={
                'teacher': validated_data.get('teacher'),
                'type': validated_data.get('type', ClassSubject.SubjectType.MANDATORY),
            },
        )
        self._sync_subject_metadata(subject)
        return class_subject

    def update(self, instance, validated_data):
        school = self.context['school']
        school_class = validated_data.get('school_class', instance.school_class)
        if (
            validated_data.get('subject')
            or (validated_data.get('subject_name') or '').strip()
            or self._normalize_subject_code(validated_data.get('subject_code'))
            or 'coefficient' in validated_data
        ):
            validated_data['subject'] = self._resolve_subject(school, school_class, validated_data)
        instance = super().update(instance, validated_data)
        self._sync_subject_metadata(instance.subject)
        return instance


class TimetableEntrySerializer(serializers.ModelSerializer):
    school_class_name = serializers.CharField(source='school_class.name', read_only=True)
    sub_school_name = serializers.CharField(source='sub_school.name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    day_label = serializers.CharField(source='get_day_of_week_display', read_only=True)
    duration_minutes = serializers.SerializerMethodField()

    class Meta:
        model = TimetableEntry
        fields = [
            'id',
            'school',
            'sub_school',
            'sub_school_name',
            'school_class',
            'school_class_name',
            'class_subject',
            'subject',
            'subject_name',
            'subject_code',
            'teacher',
            'teacher_name',
            'academic_year',
            'term',
            'day_of_week',
            'day_label',
            'start_time',
            'end_time',
            'duration_minutes',
            'room',
            'notes',
            'status',
            'published_at',
            'published_by',
            'created_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'school',
            'sub_school',
            'status',
            'published_at',
            'published_by',
            'created_by',
            'created_at',
            'updated_at',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        school = self.context.get('school')
        if school:
            self.fields['school_class'].queryset = SchoolClass.objects.filter(school=school).order_by('name')
            self.fields['class_subject'].queryset = ClassSubject.objects.filter(
                school_class__school=school,
            ).select_related('school_class', 'subject', 'teacher').order_by('school_class__name', 'subject__name')
            self.fields['subject'].queryset = Subject.objects.filter(school=school, is_active=True).order_by('name')
            self.fields['teacher'].queryset = User.objects.filter(
                school=school,
                role__in=TEACHING_STAFF_ROLES,
            ).order_by('name')

    def get_duration_minutes(self, obj):
        start = obj.start_time.hour * 60 + obj.start_time.minute
        end = obj.end_time.hour * 60 + obj.end_time.minute
        return max(end - start, 0)

    def validate(self, attrs):
        school = self.context.get('school') or getattr(self.instance, 'school', None)
        school_class = attrs.get('school_class') or getattr(self.instance, 'school_class', None)
        class_subject = attrs.get('class_subject') or getattr(self.instance, 'class_subject', None)
        subject = attrs.get('subject') or getattr(self.instance, 'subject', None)
        teacher = attrs.get('teacher') or getattr(self.instance, 'teacher', None)
        day_of_week = attrs.get('day_of_week') or getattr(self.instance, 'day_of_week', None)
        start_time = attrs.get('start_time') or getattr(self.instance, 'start_time', None)
        end_time = attrs.get('end_time') or getattr(self.instance, 'end_time', None)
        academic_year = attrs.get('academic_year') or getattr(self.instance, 'academic_year', '')
        term = attrs.get('term') or getattr(self.instance, 'term', '')

        if not school:
            raise serializers.ValidationError({'school': 'No school context was found for this timetable entry.'})
        if not school_class or school_class.school_id != school.id:
            raise serializers.ValidationError({'school_class': 'Select a class registered in this school.'})
        if subject and subject.school_id != school.id:
            raise serializers.ValidationError({'subject': 'Selected subject must belong to this school.'})
        if teacher and teacher.school_id != school.id:
            raise serializers.ValidationError({'teacher': 'Selected teacher must belong to this school.'})
        if teacher and teacher.role not in TEACHING_STAFF_ROLES:
            raise serializers.ValidationError({'teacher': 'Timetable teacher must be selected from academic staff.'})

        if class_subject:
            if class_subject.school_class_id != school_class.id:
                raise serializers.ValidationError({'class_subject': 'Selected class-subject does not belong to this class.'})
            attrs['subject'] = class_subject.subject
            attrs['teacher'] = class_subject.teacher

        if not attrs.get('subject') and not subject:
            raise serializers.ValidationError({'subject': 'Select the subject taught during this period.'})
        if not start_time or not end_time or start_time >= end_time:
            raise serializers.ValidationError({'end_time': 'End time must be after start time.'})

        overlap = TimetableEntry.objects.filter(
            school=school,
            academic_year=academic_year,
            term=term,
            day_of_week=day_of_week,
            start_time__lt=end_time,
            end_time__gt=start_time,
        )
        if self.instance:
            overlap = overlap.exclude(id=self.instance.id)
        if overlap.filter(school_class=school_class).exists():
            raise serializers.ValidationError({'start_time': 'This class already has a timetable period that overlaps this time.'})

        resolved_teacher = attrs.get('teacher') or teacher
        if resolved_teacher and overlap.filter(teacher=resolved_teacher).exists():
            raise serializers.ValidationError({'teacher': 'This teacher is already assigned to another class during this time.'})

        attrs['school'] = school
        attrs['sub_school'] = school_class.sub_school
        return attrs


class SchoolEventSerializer(serializers.ModelSerializer):
    """School events posted by the administration for everyone in the school."""

    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    created_by_avatar = serializers.CharField(source='created_by.avatar', read_only=True)

    class Meta:
        from .models import SchoolEvent

        model = SchoolEvent
        fields = [
            'id', 'title', 'description', 'event_date', 'location', 'image',
            'created_by', 'created_by_name', 'created_by_avatar', 'created_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at']

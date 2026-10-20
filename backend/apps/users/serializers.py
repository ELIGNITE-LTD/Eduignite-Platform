from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from django.db import transaction
from drf_spectacular.utils import extend_schema_serializer, OpenApiExample
from datetime import timedelta
from decimal import Decimal
import logging
import uuid
import re

from .models import FounderProfile, FounderShareAdjustment, FounderAccessLevel
from .matricules import generate_founder_matricule, generate_school_user_matricule
from apps.schools.models import SubSchool, SchoolClass
from apps.grades.models import Subject, ClassSubject

User = get_user_model()
logger = logging.getLogger(__name__)

FOUNDER_MANAGEABLE_ROLES = [
    'SUPER_ADMIN',
    'COO',
    'INV',
    'DESIGNER',
]

PHONE_SEPARATORS = re.compile(r'[\s().-]+')
PHONE_PATTERN = re.compile(r'^\+?\d{9,15}$')


class PhoneNumberField(serializers.CharField):
    """A phone number as people type it: "+237 670 00 01 11", "670-000-111".

    Spaces, dots, dashes and brackets are removed before the number is
    checked. The model's own validator runs on the raw text, so without this a
    correctly formatted number was rejected for its punctuation alone, which
    is what made staff creation fail for ordinary Cameroonian numbers.
    """

    default_error_messages = {
        'invalid': 'Enter a valid phone number, for example +237 670 000 000.',
    }

    def __init__(self, **kwargs):
        kwargs.setdefault('max_length', 20)
        kwargs.setdefault('required', False)
        kwargs.setdefault('allow_blank', True)
        kwargs.setdefault('allow_null', True)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = PHONE_SEPARATORS.sub('', super().to_internal_value(data))
        if value and not PHONE_PATTERN.match(value):
            self.fail('invalid')
        return value


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'User List Item',
            value={
                'id': '550e8400-e29b-41d4-a716-446655440000',
                'matricule': 'STU001',
                'name': 'Example Student',
                'email': 'student@example.com',
                'role': 'STUDENT',
                'school_name': 'Example Secondary School',
                'avatar': 'https://example.com/avatars/user1.jpg',
                'is_license_paid': True,
                'is_active': True,
            },
        ),
    ]
)
class UserListSerializer(serializers.ModelSerializer):
    """Serializer for user list view."""

    school_name = serializers.CharField(source='school.name', read_only=True)
    school_id = serializers.CharField(source='school.id', read_only=True)
    sub_school_name = serializers.CharField(source='sub_school.name', read_only=True)
    student_class = serializers.SerializerMethodField()
    subjects_taught = serializers.SerializerMethodField()
    is_platform_executive = serializers.BooleanField(read_only=True)
    is_school_admin = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'matricule',
            'name',
            'email',
            'phone',
            'whatsapp',
            'role',
            'employment_type',
            'school_id',
            'school_name',
            'sub_school_name',
            'student_class',
            'subjects_taught',
            'avatar',
            'is_license_paid',
            'is_active',
            'is_drafted',
            'drafted_at',
            'draft_delete_after',
            'draft_reason',
            'draft_reminder_count',
            'is_suspended',
            'suspended_until',
            'suspension_reason',
            'date_joined',
            'is_platform_executive',
            'is_school_admin',
        ]

    def get_subjects_taught(self, obj):
        """The subjects this person teaches, named once each.

        Two things make someone a subject's teacher: being named on the
        subject itself, and being assigned to it for a particular class. A
        roster that showed only one of them would leave teachers looking
        unassigned, so both are read and merged.

        (apps.academics has a ClassSubject of its own, but that app is not
        in INSTALLED_APPS, so it holds no live data.)

        Reads the relations the viewset prefetches, so a staff list does not
        turn into one query per person.
        """
        if getattr(obj, 'role', None) != 'TEACHER':
            return []

        names = []
        seen = set()

        def remember(name):
            cleaned = (name or '').strip()
            if cleaned and cleaned.lower() not in seen:
                seen.add(cleaned.lower())
                names.append(cleaned)

        try:
            for link in obj.class_subject_links.all():
                remember(getattr(link.subject, 'name', '') if link.subject_id else '')
            for subject in obj.taught_subjects.all():
                remember(getattr(subject, 'name', ''))
        except Exception:  # noqa: BLE001 - a roster must still render
            return names

        return sorted(names, key=str.lower)

    def get_student_class(self, obj):
        try:
            profile = obj.student_profile
        except Exception:
            return ''
        return getattr(profile, 'student_class', '') or ''


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'User Detail',
            value={
                'id': '550e8400-e29b-41d4-a716-446655440000',
                'matricule': 'STU001',
                'name': 'Example Student',
                'email': 'student@example.com',
                'phone': '+237670123456',
                'whatsapp': '+237670123456',
                'role': 'STUDENT',
                'school': {
                    'id': 'SCH-001',
                    'name': 'Example Secondary School',
                    'location': 'City Center',
                },
                'avatar': 'https://example.com/avatars/user1.jpg',
                'is_license_paid': True,
                'ai_request_count': 45,
                'annual_avg': '16.50',
                'is_active': True,
                'date_joined': '2024-01-15T10:30:00Z',
                'display_role': 'Student',
            },
        ),
    ]
)
class UserDetailSerializer(serializers.ModelSerializer):
    """Serializer for user detail view with full information."""

    school = serializers.SerializerMethodField()
    sub_school = serializers.SerializerMethodField()
    display_role = serializers.CharField(source='get_role_display', read_only=True)
    is_platform_executive = serializers.BooleanField(read_only=True)
    is_school_admin = serializers.BooleanField(read_only=True)
    teaching_assignments = serializers.SerializerMethodField()
    class_master_of = serializers.SerializerMethodField()
    materials_count = serializers.SerializerMethodField()
    materials_breakdown = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'matricule',
            'uid',
            'name',
            'email',
            'phone',
            'whatsapp',
            'role',
            'employment_type',
            'school',
            'sub_school',
            'avatar',
            'is_license_paid',
            'ai_request_count',
            'annual_avg',
            'is_active',
            'is_drafted',
            'drafted_at',
            'draft_delete_after',
            'draft_reason',
            'draft_reminder_count',
            'is_suspended',
            'suspended_until',
            'suspension_reason',
            'date_joined',
            'display_role',
            'is_platform_executive',
            'is_school_admin',
            'teaching_assignments',
            'class_master_of',
            'materials_count',
            'materials_breakdown',
        ]

    def get_school(self, obj):
        """Return school basic info if user has school."""
        if obj.school:
            return {
                'id': obj.school.id,
                'name': obj.school.name,
                'short_name': obj.school.short_name,
                'principal': obj.school.principal,
                'motto': obj.school.motto,
                'logo': obj.school.logo,
                'banner': obj.school.banner,
                'description': obj.school.description,
                'location': obj.school.location,
                'region': obj.school.region,
                'division': obj.school.division,
                'sub_division': obj.school.sub_division,
                'city_village': obj.school.city_village,
                'address': obj.school.address,
                'postal_code': obj.school.postal_code,
                'phone': obj.school.phone,
                'email': obj.school.email,
                'status': obj.school.status,
                'student_count': obj.school.student_count,
                'teacher_count': obj.school.teacher_count,
                'matricule': obj.school.matricule,
            }
        return None

    def get_sub_school(self, obj):
        if obj.sub_school:
            return {
                'id': str(obj.sub_school_id),
                'name': obj.sub_school.name,
            }
        return None

    def get_teaching_assignments(self, obj):
        """Classes and subjects this staff member teaches."""
        try:
            from apps.grades.models import ClassSubject
            links = ClassSubject.objects.filter(teacher=obj).select_related(
                'school_class', 'school_class__sub_school', 'subject'
            )
            return [
                {
                    'id': str(link.id),
                    'class_name': getattr(link.school_class, 'name', '') if link.school_class_id else '',
                    'subject_name': getattr(link.subject, 'name', '') if link.subject_id else '',
                    'sub_school_name': getattr(link.school_class.sub_school, 'name', '')
                    if link.school_class_id and link.school_class.sub_school_id else '',
                }
                for link in links
            ]
        except Exception:
            return []

    def get_class_master_of(self, obj):
        """Classes where this staff member is the class master."""
        try:
            from apps.schools.models import SchoolClass
            classes = SchoolClass.objects.filter(class_master=obj).select_related('sub_school')
            return [
                {
                    'id': str(school_class.id),
                    'name': school_class.name,
                    'sub_school_name': getattr(school_class.sub_school, 'name', '')
                    if school_class.sub_school_id else '',
                }
                for school_class in classes
            ]
        except Exception:
            return []

    def get_materials_breakdown(self, obj):
        """Count of content the staff member has uploaded/created."""
        breakdown = {'assignments': 0, 'ai_exam_drafts': 0}
        try:
            breakdown['assignments'] = obj.assignments.count()
        except Exception:
            pass
        try:
            breakdown['ai_exam_drafts'] = obj.ai_exam_drafts.count()
        except Exception:
            pass
        return breakdown

    def get_materials_count(self, obj):
        breakdown = self.get_materials_breakdown(obj)
        return sum(breakdown.values())


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Create User',
            value={
                'name': 'Jane Smith',
                'email': 'jane@example.com',
                'phone': '+237670987654',
                'role': 'TEACHER',
                'school': 'GBHS-D',
                'password': 'SecurePassword123!',
            },
        ),
    ]
)
class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users."""

    email = serializers.EmailField(required=False, allow_blank=True)
    phone = PhoneNumberField()
    whatsapp = PhoneNumberField()
    school_id = serializers.CharField(write_only=True, required=False, allow_blank=True)
    sub_school = serializers.PrimaryKeyRelatedField(
        queryset=SubSchool.objects.all(),
        required=False,
        allow_null=True,
    )
    class_master_for = serializers.PrimaryKeyRelatedField(
        queryset=SchoolClass.objects.all(),
        required=False,
        allow_null=True,
    )
    teaching_assignments = serializers.ListField(
        child=serializers.UUIDField(format='hex_verbose'),
        required=False,
        allow_empty=True,
    )
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )
    password_confirm = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'matricule',
            'name',
            'email',
            'phone',
            'whatsapp',
            'role',
            'employment_type',
            'school',
            'school_id',
            'sub_school',
            'class_master_for',
            'teaching_assignments',
            'password',
            'password_confirm',
        ]
        read_only_fields = ['matricule']

    def validate(self, data):
        """Validate password confirmation."""
        request = self.context.get('request')
        requester = getattr(request, 'user', None)
        requested_role = data.get('role')
        requested_school = data.get('school')
        requested_school_id = (data.get('school_id') or '').strip()
        requested_email = (data.get('email') or '').strip()
        requested_sub_school = data.get('sub_school')
        class_master_for = data.get('class_master_for')
        teaching_assignment_ids = data.get('teaching_assignments') or []

        for field in ['phone', 'whatsapp']:
            value = data.get(field)
            if value:
                data[field] = re.sub(r'[\s().-]+', '', value.strip())

        if not requested_school and requested_school_id:
            requested_school = requester.school.__class__.objects.filter(id=requested_school_id).first()
            if not requested_school:
                raise serializers.ValidationError({'school_id': 'Selected school was not found.'})
            data['school'] = requested_school

        allowed_roles_for_school_admin = {'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN', 'PARENT'}
        allowed_roles_for_sub_admin = {'TEACHER', 'BURSAR', 'LIBRARIAN', 'PARENT'}
        school_scoped_roles = {'SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN', 'PARENT', 'STUDENT'}

        if requester and requester.is_authenticated and requester.is_school_admin and not requester.is_platform_executive:
            if not requester.school:
                raise serializers.ValidationError({'school': 'Your account is not linked to a school.'})

            if requested_school and getattr(requested_school, 'id', requested_school) != requester.school_id:
                raise serializers.ValidationError({'school': 'You can only create users inside your own school.'})

            data['school'] = requester.school
            requested_school = requester.school

            if requester.role == 'SCHOOL_ADMIN' and requested_role not in allowed_roles_for_school_admin:
                raise serializers.ValidationError({'role': 'School admins can only create sub-admin, teacher, bursar, librarian, or parent accounts.'})

            if requester.role == 'SUB_ADMIN' and requested_role not in allowed_roles_for_sub_admin:
                raise serializers.ValidationError({'role': 'Sub-admins can only create teacher, bursar, librarian, or parent accounts.'})

        if requested_role in school_scoped_roles and not requested_school:
            raise serializers.ValidationError({'school': 'A school must be selected for this role.'})

        if requested_sub_school and requested_school and requested_sub_school.school_id != requested_school.id:
            raise serializers.ValidationError({'sub_school': 'Selected sub school must belong to the chosen school.'})

        if class_master_for:
            if not requested_school or class_master_for.school_id != requested_school.id:
                raise serializers.ValidationError({'class_master_for': 'Selected class must belong to the chosen school.'})
            if requested_role not in {'TEACHER', 'SUB_ADMIN', 'SCHOOL_ADMIN'}:
                raise serializers.ValidationError({'class_master_for': 'Only teaching or academic leadership roles can be linked as class masters.'})

        teaching_links = []
        if teaching_assignment_ids:
            if requested_role != 'TEACHER':
                raise serializers.ValidationError({'teaching_assignments': 'Only teacher accounts can receive subject teaching assignments.'})

            teaching_links = list(
                ClassSubject.objects.select_related('school_class__sub_school', 'subject', 'teacher')
                .filter(id__in=teaching_assignment_ids)
            )

            expected_count = len({str(assignment_id) for assignment_id in teaching_assignment_ids})
            if len(teaching_links) != expected_count:
                raise serializers.ValidationError({'teaching_assignments': 'One or more selected teaching assignments could not be found.'})

            invalid_links = [
                link for link in teaching_links
                if not requested_school or link.school_class.school_id != requested_school.id
            ]
            if invalid_links:
                raise serializers.ValidationError({'teaching_assignments': 'All selected subjects must belong to the chosen school.'})

            occupied_links = [link for link in teaching_links if link.teacher_id]
            if occupied_links:
                occupied_display = ", ".join(
                    f'{link.school_class.name} - {link.subject.name}'
                    for link in occupied_links[:3]
                )
                raise serializers.ValidationError({
                    'teaching_assignments': (
                        f'The following subjects already have a teacher assigned: {occupied_display}. '
                        'Please remove the existing teacher from these subjects first, then try again.'
                    )
                })

        linked_sub_school_ids = {
            str(link.school_class.sub_school_id)
            for link in teaching_links
            if link.school_class.sub_school_id
        }
        if class_master_for and class_master_for.sub_school_id:
            linked_sub_school_ids.add(str(class_master_for.sub_school_id))

        if requested_sub_school:
            linked_to_other_sub_school = any(
                sub_school_id != str(requested_sub_school.id)
                for sub_school_id in linked_sub_school_ids
            )
            if linked_to_other_sub_school:
                raise serializers.ValidationError({
                    'sub_school': 'The selected class and subject links must stay inside the chosen sub school.'
                })
        elif len(linked_sub_school_ids) > 1:
            raise serializers.ValidationError({
                'teaching_assignments': 'A staff account can only be linked to one sub school during onboarding.'
            })
        elif len(linked_sub_school_ids) == 1:
            inferred_sub_school = SubSchool.objects.filter(id=next(iter(linked_sub_school_ids))).first()
            if inferred_sub_school:
                data['sub_school'] = inferred_sub_school

        if requested_email and User.objects.filter(email=requested_email).exists():
            raise serializers.ValidationError({'email': 'A user with this email already exists.'})

        password = data.get('password') or ''
        password_confirm = data.get('password_confirm') or ''
        if password or password_confirm:
            if password != password_confirm:
                raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})
            validate_password(password)
        else:
            data['password'] = ''
            data['password_confirm'] = ''
        return data

    @transaction.atomic
    def create(self, validated_data):
        """Create user with auto-generated matricule."""
        validated_data.pop('password_confirm')
        validated_data.pop('school_id', None)
        class_master_for = validated_data.pop('class_master_for', None)
        teaching_assignment_ids = [str(value) for value in validated_data.pop('teaching_assignments', [])]
        password = validated_data.pop('password', '')
        email = (validated_data.pop('email', '') or '').strip()
        role = validated_data.get('role')
        is_staff_role = role in {'SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN'}

        matricule = self._generate_unique_matricule()
        if not email:
            email = self._generate_placeholder_email(matricule, role)

        user = User.objects.create_user(
            matricule=matricule,
            email=email,
            password=password or '!pending_activation',
            is_staff=is_staff_role,
            **validated_data,
        )

        if class_master_for:
            class_master_for.class_master = user
            class_master_for.save(update_fields=['class_master'])

        if teaching_assignment_ids:
            teaching_links = list(
                ClassSubject.objects.select_related('subject', 'school_class')
                .filter(id__in=teaching_assignment_ids)
            )
            for link in teaching_links:
                link.teacher = user
            ClassSubject.objects.bulk_update(teaching_links, ['teacher'])
            self._sync_subject_metadata_bulk({link.subject_id for link in teaching_links})

        return user

    def _sync_subject_metadata_bulk(self, subject_ids):
        for subject in Subject.objects.filter(id__in=subject_ids).prefetch_related('class_links__school_class', 'class_links__teacher'):
            class_links = list(subject.class_links.select_related('school_class', 'teacher').all())
            unique_levels = sorted(
                {
                    link.school_class.name.strip()
                    for link in class_links
                    if link.school_class_id and link.school_class.name
                }
            )
            unique_teacher_ids = {
                str(link.teacher_id)
                for link in class_links
                if link.teacher_id
            }

            subject.level = unique_levels[0] if len(unique_levels) == 1 else 'Multiple Classes'
            if len(unique_teacher_ids) == 1:
                subject.teacher = next(
                    (link.teacher for link in class_links if link.teacher_id),
                    None,
                )
            else:
                subject.teacher = None

            subject.save(update_fields=['level', 'teacher'])

    def _generate_unique_matricule(self):
        """Generate a standardized EduIgnite matricule."""
        role = self.validated_data.get('role')
        school = self.validated_data.get('school')
        if school:
            matricule = generate_school_user_matricule(school, role)
            if role == 'SCHOOL_ADMIN' and User.objects.filter(matricule=matricule).exists():
                raise serializers.ValidationError({
                    'matricule': 'The school administrator matricule is already assigned for this school.'
                })
            return matricule

        return generate_founder_matricule(role)

    def _generate_placeholder_email(self, matricule, role):
        role_slug = (role or 'user').lower().replace('_', '-')
        email = f'{matricule.lower()}@{role_slug}.eduignite.local'
        while User.objects.filter(email=email).exists():
            email = f'{matricule.lower()}.{uuid.uuid4().hex[:4]}@{role_slug}.eduignite.local'
        return email


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Update User',
            value={
                'name': 'Jane Smith Updated',
                'phone': '+237670987654',
                'whatsapp': '+237670987654',
                'is_active': True,
            },
        ),
    ]
)
class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating user details (limited fields)."""

    phone = PhoneNumberField()
    whatsapp = PhoneNumberField()

    class Meta:
        model = User
        fields = [
            'name',
            'phone',
            'whatsapp',
            'avatar',
            'is_active',
            'employment_type',
        ]


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Update Role',
            value={
                'role': 'TEACHER',
            },
        ),
    ]
)
class UserRoleUpdateSerializer(serializers.ModelSerializer):
    """Serializer for executives to change user roles."""

    class Meta:
        model = User
        fields = ['role']


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Toggle License',
            value={
                'is_license_paid': True,
            },
        ),
    ]
)
class LicenseToggleSerializer(serializers.ModelSerializer):
    """Serializer for toggling license payment status."""

    class Meta:
        model = User
        fields = ['is_license_paid']


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Profile Update',
            value={
                'name': 'John Updated',
                'phone': '+237670123456',
                'whatsapp': '+237670123456',
            },
        ),
    ]
)
class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Serializer for users to update their own profile."""

    email = serializers.EmailField(required=False)
    phone = PhoneNumberField()
    whatsapp = PhoneNumberField()

    class Meta:
        model = User
        fields = [
            'name',
            'phone',
            'whatsapp',
            'avatar',
            'email',
        ]

    def validate_email(self, value):
        user = self.instance
        if user and User.objects.filter(email=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value


class FounderShareAdjustmentSerializer(serializers.ModelSerializer):
    added_by_name = serializers.CharField(source='added_by.name', read_only=True)
    is_expired = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()
    days_until_expiry = serializers.SerializerMethodField()

    class Meta:
        model = FounderShareAdjustment
        fields = [
            'id',
            'percentage',
            'units',
            'note',
            'expires_at',
            'is_expired',
            'is_locked',
            'days_until_expiry',
            'created_at',
            'added_by_name',
        ]

    def get_is_expired(self, obj):
        return obj.is_expired

    def get_is_locked(self, obj):
        return obj.is_locked

    def get_days_until_expiry(self, obj):
        return obj.days_until_expiry


class FounderProfileSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    matricule = serializers.CharField(source='user.matricule', read_only=True)
    name = serializers.CharField(source='user.name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    whatsapp = serializers.CharField(source='user.whatsapp', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)
    is_active = serializers.BooleanField(source='user.is_active', read_only=True)
    avatar = serializers.URLField(source='user.avatar', read_only=True, allow_null=True)
    # employment_type lives on User, not FounderProfile. Without this explicit
    # source DRF cannot resolve it against the model and raises
    # ImproperlyConfigured, which surfaced as a 500 on GET /users/founders/.
    employment_type = serializers.CharField(source='user.employment_type', read_only=True)
    additional_share_percentage = serializers.SerializerMethodField()
    total_share_percentage = serializers.SerializerMethodField()
    additional_share_units = serializers.IntegerField(read_only=True)
    total_share_units = serializers.IntegerField(read_only=True)
    is_share_expired = serializers.SerializerMethodField()
    days_until_share_expiry = serializers.SerializerMethodField()
    share_adjustments = FounderShareAdjustmentSerializer(many=True, read_only=True)

    class Meta:
        model = FounderProfile
        fields = [
            'id',
            'user_id',
            'matricule',
            'name',
            'email',
            'phone',
            'whatsapp',
            'role',
            'employment_type',
            'avatar',
            'founder_title',
            'primary_share_percentage',
            'additional_share_percentage',
            'total_share_percentage',
            'primary_share_units',
            'additional_share_units',
            'total_share_units',
            'is_primary_founder',
            'can_be_removed',
            'is_active',
            # Renewable shares
            'has_renewable_shares',
            'share_renewal_period_days',
            'shares_expire_at',
            'is_share_expired',
            'days_until_share_expiry',
            # Access level
            'access_level',
            'share_adjustments',
            'created_at',
            'updated_at',
        ]

    def get_additional_share_percentage(self, obj):
        return f'{obj.additional_share_percentage:.2f}'

    def get_total_share_percentage(self, obj):
        return f'{obj.total_share_percentage:.2f}'

    def get_is_share_expired(self, obj):
        return obj.is_share_expired

    def get_days_until_share_expiry(self, obj):
        return obj.days_until_share_expiry


class FounderDirectorySerializer(serializers.ModelSerializer):
    """The founder board as an executive who is not a founder may see it.

    Who someone is and what they are on the board: the name, the picture,
    the title and the role. Shareholding, contact details, matricules,
    access levels and the share history are the founders' own business and
    are not serialised here at all, so they never reach the client.
    """

    user_id = serializers.UUIDField(source='user.id', read_only=True)
    name = serializers.CharField(source='user.name', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)
    avatar = serializers.URLField(source='user.avatar', read_only=True, allow_null=True)

    class Meta:
        model = FounderProfile
        fields = [
            'id',
            'user_id',
            'name',
            'role',
            'avatar',
            'founder_title',
            'is_primary_founder',
        ]


class FounderProfileCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    whatsapp = serializers.CharField(max_length=20, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=FOUNDER_MANAGEABLE_ROLES)
    founder_title = serializers.CharField(max_length=255)
    # Optional: an executive can be created with no shares at all (staff only).
    # Leaving it unset, or 0, allocates no ownership to them.
    primary_share_percentage = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, default=Decimal('0.00'),
        help_text='Percentage of company shares. 0 (or omitted) for an executive who holds no shares.',
    )
    primary_share_units = serializers.IntegerField(min_value=0, required=False, default=0)

    # Renewable shares governance (CEO/CTO decision)
    has_renewable_shares = serializers.BooleanField(default=False)
    share_renewal_period_days = serializers.IntegerField(
        min_value=1,
        default=365,
        required=False,
        help_text='Days in the renewal period. Required when has_renewable_shares=True.',
    )

    # Activity permission level
    access_level = serializers.ChoiceField(
        choices=[c[0] for c in FounderAccessLevel.choices],
        default=FounderAccessLevel.FULL,
    )

    def validate_primary_share_percentage(self, value):
        if value < 0:
            raise serializers.ValidationError('Primary share percentage cannot be negative.')
        return value

    def validate(self, data):
        if data.get('has_renewable_shares') and not data.get('share_renewal_period_days'):
            raise serializers.ValidationError(
                {'share_renewal_period_days': 'Renewal period in days is required when has_renewable_shares is True.'}
            )
        return data

    def create(self, validated_data):
        has_renewable = validated_data.get('has_renewable_shares', False)
        renewal_days = validated_data.get('share_renewal_period_days', 365)
        shares_expire_at = None
        if has_renewable:
            shares_expire_at = timezone.now() + timedelta(days=renewal_days)

        matricule = self._generate_founder_matricule(validated_data['role'])
        user = User.objects.create_user(
            matricule=matricule,
            name=validated_data['name'],
            email=validated_data['email'],
            phone=validated_data['phone'],
            whatsapp=validated_data.get('whatsapp') or validated_data['phone'],
            role=validated_data['role'],
            password='!pending_activation',
            is_active=True,
            is_license_paid=True,
        )
        profile = FounderProfile.objects.create(
            user=user,
            founder_title=validated_data['founder_title'],
            primary_share_percentage=validated_data.get('primary_share_percentage') or Decimal('0.00'),
            primary_share_units=validated_data.get('primary_share_units', 0),
            is_primary_founder=False,
            can_be_removed=True,
            has_renewable_shares=has_renewable,
            share_renewal_period_days=renewal_days,
            shares_expire_at=shares_expire_at,
            access_level=validated_data.get('access_level', FounderAccessLevel.FULL),
        )
        return profile

    def _generate_founder_matricule(self, role):
        return generate_founder_matricule(role)


class FounderProfileUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(max_length=20, required=False)
    whatsapp = serializers.CharField(max_length=20, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=FOUNDER_MANAGEABLE_ROLES, required=False)
    founder_title = serializers.CharField(max_length=255, required=False)
    primary_share_percentage = serializers.DecimalField(max_digits=6, decimal_places=2, required=False)
    primary_share_units = serializers.IntegerField(min_value=0, required=False)
    is_active = serializers.BooleanField(required=False)
    access_level = serializers.ChoiceField(
        choices=[c[0] for c in FounderAccessLevel.choices],
        required=False,
    )

    def validate_primary_share_percentage(self, value):
        if value < 0:
            raise serializers.ValidationError('Primary share percentage cannot be negative.')
        return value

    def update(self, instance, validated_data):
        user = instance.user

        # A primary founder's role is fixed (the CEO stays the CEO), but their
        # primary share — as a percentage and as a number of units — is
        # editable, so the board can adjust the two primary holdings.
        if instance.is_primary_founder and 'role' in validated_data:
            raise serializers.ValidationError({'role': 'Primary founder roles cannot be changed.'})

        for field in ['name', 'email', 'phone', 'whatsapp', 'role', 'is_active']:
            if field in validated_data:
                setattr(user, field, validated_data[field])
        user.save()

        if 'founder_title' in validated_data:
            instance.founder_title = validated_data['founder_title']
        if 'primary_share_percentage' in validated_data:
            instance.primary_share_percentage = validated_data['primary_share_percentage']
        if 'primary_share_units' in validated_data:
            instance.primary_share_units = validated_data['primary_share_units']
        if 'access_level' in validated_data:
            instance.access_level = validated_data['access_level']
        instance.save()
        return instance


class FounderShareCreateSerializer(serializers.Serializer):
    percentage = serializers.DecimalField(max_digits=6, decimal_places=2)
    units = serializers.IntegerField(min_value=0, required=False, default=0)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)
    duration_days = serializers.IntegerField(
        min_value=1,
        help_text='Number of days until this share allocation expires and is automatically removed.',
    )

    def validate_percentage(self, value):
        if value <= 0:
            raise serializers.ValidationError('Additional share percentage must be greater than zero.')
        return value

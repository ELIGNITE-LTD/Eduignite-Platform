from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.filters import SearchFilter, OrderingFilter
from django.contrib.auth import get_user_model
from django.db.models import Q, Count
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.conf import settings as django_settings
from rest_framework.exceptions import PermissionDenied, ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from datetime import timedelta
from decimal import Decimal
import logging
import os
import uuid
import base64

from core.upload_validation import image_to_data_url, validate_image_upload
from core.email_service import send_account_created_email
from .serializers import (
    UserListSerializer,
    UserDetailSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    UserRoleUpdateSerializer,
    LicenseToggleSerializer,
    ProfileUpdateSerializer,
    FounderProfileSerializer,
    FounderDirectorySerializer,
    FounderProfileCreateSerializer,
    FounderProfileUpdateSerializer,
    FounderShareCreateSerializer,
)
from .permissions import CanEditSchoolUser, IsCEOOrCTO, IsExecutiveOrSchoolAdmin, IsExecutive, IsOwnerOrExecutive, IsPrimaryFounder
from .models import FounderProfile, FounderShareAdjustment
from .executive_access import executive_module_required, user_has_module

User = get_user_model()
logger = logging.getLogger(__name__)
DRAFT_RETENTION_DAYS = 183


def verify_destructive_confirmation(request):
    matricule = str(request.data.get('matricule', '')).strip()
    password = str(request.data.get('password', ''))

    if not matricule:
        return Response({'detail': 'Matricule confirmation is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if not password:
        return Response({'detail': 'Password confirmation is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        confirmed_user = User.objects.get(matricule=matricule)
    except User.DoesNotExist:
        return Response({'detail': 'Matricule does not exist.'}, status=status.HTTP_404_NOT_FOUND)

    if confirmed_user.id != request.user.id:
        return Response(
            {'detail': 'This matricule does not belong to the signed-in account.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not confirmed_user.check_password(password):
        return Response({'detail': 'Wrong password.'}, status=status.HTTP_400_BAD_REQUEST)

    return None


def sync_primary_founders():
    # The CEO and CTO carry the two primary shareholdings — 40% and 27%. These
    # are seed defaults only: once a profile exists, its share and title are
    # left alone so a founder's own edits persist. The governance flags
    # (is_primary_founder, can_be_removed) are always enforced.
    founder_defaults = {
        'CEO': {'founder_title': 'Chief Executive Officer & Co-Founder', 'primary_share_percentage': Decimal('40.00')},
        'CTO': {'founder_title': 'Chief Technology Officer & Co-Founder', 'primary_share_percentage': Decimal('27.00')},
    }

    for role, defaults in founder_defaults.items():
        user = User.objects.filter(role=role).first()
        if not user:
            continue
        profile, created = FounderProfile.objects.get_or_create(
            user=user,
            defaults={
                'founder_title': defaults['founder_title'],
                'primary_share_percentage': defaults['primary_share_percentage'],
                'is_primary_founder': True,
                'can_be_removed': False,
            },
        )
        if created:
            continue

        changed = []
        if not profile.is_primary_founder:
            profile.is_primary_founder = True
            changed.append('is_primary_founder')
        if profile.can_be_removed:
            profile.can_be_removed = False
            changed.append('can_be_removed')
        # One-time correction: the previous code forced 50% on every sync and
        # blocked edits, so any profile still sitting at exactly 50% was never
        # deliberately set there — move it to the real primary share. A founder
        # who has since chosen their own figure keeps it.
        if profile.primary_share_percentage == Decimal('50.00'):
            profile.primary_share_percentage = defaults['primary_share_percentage']
            changed.append('primary_share_percentage')
        if changed:
            profile.save(update_fields=changed)


class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing users with role-based access control.
    """

    queryset = User.objects.all()
    permission_classes = [IsAuthenticated]
    lookup_field = 'id'
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['role', 'school', 'is_active', 'is_license_paid']
    search_fields = ['name', 'email', 'matricule']
    ordering_fields = ['date_joined', 'name', 'role', 'email']
    ordering = ['-date_joined']

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'create':
            return UserCreateSerializer
        elif self.action in ['update', 'partial_update']:
            if self.request.user.is_platform_executive:
                return UserUpdateSerializer
            else:
                return ProfileUpdateSerializer
        elif self.action == 'update_role':
            return UserRoleUpdateSerializer
        elif self.action == 'toggle_license':
            return LicenseToggleSerializer
        elif self.action == 'retrieve':
            return UserDetailSerializer
        return UserListSerializer

    def get_queryset(self):
        """Filter queryset based on user role."""
        user = self.request.user
        # The subjects a teacher takes are read from these two relations.
        # Prefetching keeps a roster of two hundred staff at a couple of
        # queries instead of one per person.
        queryset = User.objects.all().prefetch_related(
            'class_subject_links__subject',
            'taught_subjects',
        )
        # A principal's teacher twin is an internal account they switch into,
        # not a real staff member: keep it out of every user listing.
        queryset = queryset.filter(is_teacher_twin=False)
        draft_param = str(self.request.query_params.get('draft', '')).lower()
        if self.action == 'restore' or draft_param in {'true', '1', 'yes'}:
            queryset = queryset.filter(is_drafted=True)
        else:
            queryset = queryset.filter(is_drafted=False)

        if user.is_platform_executive:
            return queryset

        if user.is_school_admin:
            queryset = queryset.filter(school=user.school)
            # A vice principal / sub-admin only sees the staff and students of
            # the sub-school(s) they are assigned to; a principal sees all.
            from apps.schools.scoping import managed_sub_school_ids, scope_users_to_sub_schools
            return scope_users_to_sub_schools(queryset, managed_sub_school_ids(user))

        # Financial staff need the school roster to record student fees; give
        # bursars read access to their own school's users.
        if user.role == 'BURSAR' and self.action in ['list', 'retrieve'] and user.school_id:
            return queryset.filter(school=user.school)

        return User.objects.filter(id=user.id)

    def get_permissions(self):
        """Set permissions based on action."""
        if self.action == 'create':
            permission_classes = [IsExecutiveOrSchoolAdmin]
        elif self.action == 'toggle_license':
            permission_classes = [IsCEOOrCTO]
        elif self.action in ['destroy', 'restore']:
            permission_classes = [IsExecutiveOrSchoolAdmin]
        elif self.action in ['update', 'partial_update']:
            # A school admin may edit (incl. email) users in their own school;
            # the owner and executives may too. Scope is also enforced by
            # get_queryset. Role changes stay on their own executive-only action.
            permission_classes = [CanEditSchoolUser]
        elif self.action == 'update_role':
            # Changing anyone's role is founder-only. (It used to accept the
            # account's own owner, which let any signed-in user re-role themselves.)
            permission_classes = [IsPrimaryFounder]
        elif self.action in ['executives', 'by_school']:
            permission_classes = [IsAuthenticated]
        elif self.action == 'stats':
            # No default activity: user statistics belong to the Schools module.
            permission_classes = [IsExecutive, executive_module_required('schools')]
        elif self.action == 'me':
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [IsAuthenticated]
        permissions_list = [permission() for permission in permission_classes]
        # Executives other than the founders manage other people's accounts only
        # through the modules assigned to them. School-level users are judged by
        # the permissions above, exactly as before.
        gate_modules = self.EXECUTIVE_ACTION_MODULES.get(self.action)
        if gate_modules:
            gate = executive_module_required(
                gate_modules[0], also=gate_modules[1:], allow_non_executives=True, self_lookup_kwarg='id',
            )
            permissions_list.append(gate())
        return permissions_list

    # Account-management actions an executive needs a module for.
    EXECUTIVE_ACTION_MODULES = {
        'create': ('schools',),
        'update': ('schools',),
        'partial_update': ('schools',),
        'destroy': ('schools',),
        'suspend': ('schools',),
        'unsuspend': ('schools',),
        'restore': ('draft',),
    }

    EXECUTIVE_PROTECTED_ACTIONS = {'update', 'partial_update', 'destroy', 'suspend', 'unsuspend', 'hard_delete', 'restore'}

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        # Changing, suspending or removing an executive is founder-only, even
        # for an executive holding the schools module (own profile excepted).
        if (
            self.action in self.EXECUTIVE_PROTECTED_ACTIONS
            and getattr(obj, 'is_platform_executive', False)
            and obj.pk != request.user.pk
            and request.user.role not in ('CEO', 'CTO')
        ):
            self.permission_denied(request, message='Only the CEO or CTO can manage executive accounts.')

    def check_permissions(self, request):
        super().check_permissions(request)
        # The Draft area lists accounts awaiting permanent deletion.
        wants_drafts = str(request.query_params.get('draft', '')).lower() in {'true', '1', 'yes'}
        if (
            wants_drafts
            and self.action in ('list', 'retrieve', 'by_school')
            and request.user.is_platform_executive
            and not user_has_module(request.user, 'draft')
        ):
            self.permission_denied(request, message='Your account has not been given access to drafts.')

    def filter_queryset(self, queryset):
        role_param = self.request.query_params.get('role')
        if role_param:
            if ',' in role_param:
                roles = [role.strip() for role in role_param.split(',') if role.strip()]
                if roles:
                    queryset = queryset.filter(role__in=roles)
            else:
                queryset = queryset.filter(role=role_param)

        school_param = self.request.query_params.get('school')
        if school_param:
            queryset = queryset.filter(school__id=school_param)

        school_id = self.request.query_params.get('school_id')
        if school_id:
            queryset = queryset.filter(school__id=school_id)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=str(is_active).lower() in {'true', '1', 'yes'})

        is_license_paid = self.request.query_params.get('is_license_paid')
        if is_license_paid is not None:
            queryset = queryset.filter(is_license_paid=str(is_license_paid).lower() in {'true', '1', 'yes'})

        for backend in self.filter_backends:
            if backend is DjangoFilterBackend:
                continue
            queryset = backend().filter_queryset(self.request, queryset, self)

        return queryset

    @extend_schema(
        description='List all users with role-based filtering',
        tags=['Users'],
    )
    def list(self, request, *args, **kwargs):
        """List users based on requesting user's role."""
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description='Retrieve a specific user',
        tags=['Users'],
    )
    def retrieve(self, request, *args, **kwargs):
        """Retrieve user details."""
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        request=UserCreateSerializer,
        description='Create a new user (Executive only)',
        tags=['Users'],
    )
    def create(self, request, *args, **kwargs):
        """Create new user within allowed role and school scope."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        try:
            # Staff of a school and EduIgnite executives get one welcome email;
            # students and parents get none (see core.email_service).
            send_account_created_email(user, actor=request.user)
        except Exception as exc:
            logger.warning("User creation email failed for %s: %s", user.id, exc)
        return Response(UserDetailSerializer(user).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        description='Update user (own profile or executive)',
        tags=['Users'],
    )
    def update(self, request, *args, **kwargs):
        """Update user details."""
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description='Partially update user',
        tags=['Users'],
    )
    def partial_update(self, request, *args, **kwargs):
        """Partially update user."""
        response = super().partial_update(request, *args, **kwargs)
        # Audit an email change without logging the address itself.
        if 'email' in request.data and getattr(response, 'status_code', 500) < 300:
            logger.info(
                'User %s email updated by %s (role %s)',
                (response.data or {}).get('matricule') or kwargs.get('id'),
                getattr(request.user, 'matricule', '?'), getattr(request.user, 'role', '?'),
            )
        return response

    @extend_schema(
        description='Delete user (Executive only)',
        tags=['Users'],
    )
    def destroy(self, request, *args, **kwargs):
        """Move a user to Draft for six months before permanent deletion."""
        confirmation_error = verify_destructive_confirmation(request)
        if confirmation_error:
            return confirmation_error
        user = self.get_object()
        if user.role in ['CEO', 'CTO']:
            return Response(
                {'detail': 'Primary founder accounts cannot be deleted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deletion_reason = str(request.data.get('deletion_reason') or request.data.get('reason') or '').strip()
        if not deletion_reason:
            return Response(
                {'detail': 'A deletion reason is required before moving this user to Draft.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if request.user.is_school_admin and user.school_id != request.user.school_id:
            return Response(
                {'detail': 'You can only draft users from your own school.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if user.is_drafted:
            return Response({'detail': 'This user is already in Draft.'}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        user.is_drafted = True
        user.is_active = False
        user.drafted_at = now
        user.draft_delete_after = now + timedelta(days=DRAFT_RETENTION_DAYS)
        user.draft_reason = deletion_reason
        user.drafted_by = request.user
        user.draft_last_reminder_at = None
        user.draft_reminder_count = 0
        user.save(update_fields=[
            'is_drafted',
            'is_active',
            'drafted_at',
            'draft_delete_after',
            'draft_reason',
            'drafted_by',
            'draft_last_reminder_at',
            'draft_reminder_count',
        ])
        return Response(UserDetailSerializer(user).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsExecutiveOrSchoolAdmin])
    @extend_schema(description='Restore a drafted user before permanent deletion', tags=['Users'])
    def restore(self, request, id=None):
        user = self.get_object()
        if request.user.is_school_admin and user.school_id != request.user.school_id:
            return Response(
                {'detail': 'You can only restore users from your own school.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not user.is_drafted:
            return Response({'detail': 'This user is not in Draft.'}, status=status.HTTP_400_BAD_REQUEST)
        user.is_drafted = False
        user.is_active = True
        user.drafted_at = None
        user.draft_delete_after = None
        user.draft_reason = ''
        user.drafted_by = None
        user.draft_last_reminder_at = None
        user.draft_reminder_count = 0
        user.save(update_fields=[
            'is_drafted',
            'is_active',
            'drafted_at',
            'draft_delete_after',
            'draft_reason',
            'drafted_by',
            'draft_last_reminder_at',
            'draft_reminder_count',
        ])
        return Response(UserDetailSerializer(user).data, status=status.HTTP_200_OK)

    def _assert_can_manage(self, user):
        """A school admin may only act on users in their own school; founders
        cannot be suspended or deleted."""
        if user.role in ['CEO', 'CTO']:
            raise ValidationError('Primary founder accounts cannot be modified here.')
        if user.is_platform_executive and self.request.user.role not in ('CEO', 'CTO'):
            # Suspending or removing another executive is founder-only.
            raise PermissionDenied('Only the CEO or CTO can manage executive accounts.')
        if self.request.user.is_school_admin and user.school_id != self.request.user.school_id:
            raise PermissionDenied('You can only manage users from your own school.')

    @action(detail=True, methods=['post'], permission_classes=[IsExecutiveOrSchoolAdmin])
    @extend_schema(description='Suspend a user for a number of days (or indefinitely)', tags=['Users'])
    def suspend(self, request, id=None):
        user = self.get_object()
        self._assert_can_manage(user)
        if user.id == request.user.id:
            return Response({'detail': 'You cannot suspend your own account.'}, status=status.HTTP_400_BAD_REQUEST)

        reason = str(request.data.get('reason') or request.data.get('suspension_reason') or '').strip()
        now = timezone.now()
        suspended_until = None
        raw_days = request.data.get('days')
        raw_until = request.data.get('suspended_until') or request.data.get('until')
        if raw_days not in (None, ''):
            try:
                days = int(raw_days)
            except (TypeError, ValueError):
                return Response({'detail': 'Suspension length (days) must be a whole number.'}, status=status.HTTP_400_BAD_REQUEST)
            if days < 1:
                return Response({'detail': 'Suspension length must be at least 1 day.'}, status=status.HTTP_400_BAD_REQUEST)
            suspended_until = now + timedelta(days=days)
        elif raw_until:
            parsed = parse_datetime(str(raw_until)) or parse_datetime(f'{raw_until}T23:59:59')
            if not parsed:
                return Response({'detail': 'Provide a valid suspension end date.'}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
            if parsed <= now:
                return Response({'detail': 'The suspension end date must be in the future.'}, status=status.HTTP_400_BAD_REQUEST)
            suspended_until = parsed
        # No days/until provided => indefinite suspension (suspended_until stays None).

        user.is_suspended = True
        user.suspended_until = suspended_until
        user.suspension_reason = reason
        user.suspended_at = now
        user.suspended_by = request.user
        user.is_active = False
        user.save(update_fields=[
            'is_suspended', 'suspended_until', 'suspension_reason',
            'suspended_at', 'suspended_by', 'is_active',
        ])
        return Response(UserDetailSerializer(user).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsExecutiveOrSchoolAdmin])
    @extend_schema(description='Cancel a user suspension and restore access', tags=['Users'])
    def unsuspend(self, request, id=None):
        user = self.get_object()
        self._assert_can_manage(user)
        if not user.is_suspended:
            return Response({'detail': 'This user is not suspended.'}, status=status.HTTP_400_BAD_REQUEST)
        user.lift_suspension()
        return Response(UserDetailSerializer(user).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post', 'delete'], permission_classes=[IsExecutiveOrSchoolAdmin], url_path='hard-delete')
    @extend_schema(description='Permanently delete a user and all their data', tags=['Users'])
    def hard_delete(self, request, id=None):
        # Permanent deletion is irreversible: among executives only the founders.
        if request.user.is_platform_executive and request.user.role not in ('CEO', 'CTO'):
            return Response(
                {'detail': 'Only the CEO or CTO can permanently delete accounts.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        confirmation_error = verify_destructive_confirmation(request)
        if confirmation_error:
            return confirmation_error
        user = self.get_object()
        self._assert_can_manage(user)
        if user.id == request.user.id:
            return Response({'detail': 'You cannot delete your own account.'}, status=status.HTTP_400_BAD_REQUEST)
        deleted_name = user.name
        # Full, irreversible removal: the FK cascade wipes the student profile,
        # grades, attendance, fees, links and everything else tied to the user.
        user.delete()
        logger.info("User %s permanently deleted by %s", deleted_name, request.user.id)
        return Response(
            {'detail': f'{deleted_name} and all associated data have been permanently deleted.'},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get', 'patch'], permission_classes=[IsAuthenticated])
    @extend_schema(
        description='Get or update current authenticated user profile',
        tags=['Users'],
    )
    def me(self, request):
        """Return or update current user's profile."""
        if request.method == 'PATCH':
            serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(UserDetailSerializer(request.user).data)
        serializer = UserDetailSerializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    @extend_schema(
        description='Upload avatar image file for current user',
        tags=['Users'],
    )
    def upload_avatar(self, request):
        """Upload avatar image and save URL to user profile."""
        file = request.FILES.get('avatar')
        error = validate_image_upload(file, field_label='profile image')
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            avatar_data_url = image_to_data_url(file)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        request.user.avatar = avatar_data_url
        request.user.save(update_fields=['avatar'])

        return Response({'avatar_url': avatar_data_url}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='admin-reset-password', permission_classes=[IsAuthenticated])
    def admin_reset_password(self, request, id=None):
        """A principal (or vice principal) resets a student's password.

        Stored passwords are hashed, so the old one can never be shown — this
        replaces it. The new password is returned once, for the principal to
        hand to the student; only its hash is stored. The old password stops
        working at once, and the student must choose their own at next login.
        No email is sent: students recover through their principal.
        """
        import secrets

        admin = request.user
        if admin.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return Response(
                {'detail': 'Only school administrators can reset student passwords.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        target = self.get_object()
        if target.role != 'STUDENT' or not admin.school_id or target.school_id != admin.school_id:
            return Response(
                {'detail': 'You can only reset passwords for students of your own school.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        # A vice principal is limited to the students of their own sub-school(s).
        from apps.schools.scoping import managed_sub_school_ids
        managed_ids = managed_sub_school_ids(admin)
        if managed_ids is not None:
            student = getattr(target, 'student_profile', None)
            sub_school_id = getattr(getattr(student, 'school_class', None), 'sub_school_id', None)
            if sub_school_id not in managed_ids:
                return Response(
                    {'detail': 'You can only reset passwords for students of your own section.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        chosen = (request.data.get('new_password') or '').strip()
        if chosen and len(chosen) < 6:
            return Response(
                {'detail': 'Password must be at least 6 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Unambiguous characters, so it can be read aloud or copied by hand.
        alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
        new_password = chosen or 'EI-' + ''.join(secrets.choice(alphabet) for _ in range(10))
        target.set_password(new_password)
        target.must_change_password = True
        target.save(update_fields=['password', 'must_change_password'])
        return Response({
            'password': new_password,
            'must_change_password': True,
            'detail': 'Password reset. Give it to the student; they will choose their own password when they next sign in.',
        })

    @action(detail=True, methods=['post'], permission_classes=[IsCEOOrCTO])
    @extend_schema(
        request=LicenseToggleSerializer,
        description='Toggle user license payment status',
        tags=['Users'],
    )
    def toggle_license(self, request, id=None):
        """Toggle license paid status for a user."""
        user = self.get_object()
        serializer = LicenseToggleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.is_license_paid = serializer.validated_data['is_license_paid']
        user.save(update_fields=['is_license_paid'])

        return Response(UserDetailSerializer(user).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsExecutive])
    @extend_schema(
        request=UserRoleUpdateSerializer,
        description='Update user role (Executive only)',
        tags=['Users'],
    )
    def update_role(self, request, id=None):
        """Update user role (executives only)."""
        user = self.get_object()
        serializer = UserRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.role = serializer.validated_data['role']
        user.save(update_fields=['role'])

        return Response(
            UserDetailSerializer(user).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    @extend_schema(
        description='Filter users by school',
        tags=['Users'],
    )
    def by_school(self, request):
        """Filter users by specific school."""
        school_id = request.query_params.get('school_id')
        if not school_id:
            return Response(
                {'detail': 'school_id query parameter required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(school__id=school_id)
        queryset = self.filter_queryset(queryset)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = UserListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = UserListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    @extend_schema(
        description='List all platform executives',
        tags=['Users'],
    )
    def executives(self, request):
        """List all platform executives."""
        executive_roles = [
            'SUPER_ADMIN',
            'CEO',
            'CTO',
            'COO',
            'INV',
            'DESIGNER',
        ]
        queryset = User.objects.filter(role__in=executive_roles)
        serializer = UserListSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[IsExecutive])
    @extend_schema(
        description='Get user statistics across platform',
        tags=['Users'],
    )
    def stats(self, request):
        """Get user statistics."""
        stats_data = {
            'total_users': User.objects.count(),
            'active_users': User.objects.filter(is_active=True).count(),
            'by_role': User.objects.values('role').annotate(count=Count('id')),
            'license_paid': User.objects.filter(is_license_paid=True).count(),
            'by_school': User.objects.values('school__name').annotate(count=Count('id')),
        }
        return Response(stats_data)


class FounderProfileViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FounderProfileSerializer
    queryset = FounderProfile.objects.select_related('user').prefetch_related('share_adjustments__added_by')
    lookup_field = 'pk'

    def get_queryset(self):
        return self.queryset.filter(user__is_drafted=False)

    def get_permissions(self):
        if self.action in ['create', 'partial_update', 'destroy', 'add_shares', 'renew_shares']:
            permission_classes = [IsPrimaryFounder]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    def _viewer_is_primary_founder(self):
        user = self.request.user
        return bool(user and user.is_authenticated and getattr(user, 'role', None) in ['CEO', 'CTO'])

    def get_serializer_class(self):
        if self.action == 'create':
            return FounderProfileCreateSerializer
        if self.action == 'partial_update':
            return FounderProfileUpdateSerializer
        if self.action == 'add_shares':
            return FounderShareCreateSerializer
        # An executive who is not a founder sees the board as a directory:
        # names, pictures, titles and roles. Shareholding, contact details,
        # matricules and the share history stay with the founders.
        if self.action in ['list', 'retrieve'] and not self._viewer_is_primary_founder():
            return FounderDirectorySerializer
        return FounderProfileSerializer

    def list(self, request, *args, **kwargs):
        sync_primary_founders()
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        founder = serializer.save()

        # Email the new executive their account details once the record is
        # committed. It is fire-and-forget: a mail failure never fails or rolls
        # back the account creation.
        new_user = founder.user
        actor = request.user

        def _send_account_email():
            try:
                from core.email_service import send_executive_account_email
                send_executive_account_email(new_user, actor=actor)
            except Exception:  # noqa: BLE001 - the account stands even if the email does not go out
                logger.exception('Executive account email failed for %s', getattr(new_user, 'matricule', '?'))

        transaction.on_commit(_send_account_email)

        response_serializer = FounderProfileSerializer(founder, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        founder = self.get_object()

        # Snapshot the fields that matter for notifying the executive, so after
        # the save we know exactly what changed and can confirm it by email.
        user = founder.user
        old_email = (user.email or '').strip().lower()
        old_role = user.role
        old_title = getattr(founder, 'founder_title', '')

        serializer = self.get_serializer(founder, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        founder = serializer.save()

        user.refresh_from_db()
        new_email = (user.email or '').strip().lower()
        email_changed = bool(new_email) and new_email != old_email

        # Build a human list of what changed, for the email body.
        changed = []
        if email_changed:
            changed.append('email address')
        if user.role != old_role:
            changed.append('role')
        if getattr(founder, 'founder_title', '') != old_title:
            changed.append('title')

        # Only notify when the email changed (the executive asked for their new
        # address to receive their details). Fire-and-forget on commit: a mail
        # failure never fails or rolls back the edit.
        if email_changed:
            actor = request.user

            def _send_update_email():
                try:
                    from core.email_service import send_executive_account_updated_email
                    send_executive_account_updated_email(user, actor=actor, changed=changed)
                except Exception:  # noqa: BLE001 - the edit stands even if the email does not go out
                    logger.exception('Executive update email failed for %s', getattr(user, 'matricule', '?'))

            transaction.on_commit(_send_update_email)

        response_serializer = FounderProfileSerializer(founder, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        founder = self.get_object()
        if founder.is_primary_founder or not founder.can_be_removed:
            return Response(
                {'detail': 'Primary founders cannot be removed from the system.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        confirmation_error = verify_destructive_confirmation(request)
        if confirmation_error:
            return confirmation_error
        deletion_reason = str(request.data.get('deletion_reason') or request.data.get('reason') or '').strip()
        if not deletion_reason:
            return Response(
                {'detail': 'A deletion reason is required before moving this founder to Draft.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = founder.user
        now = timezone.now()
        user.is_drafted = True
        user.is_active = False
        user.drafted_at = now
        user.draft_delete_after = now + timedelta(days=DRAFT_RETENTION_DAYS)
        user.draft_reason = deletion_reason
        user.drafted_by = request.user
        user.draft_last_reminder_at = None
        user.draft_reminder_count = 0
        user.save(update_fields=[
            'is_drafted',
            'is_active',
            'drafted_at',
            'draft_delete_after',
            'draft_reason',
            'drafted_by',
            'draft_last_reminder_at',
            'draft_reminder_count',
        ])
        return Response(FounderProfileSerializer(founder, context={'request': request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsPrimaryFounder])
    @transaction.atomic
    def add_shares(self, request, pk=None):
        founder = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        duration_days = serializer.validated_data['duration_days']
        expires_at = timezone.now() + timedelta(days=duration_days)
        FounderShareAdjustment.objects.create(
            founder=founder,
            percentage=serializer.validated_data['percentage'],
            units=serializer.validated_data.get('units', 0),
            note=serializer.validated_data.get('note', ''),
            added_by=request.user,
            expires_at=expires_at,
        )
        founder.refresh_from_db()
        response_serializer = FounderProfileSerializer(founder, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsPrimaryFounder])
    @transaction.atomic
    def renew_shares(self, request, pk=None):
        """Renew a founder's share period. Reactivates deactivated founders."""
        founder = self.get_object()
        if not founder.has_renewable_shares:
            return Response(
                {'detail': 'This founder does not have renewable shares.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        founder.shares_expire_at = timezone.now() + timedelta(days=founder.share_renewal_period_days)
        founder.save(update_fields=['shares_expire_at'])
        # Reactivate the user account if it was deactivated due to expired shares
        if not founder.user.is_active:
            founder.user.is_active = True
            founder.user.save(update_fields=['is_active'])
        founder.refresh_from_db()
        response_serializer = FounderProfileSerializer(founder, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], permission_classes=[IsPrimaryFounder])
    @transaction.atomic
    def remove_share_adjustment(self, request, pk=None):
        """Remove a specific share adjustment only if it has expired (time frame passed)."""
        founder = self.get_object()
        adjustment_id = request.query_params.get('adjustment_id')
        if not adjustment_id:
            return Response(
                {'detail': 'adjustment_id query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            adjustment = founder.share_adjustments.get(id=adjustment_id)
        except FounderShareAdjustment.DoesNotExist:
            return Response(
                {'detail': 'Share adjustment not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if adjustment.is_locked:
            return Response(
                {
                    'detail': (
                        f'This share allocation is locked until {adjustment.expires_at.strftime("%Y-%m-%d")}. '
                        'Shares can only be edited or removed after the time frame expires.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        adjustment.delete()
        founder.refresh_from_db()
        response_serializer = FounderProfileSerializer(founder, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)

from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db import transaction
from django.conf import settings as django_settings
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
import logging
import os
import uuid
import base64
from decimal import Decimal, InvalidOperation
from datetime import timedelta

from core.upload_validation import image_to_data_url, validate_image_upload
from core.email_service import send_school_onboarding_email, send_staff_account_email
from apps.grades.models import ClassSubject
from apps.students import api as students_api
from apps.students.serializers import StudentCreateSerializer, StudentDetailSerializer
from apps.users.serializers import UserCreateSerializer, UserDetailSerializer
from .models import School, SchoolSettings, SubSchool, SchoolClass, TimetableEntry, SchoolStatus, ClassTeacherAssignment
from .serializers import (
    SchoolListSerializer,
    SchoolDetailSerializer,
    SchoolCreateSerializer,
    SchoolUpdateSerializer,
    SchoolPublicSearchSerializer,
    SchoolSettingsSerializer,
    SubSchoolSerializer,
    SubAdminAssignmentSerializer,
    SchoolClassSerializer,
    SchoolClassExploreSerializer,
    ClassSubjectSerializer,
    HierarchyStaffSerializer,
    TimetableEntrySerializer,
    ClassTeacherAssignmentSerializer,
)
from .permissions import IsExecutiveOrSchoolAdmin, IsExecutive
from .filters import AWAITING_ACTIVATION, apply_school_filters, school_facets, wants_pending
from apps.platform.permissions import IsCEOOrCTO
from apps.users.executive_access import executive_module_required, user_has_any_module

SchoolsModule = executive_module_required('schools')
SchoolsModuleShared = executive_module_required('schools', allow_non_executives=True)
SchoolsOrDraftModuleShared = executive_module_required('schools', also=('draft',), allow_non_executives=True)

logger = logging.getLogger(__name__)
User = get_user_model()
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


class SchoolViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing schools with role-based access control.
    """

    queryset = School.objects.all()
    permission_classes = [IsAuthenticated]
    lookup_field = 'id'

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'create':
            return SchoolCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return SchoolUpdateSerializer
        elif self.action == 'retrieve':
            return SchoolDetailSerializer
        return SchoolListSerializer

    def get_queryset(self):
        """Filter queryset based on user role."""
        user = self.request.user
        queryset = School.objects.annotate(
            live_student_count=Count('students', distinct=True),
            live_teacher_count=Count('users', filter=Q(users__role='TEACHER', users__is_teacher_twin=False), distinct=True),
        )
        draft_param = str(self.request.query_params.get('draft', '')).lower()
        executive_list = user.is_platform_executive and self.action == 'list'
        if self.action == 'restore' or draft_param in {'true', '1', 'yes'}:
            queryset = queryset.filter(is_drafted=True)
        elif executive_list and wants_pending(self.request.query_params):
            # Legacy schools awaiting activation wait in Drafts for
            # activation; the Pending filter must show them.
            queryset = queryset.filter(Q(is_drafted=False) | AWAITING_ACTIVATION)
        else:
            queryset = queryset.filter(is_drafted=False)
        user_school = getattr(user, 'school', None)

        if user.is_platform_executive:
            if executive_list:
                queryset = apply_school_filters(queryset, self.request.query_params).distinct()
            return queryset

        if user.is_school_admin and user_school:
            return queryset.filter(id=user_school.id)

        if user_school:
            return queryset.filter(id=user_school.id)

        return School.objects.none()

    def get_permissions(self):
        """Set permissions based on action.

        Executives other than the founders need the ``schools`` module (the
        ``draft`` module also unlocks restoring a drafted school). School-level
        users are judged by the same rules as before.
        """
        if self.action == 'create':
            permission_classes = [IsExecutive, SchoolsModule]
        elif self.action == 'destroy':
            permission_classes = [IsExecutive, SchoolsModule]
        elif self.action == 'restore':
            permission_classes = [IsExecutiveOrSchoolAdmin, SchoolsOrDraftModuleShared]
        elif self.action in ['update', 'partial_update', 'toggle_status']:
            permission_classes = [IsExecutiveOrSchoolAdmin, SchoolsModuleShared]
        elif self.action in ['permanent_delete', 'subscription_amount', 'subscription_status']:
            # Irreversible deletion and what a school pays are sensitive: the
            # founders (and Super Admin holding the schools module) only. These
            # used to fall through to IsAuthenticated, so any member of a school
            # could change its own subscription.
            permission_classes = [IsExecutive, IsCEOOrCTO, SchoolsModule]
        elif self.action == 'stats':
            permission_classes = [IsExecutive]
        elif self.action == 'search':
            # Deliberately public: a technician setting up a brand-new offline
            # installation needs to find their school before they have any
            # login credentials at all. See SchoolPublicSearchSerializer for
            # the narrow, non-sensitive field list this action returns.
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    def check_permissions(self, request):
        super().check_permissions(request)
        # The Draft area lists schools awaiting permanent deletion.
        wants_drafts = str(request.query_params.get('draft', '')).lower() in {'true', '1', 'yes'}
        if (
            wants_drafts
            and self.action in ('list', 'retrieve')
            and request.user.is_platform_executive
            and not user_has_any_module(request.user, ('draft', 'schools'))
        ):
            self.permission_denied(request, message='Your account has not been given access to drafts.')

    def get_throttles(self):
        """Give the unauthenticated search action its own named rate-limit
        scope (see DEFAULT_THROTTLE_RATES['school_search']) instead of relying
        on the global anon/user throttles, since it is reachable with no
        account at all."""
        if self.action == 'search':
            self.throttle_scope = 'school_search'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    @extend_schema(
        description='List all schools with role-based filtering',
        tags=['Schools'],
    )
    def list(self, request, *args, **kwargs):
        """List schools based on requesting user role."""
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description='Retrieve a specific school',
        tags=['Schools'],
    )
    def retrieve(self, request, *args, **kwargs):
        """Retrieve school details."""
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        request=SchoolCreateSerializer,
        description='Create a new school (Executive only). Returns the auto-generated matricule for principal account activation.',
        tags=['Schools'],
    )
    def create(self, request, *args, **kwargs):
        """Create new school and return the generated matricule."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        school = serializer.save()
        try:
            # A new school starts with everything its subscription includes, so
            # it is usable immediately rather than arriving with no apps.
            from apps.registry import api as registry_api

            registry_api.install_defaults(school, by=request.user)
        except Exception as exc:  # noqa: BLE001 - never block school creation
            logger.warning("Default app install failed for %s: %s", school.id, exc)
        try:
            send_school_onboarding_email(school, getattr(school, 'principal_user', None))
        except Exception as exc:
            logger.warning("School onboarding email failed for %s: %s", school.id, exc)
        response_data = SchoolDetailSerializer(school).data
        response_data['matricule'] = getattr(school, 'matricule', '')
        return Response(response_data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=SchoolUpdateSerializer,
        description='Update school (Executive or School Admin)',
        tags=['Schools'],
    )
    def update(self, request, *args, **kwargs):
        """Update school details."""
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description='Partially update school',
        tags=['Schools'],
    )
    def partial_update(self, request, *args, **kwargs):
        """Partially update school."""
        return super().partial_update(request, *args, **kwargs)

    def _save_school_media(self, request, school, field_name, subdirectory):
        file = request.FILES.get(field_name)
        media_label = 'school logo' if field_name == 'logo' else 'school banner'
        error = validate_image_upload(file, field_label=media_label, allow_svg=True)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            media_data_url = image_to_data_url(file)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        setattr(school, field_name, media_data_url)
        school.save(update_fields=[field_name])

        return Response(
            {
                f'{field_name}_url': media_data_url,
                field_name: media_data_url,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        description='Delete school (Executive only)',
        tags=['Schools'],
    )
    def destroy(self, request, *args, **kwargs):
        """Move school to Draft for six months before permanent deletion."""
        confirmation_error = verify_destructive_confirmation(request)
        if confirmation_error:
            return confirmation_error

        school = self.get_object()
        deletion_reason = str(request.data.get('deletion_reason') or request.data.get('reason') or '').strip()
        if not deletion_reason:
            return Response(
                {'detail': 'A deletion reason is required before moving this school to Draft.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if school.is_drafted:
            return Response({'detail': 'This school is already in Draft.'}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()

        with transaction.atomic():
            school.is_drafted = True
            school.status = 'Suspended'
            school.drafted_at = now
            school.draft_delete_after = now + timedelta(days=DRAFT_RETENTION_DAYS)
            school.draft_reason = deletion_reason
            school.drafted_by = request.user
            school.draft_last_reminder_at = None
            school.draft_reminder_count = 0
            school.save(update_fields=[
                'is_drafted',
                'status',
                'drafted_at',
                'draft_delete_after',
                'draft_reason',
                'drafted_by',
                'draft_last_reminder_at',
                'draft_reminder_count',
                'updated_at',
            ])
            school_users = list(User.objects.filter(school=school, is_drafted=False))
            for school_user in school_users:
                school_user.is_drafted = True
                school_user.is_active = False
                school_user.drafted_at = now
                school_user.draft_delete_after = school.draft_delete_after
                school_user.draft_reason = deletion_reason or f"{school.name} was moved to Draft."
                school_user.drafted_by = request.user
                school_user.draft_last_reminder_at = None
                school_user.draft_reminder_count = 0
            if school_users:
                User.objects.bulk_update(
                    school_users,
                    [
                        'is_drafted',
                        'is_active',
                        'drafted_at',
                        'draft_delete_after',
                        'draft_reason',
                        'drafted_by',
                        'draft_last_reminder_at',
                        'draft_reminder_count',
                    ],
                )

        return Response(SchoolDetailSerializer(school).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsExecutiveOrSchoolAdmin])
    @extend_schema(description='Restore a drafted school before permanent deletion', tags=['Schools'])
    def restore(self, request, id=None):
        school = self.get_object()
        user_school = getattr(request.user, 'school', None)
        if request.user.is_school_admin and (not user_school or user_school.id != school.id):
            return Response({'detail': 'You can only restore your own school.'}, status=status.HTTP_403_FORBIDDEN)
        if not school.is_drafted:
            return Response({'detail': 'This school is not in Draft.'}, status=status.HTTP_400_BAD_REQUEST)
        drafted_at = school.drafted_at
        # A legacy school (made by the removed linked-account flow) waits here for activation.
        was_awaiting_activation = school.status == 'Pending' and school.draft_delete_after is None
        requester_id = school.drafted_by_id
        school.is_drafted = False
        school.status = 'Active'
        school.drafted_at = None
        school.draft_delete_after = None
        school.draft_reason = ''
        school.drafted_by = None
        school.draft_last_reminder_at = None
        school.draft_reminder_count = 0
        school.save(update_fields=[
            'is_drafted',
            'status',
            'drafted_at',
            'draft_delete_after',
            'draft_reason',
            'drafted_by',
            'draft_last_reminder_at',
            'draft_reminder_count',
            'updated_at',
        ])
        restored_users = list(User.objects.filter(school=school, is_drafted=True, drafted_at=drafted_at))
        for restored_user in restored_users:
            restored_user.is_drafted = False
            restored_user.is_active = True
            restored_user.drafted_at = None
            restored_user.draft_delete_after = None
            restored_user.draft_reason = ''
            restored_user.drafted_by = None
            restored_user.draft_last_reminder_at = None
            restored_user.draft_reminder_count = 0
        if restored_users:
            User.objects.bulk_update(
                restored_users,
                [
                    'is_drafted',
                    'is_active',
                    'drafted_at',
                    'draft_delete_after',
                    'draft_reason',
                    'drafted_by',
                    'draft_last_reminder_at',
                    'draft_reminder_count',
                ],
            )
        if was_awaiting_activation:
            try:
                # Such a school never went through
                # create(), so give it its apps now (idempotent).
                from apps.registry import api as registry_api

                registry_api.install_defaults(school, by=request.user, only_missing=True)
            except Exception as exc:  # noqa: BLE001 - never block activation
                logger.warning("Default app install failed for %s: %s", school.id, exc)
            try:
                from apps.orders import api as orders_api

                orders_api.notify_school_activated(school.id, requester_id)
            except Exception as exc:  # noqa: BLE001 - never block activation
                logger.warning("Activation email could not be queued for %s: %s", school.id, exc)
        return Response(SchoolDetailSerializer(school).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsExecutive], url_path='permanent-delete')
    @extend_schema(description='Permanently delete a school and all its data (CEO/CTO only)', tags=['Schools'])
    def permanent_delete(self, request, id=None):
        """Irreversibly erase a school and every record tied to it. Restricted
        to CEO/CTO. Requires matricule + password confirmation."""
        if request.user.role not in ['CEO', 'CTO', 'SUPER_ADMIN']:
            return Response(
                {'detail': 'Only the CEO or CTO can permanently delete a school.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        confirmation_error = verify_destructive_confirmation(request)
        if confirmation_error:
            return confirmation_error

        school = self.get_object()
        school_name = school.name
        with transaction.atomic():
            # Users FK to school is SET_NULL, so delete them explicitly to
            # remove all personal data; School CASCADE removes everything else
            # (students, assignments, exams, fees, classes, events, ...).
            User.objects.filter(school=school).delete()
            school.delete()
        return Response(
            {'detail': f'"{school_name}" and all its data were permanently deleted.'},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], permission_classes=[IsExecutiveOrSchoolAdmin], url_path='upload-logo')
    @extend_schema(
        description='Upload and persist a school logo image.',
        tags=['Schools'],
    )
    def upload_logo(self, request, id=None):
        school = self.get_object()
        return self._save_school_media(request, school, 'logo', 'logo')

    @action(detail=True, methods=['post'], permission_classes=[IsExecutiveOrSchoolAdmin], url_path='upload-banner')
    @extend_schema(
        description='Upload and persist a school banner image.',
        tags=['Schools'],
    )
    def upload_banner(self, request, id=None):
        school = self.get_object()
        return self._save_school_media(request, school, 'banner', 'banner')

    @action(detail=True, methods=['post'], permission_classes=[IsExecutiveOrSchoolAdmin])
    @extend_schema(
        request={'type': 'object', 'properties': {'status': {'type': 'string'}}},
        description='Toggle school status',
        tags=['Schools'],
    )
    def toggle_status(self, request, id=None):
        """Toggle school status between Active and Suspended."""
        school = self.get_object()
        new_status = request.data.get('status')

        if not new_status or new_status not in ['Active', 'Suspended', 'Pending']:
            return Response(
                {'detail': 'Invalid status'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_school = getattr(request.user, 'school', None)
        if request.user.is_school_admin and (not user_school or user_school.id != school.id):
            return Response(
                {'detail': 'You can only modify your own school'},
                status=status.HTTP_403_FORBIDDEN,
            )

        school.status = new_status
        school.save(update_fields=['status'])

        return Response(
            {
                'detail': f'School status updated to {new_status}',
                'status': school.status,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], permission_classes=[IsExecutive])
    @extend_schema(
        description='Get school statistics',
        tags=['Schools'],
    )
    def stats(self, request):
        """Get school statistics."""
        schools_queryset = School.objects.all()
        stats_data = {
            'total_schools': schools_queryset.count(),
            'active_schools': schools_queryset.filter(status='Active').count(),
            'suspended_schools': schools_queryset.filter(status='Suspended').count(),
            'pending_schools': schools_queryset.filter(status='Pending').count(),
            'total_students': students_api.list_students().count(),
            'total_teachers': User.objects.filter(role='TEACHER').count(),
            'total_staff': User.objects.filter(
                role__in=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN']
            ).count(),
            'staff_by_role': User.objects.filter(
                role__in=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN']
            ).values('role').annotate(count=Count('id')).order_by('role'),
            'by_region': schools_queryset.values('region').annotate(count=Count('id')),
            # Counts for the Schools tab filter chips (same query params as the list).
            'facets': school_facets(
                School.objects.filter(Q(is_drafted=False) | AWAITING_ACTIVATION),
                request.query_params,
            ),
        }
        return Response(stats_data)

    @action(detail=True, methods=['get'], permission_classes=[IsExecutiveOrSchoolAdmin],
            url_path='subscription')
    @extend_schema(description="Read a school's yearly subscription", tags=['Schools'])
    def subscription(self, request, id=None):
        """Read the current subscription — amount, status, dates."""
        return Response(self._subscription_payload(self.get_object()))

    @action(detail=True, methods=['post'], permission_classes=[IsExecutive],
            url_path='subscription/amount')
    @extend_schema(description="Set a school's yearly subscription fee", tags=['Schools'])
    def subscription_amount(self, request, id=None):
        """Founders set the yearly fee for a school. This alone — no status here."""
        from decimal import Decimal, InvalidOperation

        school = self.get_object()
        data = request.data if isinstance(request.data, dict) else {}
        try:
            school.subscription_amount = max(Decimal(str(data.get('amount') or 0)), Decimal('0'))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': 'Amount must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
        if data.get('currency'):
            school.subscription_currency = str(data['currency'])[:3]
        school.subscription_updated_by = request.user
        school.save(update_fields=[
            'subscription_amount', 'subscription_currency', 'subscription_updated_by', 'updated_at',
        ])
        return Response(self._subscription_payload(school))

    @action(detail=True, methods=['post'], permission_classes=[IsExecutive],
            url_path='subscription/status')
    @extend_schema(description="Set a school's subscription status", tags=['Schools'])
    def subscription_status(self, request, id=None):
        """Founders change the status: free, paid or unpaid. No amount needed here.

        Marking a school paid keeps it active for a year from today unless an
        explicit expiry is given, since the subscription is yearly.
        """
        school = self.get_object()
        data = request.data if isinstance(request.data, dict) else {}

        new_status = str(data.get('status') or '').lower()
        if new_status not in (School.SUBSCRIPTION_FREE, School.SUBSCRIPTION_PAID, School.SUBSCRIPTION_UNPAID):
            return Response({'detail': 'Status must be free, paid or unpaid.'},
                            status=status.HTTP_400_BAD_REQUEST)

        school.subscription_status = new_status

        if new_status == School.SUBSCRIPTION_PAID:
            school.subscription_paid_at = timezone.now()
            expiry = data.get('expires_on')
            if expiry:
                parsed = parse_date(str(expiry))
                if parsed is None:
                    return Response({'detail': 'expires_on must be a date like 2027-09-01.'},
                                    status=status.HTTP_400_BAD_REQUEST)
                school.subscription_expires_on = parsed
            else:
                school.subscription_expires_on = timezone.localdate() + timedelta(days=365)

        if new_status == School.SUBSCRIPTION_FREE:
            value = data.get('free_until')
            if not value:
                school.subscription_free_until = None
            else:
                parsed = parse_date(str(value))
                if parsed is None:
                    return Response({'detail': 'free_until must be a date like 2026-09-01.'},
                                    status=status.HTTP_400_BAD_REQUEST)
                school.subscription_free_until = parsed

        if 'note' in data:
            school.subscription_note = str(data.get('note') or '')[:1000]

        school.subscription_updated_by = request.user
        school.save(update_fields=[
            'subscription_status', 'subscription_paid_at', 'subscription_expires_on',
            'subscription_free_until', 'subscription_note', 'subscription_updated_by', 'updated_at',
        ])
        self._notify_subscription_change(school)
        return Response(self._subscription_payload(school))

    @action(detail=True, methods=['get'], permission_classes=[IsExecutiveOrSchoolAdmin],
            url_path='details')
    @extend_schema(description="A school's headline counts", tags=['Schools'])
    def details_counts(self, request, id=None):
        """Total users of a school, broken down by kind — for the founder's view."""
        school = self.get_object()
        users = User.objects.filter(school=school, is_drafted=False)
        by_role = {
            row['role']: row['count']
            for row in users.values('role').annotate(count=Count('id'))
        }
        staff_roles = ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN']
        return Response({
            'school': {'id': str(school.id), 'name': school.name},
            'total_users': users.count(),
            'students': by_role.get('STUDENT', 0),
            'parents': by_role.get('PARENT', 0),
            'staff': sum(by_role.get(r, 0) for r in staff_roles),
            'by_role': by_role,
            'active_users': users.filter(is_active=True).count(),
            'subscription': self._subscription_payload(school),
        })

    def _subscription_payload(self, school) -> dict:
        from apps.platform.access import school_subscription_state

        return {
            'status': school.subscription_status,
            'effective_state': school_subscription_state(school),
            'amount': float(school.subscription_amount or 0),
            'currency': school.subscription_currency,
            'free_until': school.subscription_free_until.isoformat() if school.subscription_free_until else None,
            'expires_on': school.subscription_expires_on.isoformat() if school.subscription_expires_on else None,
            'paid_at': school.subscription_paid_at.isoformat() if school.subscription_paid_at else None,
            'note': school.subscription_note or '',
        }

    def _notify_subscription_change(self, school) -> None:
        try:
            from apps.notifications.utils import notify_users
            from apps.platform.access import school_access_allowed

            recipients = list(
                User.objects.filter(school=school, is_active=True, is_drafted=False)
                .exclude(role='PARENT')[:5000]
            )
            if not recipients:
                return
            if school_access_allowed(school):
                title = 'Your school subscription is active'
                message = 'Your school\'s platform subscription is settled — all accounts are active.'
            else:
                title = 'School subscription unpaid'
                message = ('Your school\'s subscription is unpaid. Accounts stay inactive until it '
                           'is settled.')
            notify_users(recipients, title, message, notification_type='platform')
        except Exception:  # noqa: BLE001
            logger.exception('School subscription notify failed for %s', getattr(school, 'id', None))

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    @extend_schema(
        description='Get current user school',
        tags=['Schools'],
    )
    def my_school(self, request):
        """Return requesting user's school detail."""
        user_school = getattr(request.user, 'school', None)
        if not user_school:
            return Response(
                {'detail': 'User has no associated school'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = SchoolDetailSerializer(user_school)
        return Response(serializer.data)

    # Minimum characters required before we run a query. Keeps a single- or
    # zero-character request from being usable to scrape the full school
    # directory one letter at a time.
    SEARCH_MIN_QUERY_LENGTH = 2
    # Hard cap on rows returned, independent of pagination, so a broad query
    # (e.g. a common word) still can't be used to page through every school.
    SEARCH_MAX_RESULTS = 20

    @extend_schema(
        description=(
            'Public, unauthenticated school search by name/short name/matricule. '
            'Used by the EduIgnite Offline installer wizard so a technician can find '
            'and confirm their own real school before they have any login credentials. '
            'Returns only a school\'s own public identity (id, name, short name, '
            'matricule, region/town) — never principal contact info, financial data, '
            'counts, or any other internal/person-level field.'
        ),
        tags=['Schools'],
    )
    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path='search')
    def search(self, request):
        """GET /api/v1/schools/schools/search/?q=<query>

        Unauthenticated by design (see get_permissions/get_throttles above).
        """
        query = (request.query_params.get('q') or '').strip()
        if len(query) < self.SEARCH_MIN_QUERY_LENGTH:
            return Response([])

        schools = (
            School.objects.filter(is_drafted=False)
            .exclude(status=SchoolStatus.SUSPENDED)
            .filter(
                Q(name__icontains=query)
                | Q(short_name__icontains=query)
                | Q(matricule__icontains=query)
            )
            .order_by('name')[: self.SEARCH_MAX_RESULTS]
        )
        serializer = SchoolPublicSearchSerializer(schools, many=True)
        return Response(serializer.data)


class SchoolSettingsViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing school settings.
    """

    queryset = SchoolSettings.objects.all()
    serializer_class = SchoolSettingsSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'school'

    def get_queryset(self):
        """Filter settings based on user role."""
        user = self.request.user
        user_school = getattr(user, 'school', None)
        if user.is_platform_executive:
            return SchoolSettings.objects.all()
        if user.is_school_admin and user_school:
            return SchoolSettings.objects.filter(school=user_school)
        if user_school:
            return SchoolSettings.objects.filter(school=user_school)
        return SchoolSettings.objects.none()

    def get_object(self):
        school_id = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field)
        if not school_id:
            return super().get_object()

        school = get_object_or_404(School, id=school_id)
        user_school = getattr(self.request.user, 'school', None)
        can_manage_school = self.request.user.is_platform_executive or (
            user_school and str(user_school.id) == str(school.id)
        )
        if not can_manage_school:
            raise PermissionDenied('You can only update settings for your own school.')

        settings_obj, _ = SchoolSettings.objects.get_or_create(school=school)
        self.check_object_permissions(self.request, settings_obj)
        return settings_obj

    def get_permissions(self):
        """Set permissions based on action."""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            permission_classes = [IsExecutiveOrSchoolAdmin]
        else:
            permission_classes = [IsAuthenticated]
        if self.request.method not in ('GET', 'HEAD', 'OPTIONS'):
            # Writes by an executive need the schools module; school users are
            # judged by the permissions above, as before.
            permission_classes = [*permission_classes, SchoolsModuleShared]
        return [permission() for permission in permission_classes]

    @extend_schema(
        description='List school settings',
        tags=['School Settings'],
    )
    def list(self, request, *args, **kwargs):
        """List school settings."""
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description='Retrieve school settings',
        tags=['School Settings'],
    )
    def retrieve(self, request, *args, **kwargs):
        """Retrieve school settings."""
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        request=SchoolSettingsSerializer,
        description='Create school settings',
        tags=['School Settings'],
    )
    def create(self, request, *args, **kwargs):
        """Create school settings."""
        return super().create(request, *args, **kwargs)

    @extend_schema(
        request=SchoolSettingsSerializer,
        description='Update school settings',
        tags=['School Settings'],
    )
    def update(self, request, *args, **kwargs):
        """Update school settings."""
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description='Partially update school settings',
        tags=['School Settings'],
    )
    def partial_update(self, request, *args, **kwargs):
        """Partially update school settings."""
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        description='Configure academic year, terms, and Cameroon secondary sequences',
        tags=['School Settings'],
    )
    @action(detail=True, methods=['patch', 'put', 'post'], url_path='calendar')
    def calendar(self, request, *args, **kwargs):
        """Save the school's Cameroon secondary academic calendar."""
        if not (request.user.is_platform_executive or request.user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']):
            raise PermissionDenied('Only school administrators can configure the academic calendar.')

        settings_obj = self.get_object()

        from apps.grades.sequence_defaults import configure_cameroon_calendar_for_school
        from apps.grades.serializers import SequenceSerializer

        result = configure_cameroon_calendar_for_school(settings_obj.school, request.data)
        return Response({
            'academic_year': result['academic_year'],
            'current_term': result['current_term'],
            'sequences': SequenceSerializer(result['sequences'], many=True).data,
        })

    @extend_schema(
        description='Retrieve or update the school honour-roll threshold',
        tags=['School Settings'],
    )
    @action(detail=True, methods=['get', 'patch', 'post'], url_path='honour-roll-threshold')
    def honour_roll_threshold(self, request, *args, **kwargs):
        """Small endpoint for the school-issued honour-roll policy threshold."""
        settings_obj = self.get_object()

        if request.method == 'GET':
            return Response({
                'school': settings_obj.school_id,
                'honour_roll_threshold': str(settings_obj.honour_roll_threshold),
                'honourRollThreshold': float(settings_obj.honour_roll_threshold),
            })

        if not (request.user.is_platform_executive or request.user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']):
            raise PermissionDenied('Only school administrators can update the honour-roll threshold.')

        raw_value = request.data.get('honour_roll_threshold', request.data.get('threshold'))
        if raw_value in [None, '']:
            return Response(
                {'honour_roll_threshold': 'Provide a threshold average between 0 and 20.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            threshold = Decimal(str(raw_value))
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {'honour_roll_threshold': 'Threshold must be a valid number between 0 and 20.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if threshold < Decimal('0') or threshold > Decimal('20'):
            return Response(
                {'honour_roll_threshold': 'Threshold must be between 0 and 20 on the Cameroon secondary scale.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj.honour_roll_threshold = threshold.quantize(Decimal('0.01'))
        settings_obj.save(update_fields=['honour_roll_threshold'])
        return Response(SchoolSettingsSerializer(settings_obj).data)

    @extend_schema(
        description='Delete school settings',
        tags=['School Settings'],
    )
    def destroy(self, request, *args, **kwargs):
        """Delete school settings."""
        return super().destroy(request, *args, **kwargs)


class HierarchyAccessMixin:
    permission_classes = [IsAuthenticated]

    def _get_managed_school(self):
        user = self.request.user
        if user.is_platform_executive:
            school_id = self.request.query_params.get('school_id') or self.request.data.get('school_id')
            if school_id:
                return School.objects.filter(id=school_id).first()
            return getattr(user, 'school', None)
        return getattr(user, 'school', None)

    def _ensure_hierarchy_access(self):
        user = self.request.user
        school = self._get_managed_school()
        if not school:
            return None, Response({'detail': 'No school context available.'}, status=status.HTTP_400_BAD_REQUEST)
        if not (user.is_platform_executive or user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']):
            return None, Response({'detail': 'Only school administrators can manage hierarchy.'}, status=status.HTTP_403_FORBIDDEN)
        if (
            user.is_platform_executive
            and self.request.method not in ('GET', 'HEAD', 'OPTIONS')
            and not user_has_any_module(user, ('schools',))
        ):
            return None, Response(
                {'detail': 'Your account has not been given access to manage schools.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return school, None

    def _managed_sub_school_ids(self):
        """Sub-school ids the caller may act on, or ``None`` for the whole school."""
        from apps.schools.scoping import managed_sub_school_ids
        return managed_sub_school_ids(self.request.user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['school'] = self._get_managed_school()
        context['managed_sub_school_ids'] = self._managed_sub_school_ids()
        return context


class SubSchoolViewSet(HierarchyAccessMixin, viewsets.ModelViewSet):
    serializer_class = SubSchoolSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        school = self._get_managed_school()
        queryset = SubSchool.objects.select_related('school', 'vice_principal').annotate(
            total_classes=Count('classes', distinct=True),
            total_staff=Count('staff_members', distinct=True),
            total_subjects=Count('classes__class_subjects__subject', distinct=True),
        )
        if not school:
            return queryset.none()
        queryset = queryset.filter(school=school)
        # A vice principal / sub-admin only manages their assigned sub-school(s).
        sub_ids = self._managed_sub_school_ids()
        if sub_ids is not None:
            queryset = queryset.filter(id__in=sub_ids)
        return queryset.order_by('name')

    def destroy(self, request, *args, **kwargs):
        """Delete a custom sub-school.

        A principal can remove any sub-school they created; a vice principal /
        sub-admin can only remove one they are assigned to (enforced by the
        scoped queryset above). System-managed sections are generated from the
        school type and would simply regenerate, so they are protected.
        """
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        instance = self.get_object()
        if instance.is_system_managed:
            return Response(
                {'detail': 'This section is generated automatically from the school type and cannot be deleted. Change the school type or subsystem to remove it.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if getattr(school, 'education_category', '') == 'basic' and instance.classes.exists():
            return Response(
                {'detail': 'This section still has classes. Move or delete its classes first, then delete the section.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Related classes, staff and timetable entries are detached (their FKs
        # are SET_NULL), so deleting a sub-school never cascades away student or
        # staff records — it only removes the section grouping.
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def create(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(school=school, is_system_managed=False)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        instance = self.get_object()
        data = {}
        if 'vice_principal' in request.data or 'name' not in request.data:
            data['vice_principal'] = request.data.get('vice_principal')
        # Basic schools may rename their own (custom) sections.
        if (
            'name' in request.data
            and getattr(school, 'education_category', '') == 'basic'
            and not instance.is_system_managed
        ):
            data['name'] = request.data.get('name')
        serializer = self.get_serializer(instance, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SubAdminViewSet(HierarchyAccessMixin, mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = SubAdminAssignmentSerializer
    queryset = User.objects.none()

    def get_queryset(self):
        school = self._get_managed_school()
        queryset = User.objects.select_related('sub_school').filter(role='SUB_ADMIN')
        if not school:
            return queryset.none()
        queryset = queryset.filter(school=school)
        managed_ids = self._managed_sub_school_ids()
        if managed_ids is not None:
            queryset = queryset.filter(sub_school_id__in=managed_ids)
        return queryset.order_by('name')

    def list(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        data = [
            {
                'id': str(user.id),
                'staff': str(user.id),
                'name': user.name,
                'matricule': user.matricule,
                'profile_image': user.avatar,
                'sub_school': str(user.sub_school_id) if user.sub_school_id else None,
                'assigned_sub_school_name': user.sub_school.name if user.sub_school_id else None,
            }
            for user in self.get_queryset()
        ]
        return Response(data)

    def create(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.save()
        return Response(SubAdminAssignmentSerializer(payload, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        staff = self.get_object()
        serializer = self.get_serializer(staff, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        payload = serializer.save()
        return Response(SubAdminAssignmentSerializer(payload, context=self.get_serializer_context()).data)

    def destroy(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        staff = self.get_object()
        restored_role = staff.previous_role or 'TEACHER'
        staff.role = restored_role
        staff.previous_role = None
        staff.sub_school = None
        staff.save(update_fields=['role', 'previous_role', 'sub_school'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class SchoolClassViewSet(HierarchyAccessMixin, viewsets.ModelViewSet):
    serializer_class = SchoolClassSerializer

    def get_queryset(self):
        school = self._get_managed_school()
        queryset = SchoolClass.objects.select_related('sub_school', 'class_master').annotate(
            total_subjects=Count('class_subjects', distinct=True),
            total_teachers=Count('class_subjects__teacher', filter=Q(class_subjects__teacher__isnull=False), distinct=True),
            total_students=Count('students', distinct=True),
        )
        if not school:
            return queryset.none()
        sub_school_id = self.request.query_params.get('sub_school')
        queryset = queryset.filter(school=school)
        if sub_school_id:
            queryset = queryset.filter(sub_school_id=sub_school_id)
        # A vice principal / sub-admin only sees the classes of their assigned
        # sub-school(s); a principal sees every class in the school.
        managed_ids = self._managed_sub_school_ids()
        if managed_ids is not None:
            queryset = queryset.filter(sub_school_id__in=managed_ids)
        return queryset.order_by('name')

    def create(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(school=school)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        instance = self.get_object()
        if getattr(school, 'education_category', '') == 'basic':
            from apps.grades.models import Grade

            pupils = students_api.list_students(school=school, school_class=instance).count()
            if pupils:
                return Response(
                    {'detail': f'{instance.name} still has {pupils} pupil(s). Move them to another class first, then delete it.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if Grade.objects.filter(school_class=instance).exists():
                return Response(
                    {'detail': f'{instance.name} already has marks recorded, so it cannot be deleted.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def explore(self, request, pk=None):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        instance = self.get_object()
        serializer = SchoolClassExploreSerializer(instance, context=self.get_serializer_context())
        return Response(serializer.data)


class ClassSubjectViewSet(HierarchyAccessMixin, viewsets.ModelViewSet):
    serializer_class = ClassSubjectSerializer

    def get_queryset(self):
        school = self._get_managed_school()
        queryset = ClassSubject.objects.select_related('school_class__sub_school', 'subject', 'teacher')
        if not school:
            return queryset.none()
        queryset = queryset.filter(school_class__school=school)
        sub_school_id = self.request.query_params.get('sub_school')
        class_id = self.request.query_params.get('class_id')
        subject_type = self.request.query_params.get('type')
        if sub_school_id:
            queryset = queryset.filter(school_class__sub_school_id=sub_school_id)
        if class_id:
            queryset = queryset.filter(school_class_id=class_id)
        if subject_type:
            queryset = queryset.filter(type=subject_type)
        return queryset.order_by('school_class__name', 'subject__name')

    def create(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        if getattr(school, 'education_category', '') == 'basic':
            from apps.grades.models import Grade

            link = self.get_object()
            if Grade.objects.filter(subject_id=link.subject_id, school_class_id=link.school_class_id).exists():
                return Response(
                    {'detail': f'{link.subject.name} already has marks in {link.school_class.name}, so it cannot be removed.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        subject = instance.subject
        instance.delete()
        subject_links = subject.class_links.select_related('school_class').all()
        unique_levels = sorted(
            {
                link.school_class.name.strip()
                for link in subject_links
                if link.school_class_id and link.school_class.name
            }
        )
        unique_teachers = {
            str(link.teacher_id)
            for link in subject_links
            if link.teacher_id
        }
        subject.level = unique_levels[0] if len(unique_levels) == 1 else 'Multiple Classes'
        if len(unique_teachers) == 1:
            subject.teacher = next((link.teacher for link in subject_links if link.teacher_id), None)
        else:
            subject.teacher = None
        subject.save(update_fields=['level', 'teacher'])


class ClassTeacherAssignmentViewSet(HierarchyAccessMixin, mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Assign teachers to whole classes (Basic Education class-centred teaching).

    School admins / sub-admins list, assign and unassign. A teacher may only
    list their own assignments (and see their classes via ``my-classes``).
    """

    serializer_class = ClassTeacherAssignmentSerializer
    queryset = ClassTeacherAssignment.objects.none()

    def _is_teacher_caller(self):
        user = self.request.user
        return user.role == 'TEACHER' and not user.is_platform_executive

    def get_queryset(self):
        user = self.request.user
        queryset = ClassTeacherAssignment.objects.select_related(
            'school_class__sub_school', 'teacher',
        )
        if self._is_teacher_caller():
            if not user.school_id:
                return queryset.none()
            return queryset.filter(teacher=user, school_class__school_id=user.school_id)
        school = self._get_managed_school()
        if not school:
            return queryset.none()
        queryset = queryset.filter(school_class__school=school)
        managed_ids = self._managed_sub_school_ids()
        if managed_ids is not None:
            queryset = queryset.filter(school_class__sub_school_id__in=managed_ids)
        class_id = self.request.query_params.get('class_id')
        if class_id:
            queryset = queryset.filter(school_class_id=class_id)
        teacher_id = self.request.query_params.get('teacher_id')
        if teacher_id:
            queryset = queryset.filter(teacher_id=teacher_id)
        return queryset.order_by('school_class__name', '-is_lead', 'teacher__name')

    def list(self, request, *args, **kwargs):
        if not self._is_teacher_caller():
            school, error = self._ensure_hierarchy_access()
            if error:
                return error
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        school, error = self._ensure_hierarchy_access()
        if error:
            return error
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='my-classes')
    def my_classes(self, request):
        """Classes the calling teacher teaches as a whole class (basic schools only)."""
        from .class_teaching import basic_class_ids_for_teacher, is_basic_school

        user = request.user
        if user.role != 'TEACHER':
            raise PermissionDenied('Only teachers have assigned classes.')
        classes = SchoolClass.objects.filter(
            id__in=basic_class_ids_for_teacher(user)
        ).select_related('sub_school').order_by('name')
        return Response({
            'class_centred': is_basic_school(getattr(user, 'school', None)),
            'classes': [
                {
                    'id': str(c.id),
                    'name': c.name,
                    'cycle': c.cycle,
                    'sub_school': str(c.sub_school_id) if c.sub_school_id else None,
                    'is_class_master': c.class_master_id == user.id,
                    'subjects': [
                        {'id': str(cs.id), 'subject': str(cs.subject_id), 'subject_name': cs.subject.name}
                        for cs in c.class_subjects.select_related('subject').order_by('subject__name')
                    ],
                }
                for c in classes
            ],
        })


class HierarchyStaffViewSet(HierarchyAccessMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = HierarchyStaffSerializer
    queryset = User.objects.none()

    def get_queryset(self):
        school = self._get_managed_school()
        queryset = User.objects.select_related('sub_school').filter(
            role__in=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN'],
            is_teacher_twin=False,
        )
        if not school:
            return queryset.none()
        return queryset.filter(school=school).order_by('name')


class TimetableEntryViewSet(viewsets.ModelViewSet):
    """School timetable builder and role-scoped published timetable feed."""

    serializer_class = TimetableEntrySerializer
    permission_classes = [IsAuthenticated]

    def _school_context(self):
        user = self.request.user
        if getattr(user, 'is_platform_executive', False):
            school_id = self.request.query_params.get('school_id') or self.request.data.get('school_id')
            if school_id:
                return School.objects.filter(id=school_id).first()
        return getattr(user, 'school', None)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['school'] = self._school_context()
        return context

    def get_queryset(self):
        user = self.request.user
        queryset = TimetableEntry.objects.select_related(
            'school',
            'sub_school',
            'school_class',
            'class_subject',
            'subject',
            'teacher',
            'published_by',
            'created_by',
        )

        school = self._school_context()
        if school:
            queryset = queryset.filter(school=school)

        academic_year = self.request.query_params.get('academic_year')
        term = self.request.query_params.get('term')
        status_filter = self.request.query_params.get('status')
        school_class = self.request.query_params.get('school_class') or self.request.query_params.get('class_id')
        day = self.request.query_params.get('day_of_week')

        if academic_year:
            queryset = queryset.filter(academic_year=academic_year)
        if term:
            queryset = queryset.filter(term=term)
        if status_filter:
            queryset = queryset.filter(status=str(status_filter).upper())
        if school_class:
            queryset = queryset.filter(school_class_id=school_class)
        if day:
            queryset = queryset.filter(day_of_week=day)

        if getattr(user, 'is_platform_executive', False):
            return queryset
        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return queryset.filter(school=user.school)
        if user.role == 'TEACHER':
            return queryset.filter(school=user.school, teacher=user, status=TimetableEntry.Status.PUBLISHED)
        if user.role == 'STUDENT':
            student = students_api.get_student_for_user(user)
            if not student:
                return queryset.none()
            class_filter = Q(status=TimetableEntry.Status.PUBLISHED)
            if student.school_class_id:
                class_filter &= Q(school_class_id=student.school_class_id)
            else:
                class_filter &= Q(school_class__name=student.student_class)
            return queryset.filter(class_filter)
        if user.role == 'PARENT':
            linked_ids = students_api.list_student_ids_for_guardian(user)
            linked_students = students_api.list_students().filter(id__in=linked_ids)
            class_ids = [student.school_class_id for student in linked_students if student.school_class_id]
            class_names = [student.student_class for student in linked_students if not student.school_class_id and student.student_class]
            return queryset.filter(
                Q(school_class_id__in=class_ids) | Q(school_class__name__in=class_names),
                status=TimetableEntry.Status.PUBLISHED,
            )
        return queryset.none()

    def _ensure_school_admin(self):
        user = self.request.user
        if not (getattr(user, 'is_platform_executive', False) or user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']):
            raise PermissionDenied('Only school administrators can manage the timetable.')
        if getattr(user, 'is_platform_executive', False) and not user_has_any_module(user, ('schools',)):
            raise PermissionDenied('Your account has not been given access to manage schools.')
        if not self._school_context():
            raise PermissionDenied('No school context available for timetable management.')

    def create(self, request, *args, **kwargs):
        self._ensure_school_admin()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._ensure_school_admin()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._ensure_school_admin()
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._ensure_school_admin()
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        self._ensure_school_admin()
        entry = self.get_object()
        entry.status = TimetableEntry.Status.PUBLISHED
        entry.published_by = request.user
        entry.published_at = timezone.now()
        entry.save(update_fields=['status', 'published_by', 'published_at', 'updated_at'])
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=['post'])
    def unpublish(self, request, pk=None):
        self._ensure_school_admin()
        entry = self.get_object()
        entry.status = TimetableEntry.Status.DRAFT
        entry.published_by = None
        entry.published_at = None
        entry.save(update_fields=['status', 'published_by', 'published_at', 'updated_at'])
        return Response(self.get_serializer(entry).data)

    @action(detail=False, methods=['post'], url_path='publish-all')
    def publish_all(self, request):
        self._ensure_school_admin()
        queryset = self.get_queryset().filter(status=TimetableEntry.Status.DRAFT)
        academic_year = request.data.get('academic_year')
        term = request.data.get('term')
        if academic_year:
            queryset = queryset.filter(academic_year=academic_year)
        if term:
            queryset = queryset.filter(term=term)
        now = timezone.now()
        updated = queryset.update(
            status=TimetableEntry.Status.PUBLISHED,
            published_by_id=request.user.id,
            published_at=now,
            updated_at=now,
        )
        return Response({'published_count': updated})


SCHOOL_SCOPED_CLASS_ROLES = {'SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN'}
SCHOOL_MANAGEMENT_ROLES = {'SCHOOL_ADMIN', 'SUB_ADMIN'}
STUDENT_REGISTRATION_ROLES = {'SCHOOL_ADMIN', 'SUB_ADMIN'}


def _school_access_error(request, school, write=False):
    user = request.user
    if not user or not user.is_authenticated:
        return Response({'detail': 'Authentication credentials were not provided.'}, status=status.HTTP_401_UNAUTHORIZED)
    if user.is_platform_executive:
        if write and not user_has_any_module(user, ('schools',)):
            return Response(
                {'detail': 'Your account has not been given access to manage schools.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None
    if getattr(user, 'school_id', None) != school.id:
        return Response({'detail': 'You can only access records for your own school.'}, status=status.HTTP_403_FORBIDDEN)
    if write and user.role not in SCHOOL_MANAGEMENT_ROLES:
        return Response({'detail': 'Only school administrators can perform this action.'}, status=status.HTTP_403_FORBIDDEN)
    if not write and user.role not in SCHOOL_SCOPED_CLASS_ROLES:
        return Response({'detail': 'Your role cannot access this school resource.'}, status=status.HTTP_403_FORBIDDEN)
    return None


def _student_registration_error(request):
    user = request.user
    if not user or not user.is_authenticated:
        return Response({'detail': 'Authentication credentials were not provided.'}, status=status.HTTP_401_UNAUTHORIZED)
    if user.role not in STUDENT_REGISTRATION_ROLES:
        return Response(
            {'detail': 'Only school administrators and sub-admins can register students.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class SchoolScopedSubSchoolListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, school_id):
        school = get_object_or_404(School, id=school_id)
        error = _school_access_error(request, school)
        if error:
            return error
        queryset = SubSchool.objects.filter(school=school).select_related('vice_principal').prefetch_related(
            'classes__class_master'
        ).annotate(
            total_classes=Count('classes', distinct=True),
            total_staff=Count('staff_members', distinct=True),
            total_subjects=Count('classes__class_subjects__subject', distinct=True),
        ).order_by('name')
        serializer = SubSchoolSerializer(queryset, many=True, context={'request': request, 'school': school})
        return Response(serializer.data)

    def post(self, request, school_id):
        school = get_object_or_404(School, id=school_id)
        error = _school_access_error(request, school, write=True)
        if error:
            return error
        serializer = SubSchoolSerializer(data=request.data, context={'request': request, 'school': school})
        serializer.is_valid(raise_exception=True)
        serializer.save(school=school, is_system_managed=False)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SchoolScopedSubSchoolDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, school_id, sub_school_id):
        school = get_object_or_404(School, id=school_id)
        error = _school_access_error(request, school, write=True)
        if error:
            return error
        sub_school = get_object_or_404(SubSchool, id=sub_school_id, school=school)
        serializer = SubSchoolSerializer(
            sub_school,
            data={'vice_principal': request.data.get('vice_principal')},
            partial=True,
            context={'request': request, 'school': school},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SchoolScopedClassListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, school_id):
        school = get_object_or_404(School, id=school_id)
        error = _school_access_error(request, school)
        if error:
            return error
        queryset = SchoolClass.objects.filter(school=school).select_related('sub_school', 'class_master').annotate(
            total_subjects=Count('class_subjects', distinct=True),
            total_teachers=Count('class_subjects__teacher', filter=Q(class_subjects__teacher__isnull=False), distinct=True),
            total_students=Count('students', distinct=True),
        ).order_by('sub_school__name', 'name')
        if str(request.query_params.get('active', '')).lower() in {'true', '1', 'yes'}:
            queryset = queryset.filter(total_students__gt=0)
        serializer = SchoolClassSerializer(queryset, many=True, context={'request': request, 'school': school})
        return Response(serializer.data)

    def post(self, request, school_id):
        school = get_object_or_404(School, id=school_id)
        error = _school_access_error(request, school, write=True)
        if error:
            return error
        serializer = SchoolClassSerializer(data=request.data, context={'request': request, 'school': school})
        serializer.is_valid(raise_exception=True)
        serializer.save(school=school)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SchoolScopedStaffCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, school_id):
        school = get_object_or_404(School, id=school_id)
        error = _school_access_error(request, school, write=True)
        if error:
            return error
        payload = request.data.copy()
        payload['school'] = school.id
        payload['school_id'] = school.id
        # A real email is required, except in nursery/primary schools where
        # many staff have none (a placeholder address is generated instead).
        if not (payload.get('email') or '').strip() and getattr(school, 'education_category', None) != 'basic':
            return Response(
                {'email': ['A real email address is required so the staff member can receive account notifications and password reset links.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = UserCreateSerializer(data=payload, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        try:
            send_staff_account_email(user, actor=request.user)
        except Exception as exc:
            logger.warning("Staff creation email failed for %s: %s", user.id, exc)
        return Response(UserDetailSerializer(user).data, status=status.HTTP_201_CREATED)


class SchoolScopedStudentCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, school_id):
        school = get_object_or_404(School, id=school_id)
        registration_error = _student_registration_error(request)
        if registration_error:
            return registration_error
        error = _school_access_error(request, school, write=True)
        if error:
            return error
        payload = request.data.copy()
        payload['school'] = school.id
        serializer = StudentCreateSerializer(data=payload, context={'request': request})
        serializer.is_valid(raise_exception=True)
        # Students get no account email: the school hands over their credentials.
        student = serializer.save()
        data = StudentDetailSerializer(student, context={'request': request}).data
        data['student_matricule'] = student.display_matricule
        data['activation_token'] = student.display_matricule
        data['parent_matricule'] = getattr(student, '_parent_matricule', None)
        return Response(data, status=status.HTTP_201_CREATED)


class SchoolScopedStudentBulkCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, school_id):
        school = get_object_or_404(School, id=school_id)
        registration_error = _student_registration_error(request)
        if registration_error:
            return registration_error
        error = _school_access_error(request, school, write=True)
        if error:
            return error

        from apps.students.views import StudentViewSet

        view = StudentViewSet.as_view({'post': 'bulk_upload'})
        return view(request._request)


from .models import SchoolEvent
from .serializers import SchoolEventSerializer


class SchoolEventViewSet(viewsets.ModelViewSet):
    """School-scoped events: every user in the school can view them; only the
    school's administrators can create, update or delete."""

    serializer_class = SchoolEventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not getattr(user, 'school_id', None):
            return SchoolEvent.objects.none()
        return SchoolEvent.objects.select_related('created_by').filter(school=user.school)

    def _require_school_admin(self):
        if self.request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied('Only school administrators can manage school events.')

    def perform_create(self, serializer):
        self._require_school_admin()
        event = serializer.save(school=self.request.user.school, created_by=self.request.user)
        try:
            from apps.notifications.utils import notify_users

            UserModel = get_user_model()
            recipients = UserModel.objects.filter(school=event.school, is_drafted=False)
            notify_users(
                recipients,
                'New school event',
                f'{event.title}' + (f' — {event.event_date}' if event.event_date else ''),
                notification_type='announcement',
                sender=self.request.user,
            )
        except Exception:  # noqa: BLE001
            pass

    def perform_update(self, serializer):
        self._require_school_admin()
        serializer.save()

    def perform_destroy(self, instance):
        self._require_school_admin()
        instance.delete()


class SchoolCommunityDirectoryView(APIView):
    """Whole-school directory for the Community tab. Every member of a school
    (student, parent, teacher, bursar, librarian, admin) sees the same
    students / staff / parents lists — no role restrictions."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if not getattr(user, 'school_id', None):
            return Response({'students': [], 'staff': [], 'parents': []})

        from apps.chat.presence import is_online

        UserModel = get_user_model()

        # Resolved once: the directory lists these students and also counts how
        # many children each parent in the school has.
        school_students = list(
            students_api.list_students(school=user.school).filter(
                Q(user__isnull=True) | Q(user__is_drafted=False)
            )
        )

        students = [
            {
                'id': str(s.id),
                'user_id': str(s.user_id) if s.user_id else '',
                'name': s.user.name if s.user else '',
                'avatar': (s.user.avatar if s.user else '') or '',
                'matricule': (s.user.matricule if s.user else '') or '',
                'admission_number': s.admission_number or '',
                'class_name': (s.school_class.name if s.school_class_id else '') or s.student_class or '',
                'class_level': s.class_level or '',
                'is_online': is_online(str(s.user_id)) if s.user_id else False,
            }
            for s in school_students
        ]

        staff_roles = ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR', 'LIBRARIAN', 'TEACHER']
        # What each teacher teaches (class + subject), for the staff "View" detail.
        from apps.grades.models import ClassSubject

        teaching_by_teacher = {}
        for link in ClassSubject.objects.filter(
            school_class__school=user.school
        ).select_related('school_class', 'subject', 'teacher').exclude(teacher__isnull=True):
            key = str(link.teacher_id)
            teaching_by_teacher.setdefault(key, []).append({
                'class_name': link.school_class.name if link.school_class_id else '',
                'subject_name': link.subject.name if link.subject_id else '',
            })

        staff = [
            {
                'id': str(u.id), 'name': u.name, 'avatar': u.avatar or '',
                'matricule': u.matricule or '', 'role': u.role,
                'teaching': teaching_by_teacher.get(str(u.id), []),
                'is_online': is_online(str(u.id)),
            }
            for u in UserModel.objects.filter(school=user.school, role__in=staff_roles, is_drafted=False)
        ]

        children_by_parent = {}
        for guardians in students_api.get_guardian_users_by_student(school_students).values():
            for guardian in guardians:
                key = str(guardian.id)
                children_by_parent[key] = children_by_parent.get(key, 0) + 1
        parents = [
            {
                'id': str(u.id),
                'name': u.name,
                'avatar': u.avatar or '',
                'matricule': u.matricule or '',
                'children_count': children_by_parent.get(str(u.id), 0),
                'is_online': is_online(str(u.id)),
            }
            for u in UserModel.objects.filter(school=user.school, role='PARENT', is_drafted=False)
        ]

        return Response({'students': students, 'staff': staff, 'parents': parents})

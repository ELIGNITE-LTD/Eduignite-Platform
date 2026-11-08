"""Linked school accounts for school administrators.

One person can run several schools (for example a secondary school and a
primary school). Each school keeps its OWN separate SCHOOL_ADMIN account, with
its own matricule and password, and each can still sign in on its own. This
module only adds the "same person owns these accounts" link, so the owner can:

* create a primary (basic education) school from their account;
* link an existing, separate school login after proving ownership once
  (matricule + password, checked the same way login checks it);
* switch between linked schools without retyping credentials.

Security model
--------------
* Only a real SCHOOL_ADMIN (not a sub-admin, not a teacher twin) may use it.
* A switch can only reach an account that is in the SAME link group as the
  authenticated requester, and that group only ever contains accounts whose
  owner proved ownership (password) or that were created from the account.
  Tokens are issued for the target's own user, so role and school are exactly
  those of the target account: nothing is ever granted that it did not have.
* A school created here is a DRAFT (School.is_drafted / User.is_drafted, the
  platform's existing draft mechanism) and is brought live by EduIgnite
  restoring it from Drafts. Until then its account cannot sign in or be
  switched to. ``draft_delete_after`` is left empty so the six-month purge job
  never removes it.
"""

import logging
import re
import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .matricules import generate_school_short_name, generate_school_user_matricule
from .models import AccountLinkEvent, AccountLinkGroup, LinkedAccount

User = get_user_model()
logger = logging.getLogger(__name__)

#: Most schools one person can hold in a group. A guard against abuse.
MAX_LINKED_SCHOOLS = 10
#: Failed ownership proofs allowed per requester / per target in the window.
LINK_MAX_FAILURES = 5
LINK_TARGET_MAX_FAILURES = 10
LINK_FAILURE_WINDOW_SECONDS = 15 * 60

GENERIC_LINK_ERROR = 'We could not link this account. Check the matricule and password and try again.'
PENDING_ACTIVATION_MARKER = '!pending_activation'


# -- helpers ----------------------------------------------------------------


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip() or None
    return request.META.get('REMOTE_ADDR') or None


def _audit(request, action, *, group, target=None, detail=''):
    try:
        AccountLinkEvent.objects.create(
            group=group,
            actor=request.user,
            target=target,
            action=action,
            ip_address=_client_ip(request),
            detail=detail[:255],
        )
    except Exception:  # noqa: BLE001 - an audit failure must not break the action
        logger.exception('Could not write account link audit event')
    logger.info(
        'linked-accounts action=%s actor=%s target=%s group=%s',
        action, request.user.pk, getattr(target, 'pk', None), getattr(group, 'pk', None),
    )


class IsLinkableSchoolAdmin(BasePermission):
    """Only a school's own SCHOOL_ADMIN. Sub-admins, teachers, twins: never."""

    message = 'Only a school administrator can manage linked schools.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.role == 'SCHOOL_ADMIN'
            and not user.is_teacher_twin
            and user.school_id
            and not user.is_drafted
        )


def _group_of(user):
    link = LinkedAccount.objects.select_related('group').filter(user=user).first()
    return link.group if link else None


def _ensure_group(user):
    """The requester's group, created on first use with the requester as origin."""
    link = LinkedAccount.objects.select_related('group').filter(user=user).first()
    if link:
        return link.group
    group = AccountLinkGroup.objects.create()
    LinkedAccount.objects.create(group=group, user=user, linked_via=LinkedAccount.VIA_ORIGIN)
    return group


def _account_status(user):
    school = user.school
    if user.is_drafted or (school is not None and school.is_drafted):
        return 'pending_activation'
    if user.is_currently_suspended or (school is not None and school.status == 'Suspended'):
        return 'suspended'
    if not user.is_active:
        return 'inactive'
    return 'active'


def _account_payload(user, current_user):
    school = user.school
    return {
        'account_id': str(user.id),
        'school_id': school.id if school else None,
        'school_name': school.name if school else '',
        'education_category': school.education_category if school else '',
        'matricule': user.matricule,
        'status': _account_status(user),
        'is_current': user.id == current_user.id,
        'can_switch': user.id != current_user.id and _account_status(user) == 'active',
    }


def _members(group):
    return (
        User.objects.filter(account_link__group=group, role='SCHOOL_ADMIN', is_teacher_twin=False)
        .select_related('school')
        .order_by('account_link__linked_at')
    )


def _listing(user):
    group = _group_of(user)
    if group is None:
        accounts = [_account_payload(user, user)]
    else:
        accounts = [_account_payload(member, user) for member in _members(group)]
    return {
        'current_account_id': str(user.id),
        'max_schools': MAX_LINKED_SCHOOLS,
        'accounts': accounts,
    }


# -- serializers ------------------------------------------------------------


class CreatePrimarySchoolSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    location = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=20)
    principal = serializers.CharField(max_length=255)
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_name(self, value):
        value = ' '.join(value.split())
        if len(value) < 3:
            raise serializers.ValidationError('Enter the full name of the school.')
        return value

    def validate_phone(self, value):
        value = re.sub(r'[\s().-]+', '', value.strip())
        if not re.fullmatch(r'\+?1?\d{9,15}', value):
            raise serializers.ValidationError('Enter a valid phone number.')
        return value


class LinkExistingSerializer(serializers.Serializer):
    matricule = serializers.CharField(max_length=50)
    password = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)


class AccountIdSerializer(serializers.Serializer):
    account_id = serializers.UUIDField()


# -- views ------------------------------------------------------------------


def _unique_school_id(name):
    from apps.schools.models import School

    base = re.sub(r'[^A-Za-z0-9_-]+', '-', generate_school_short_name(name).upper()).strip('-') or 'SCH'
    candidate = base
    counter = 2
    while School.objects.filter(id=candidate).exists():
        candidate = f'{base}-{counter}'
        counter += 1
    return candidate


class LinkedSchoolsView(APIView):
    """GET /users/linked-schools/ - the schools linked to the signed-in admin."""

    permission_classes = [IsAuthenticated, IsLinkableSchoolAdmin]

    def get(self, request):
        return Response(_listing(request.user))


class CreatePrimarySchoolView(APIView):
    """POST /users/linked-schools/create-primary/

    Creates a DRAFT primary (basic education) school with its own new
    SCHOOL_ADMIN account, and links it to the requester. The new account's
    matricule and a one-time temporary password are returned ONCE.
    """

    permission_classes = [IsAuthenticated, IsLinkableSchoolAdmin]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'account_create'

    def post(self, request):
        from apps.schools.models import School, SchoolSettings

        serializer = CreatePrimarySchoolSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        name = data['name']

        if School.objects.filter(name__iexact=name).exists():
            return Response(
                {'detail': 'A school with this name already exists.', 'code': 'duplicate_name'},
                status=status.HTTP_409_CONFLICT,
            )
        email = (data.get('email') or '').strip().lower()
        if email and User.objects.filter(email__iexact=email).exists():
            return Response(
                {'detail': 'This email is already used by another account.', 'code': 'duplicate_email'},
                status=status.HTTP_409_CONFLICT,
            )

        temp_password = secrets.token_urlsafe(9)
        now = timezone.now()
        try:
            with transaction.atomic():
                # Serialise concurrent submits from the same admin.
                requester = User.objects.select_for_update().get(pk=request.user.pk)
                group = _ensure_group(requester)
                if group.accounts.count() >= MAX_LINKED_SCHOOLS:
                    return Response(
                        {'detail': f'You can link at most {MAX_LINKED_SCHOOLS} schools.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                school = School.objects.create(
                    id=_unique_school_id(name),
                    name=name,
                    short_name=generate_school_short_name(name),
                    principal=data['principal'],
                    location=data['location'],
                    phone=data['phone'],
                    email=email,
                    education_category=School.EDUCATION_CATEGORY_BASIC,
                    status='Pending',
                    is_drafted=True,
                    drafted_at=now,
                    draft_delete_after=None,
                    draft_reason='Created from a linked school account; awaiting activation by EduIgnite.',
                    drafted_by=requester,
                )
                matricule = generate_school_user_matricule(school, 'SCHOOL_ADMIN')
                admin = User.objects.create_user(
                    matricule=matricule,
                    name=data['principal'],
                    email=email or f'school.admin.{school.id.lower()}@linked.eduignite.local',
                    role='SCHOOL_ADMIN',
                    password=temp_password,
                    school=school,
                    phone=data['phone'],
                    is_active=False,
                    is_drafted=True,
                    drafted_at=now,
                    draft_delete_after=None,
                    draft_reason=school.draft_reason,
                    drafted_by=requester,
                    must_change_password=True,
                    is_license_paid=False,
                )
                school.principal_user = admin
                school.save(update_fields=['principal_user'])
                SchoolSettings.objects.get_or_create(school=school)
                LinkedAccount.objects.create(group=group, user=admin, linked_via=LinkedAccount.VIA_CREATED)
                _audit(request, 'create', group=group, target=admin, detail=f'school={school.id}')
        except IntegrityError:
            return Response(
                {'detail': 'This school could not be created. It may already exist; please try again.'},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                'school': {
                    'id': school.id,
                    'name': school.name,
                    'education_category': school.education_category,
                    'status': 'pending_activation',
                },
                'account': _account_payload(admin, request.user),
                # Shown ONCE. The password is not stored in readable form.
                'credentials': {
                    'matricule': admin.matricule,
                    'temporary_password': temp_password,
                    'must_change_password': True,
                },
                'message': (
                    'School created and waiting for EduIgnite to activate it. Keep this matricule '
                    'and temporary password: the password is shown only once. After activation you '
                    'can switch to this school from your profile, or sign in with them.'
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class LinkExistingSchoolView(APIView):
    """POST /users/linked-schools/link/ - prove ownership of another admin account."""

    permission_classes = [IsAuthenticated, IsLinkableSchoolAdmin]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'account_link'

    @staticmethod
    def _refuse(status_code=status.HTTP_400_BAD_REQUEST):
        return Response({'detail': GENERIC_LINK_ERROR}, status=status_code)

    def post(self, request):
        serializer = LinkExistingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        matricule = serializer.validated_data['matricule'].strip()
        password = serializer.validated_data['password']

        requester_key = f'acctlink:fail:u:{request.user.pk}'
        target_key = f'acctlink:fail:m:{matricule.lower()}'
        if (
            cache.get(requester_key, 0) >= LINK_MAX_FAILURES
            or cache.get(target_key, 0) >= LINK_TARGET_MAX_FAILURES
        ):
            return Response(
                {'detail': 'Too many attempts. Please wait a few minutes and try again.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        def fail():
            for key in (requester_key, target_key):
                try:
                    cache.add(key, 0, LINK_FAILURE_WINDOW_SECONDS)
                    cache.incr(key)
                except Exception:  # noqa: BLE001
                    pass
            return self._refuse()

        target = User.objects.filter(matricule=matricule).select_related('school').first()
        if target is None:
            # Same work as a real check so timing does not reveal existence.
            make_password(password)
            return fail()
        if password == PENDING_ACTIVATION_MARKER or not target.check_password(password):
            return fail()

        # Ownership proven. From here the owner of the account is asking.
        if (
            target.id == request.user.id
            or target.role != 'SCHOOL_ADMIN'
            or target.is_teacher_twin
            or not target.school_id
            or not target.is_active
            or target.is_drafted
            or target.is_currently_suspended
            or target.school.is_drafted
        ):
            return fail()

        with transaction.atomic():
            requester = User.objects.select_for_update().get(pk=request.user.pk)
            group = _ensure_group(requester)
            existing = LinkedAccount.objects.filter(user=target).select_related('group').first()
            if existing and existing.group_id == group.id:
                return Response(
                    {'detail': 'This school is already linked to your account.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if existing:
                # Already part of someone else's group: never merge groups.
                return fail()
            if group.accounts.count() >= MAX_LINKED_SCHOOLS:
                return Response(
                    {'detail': f'You can link at most {MAX_LINKED_SCHOOLS} schools.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            LinkedAccount.objects.create(group=group, user=target, linked_via=LinkedAccount.VIA_PASSWORD)
            _audit(request, 'link', group=group, target=target)

        cache.delete(requester_key)
        cache.delete(target_key)
        return Response(
            {'account': _account_payload(target, request.user), **_listing(request.user)},
            status=status.HTTP_201_CREATED,
        )


class SwitchSchoolView(APIView):
    """POST /users/linked-schools/switch/ {account_id} - sign in as a linked account."""

    permission_classes = [IsAuthenticated, IsLinkableSchoolAdmin]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'account_switch'

    def post(self, request):
        from apps.authentication.views import build_user_payload
        from apps.platform.access import user_school_access_blocked

        serializer = AccountIdSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account_id = serializer.validated_data['account_id']

        denied = Response(
            {'detail': 'You cannot switch to this school.'}, status=status.HTTP_403_FORBIDDEN,
        )
        group = _group_of(request.user)
        if group is None:
            return denied
        # Target must be a member of the requester's OWN group, nothing else.
        target = (
            User.objects.filter(pk=account_id, account_link__group=group)
            .select_related('school')
            .first()
        )
        if target is None or target.id == request.user.id:
            return denied
        if target.role != 'SCHOOL_ADMIN' or target.is_teacher_twin or not target.school_id:
            return denied

        if target.is_drafted or target.school.is_drafted:
            return Response(
                {
                    'detail': 'This school is waiting for EduIgnite to activate it. You can switch to it once it is active.',
                    'code': 'pending_activation',
                },
                status=status.HTTP_409_CONFLICT,
            )
        if target.is_suspended:
            if target.is_currently_suspended:
                return Response(
                    {'detail': 'This school account is suspended.', 'code': 'suspended'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            target.lift_suspension()
        if not target.is_active:
            return Response(
                {'detail': 'This school account is inactive.', 'code': 'inactive'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if user_school_access_blocked(target):
            return Response(
                {
                    'detail': "This school's subscription is unpaid, so accounts are not active yet.",
                    'school_subscription_unpaid': True,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Retire the session being left, as logout does. Best effort, and only
        # if the refresh token really belongs to the requester.
        old_refresh = request.data.get('refresh_token') or request.data.get('refresh')
        if old_refresh:
            try:
                old = RefreshToken(old_refresh)
                if str(old.get('user_id')) == str(request.user.pk):
                    old.blacklist()
            except Exception:  # noqa: BLE001
                pass

        refresh = RefreshToken.for_user(target)
        target.last_login = timezone.now()
        target.save(update_fields=['last_login'])
        _audit(request, 'switch', group=group, target=target)

        return Response(
            {
                'access_token': str(refresh.access_token),
                'refresh_token': str(refresh),
                'user': build_user_payload(target),
            },
            status=status.HTTP_200_OK,
        )


class UnlinkSchoolView(APIView):
    """POST /users/linked-schools/unlink/ {account_id}

    Removes an account from the group (the accounts themselves are untouched).
    The signed-in admin may unlink another member or leave the group themself.
    """

    permission_classes = [IsAuthenticated, IsLinkableSchoolAdmin]

    def post(self, request):
        serializer = AccountIdSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        group = _group_of(request.user)
        link = None
        if group is not None:
            link = LinkedAccount.objects.filter(
                group=group, user_id=serializer.validated_data['account_id']
            ).select_related('user').first()
        if link is None:
            return Response({'detail': 'This school is not linked to your account.'}, status=status.HTTP_404_NOT_FOUND)
        target = link.user
        with transaction.atomic():
            link.delete()
            _audit(request, 'unlink', group=group, target=target)
        return Response(_listing(request.user))

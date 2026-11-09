from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.tokens import default_token_generator
from django.conf import settings as django_settings
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from drf_spectacular.utils import extend_schema
import logging

from core.email_service import send_password_reset_email
from .serializers import (
    LoginSerializer,
    TokenResponseSerializer,
    FirebaseLoginSerializer,
    ActivateAccountSerializer,
    ChangePasswordSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
)
from .firebase_backend import FirebaseAuthentication

User = get_user_model()
logger = logging.getLogger(__name__)

PENDING_ACTIVATION_MARKER = '!pending_activation'


def principal_contact_for_student(student_user):
    """Who a student should ask for a new password: their own school's principal.

    Only that school's principal, and only what a school shows publicly — name,
    photo, phone, school name. Never an email address, never another school.
    """
    school = getattr(student_user, 'school', None)
    if school is None:
        return None
    principal = getattr(school, 'principal_user', None)
    return {
        'school_name': school.name,
        'school_logo': school.logo or None,
        'principal_name': (getattr(principal, 'name', '') or school.principal or '').strip(),
        'principal_avatar': getattr(principal, 'avatar', None) or None,
        'phone': (getattr(principal, 'phone', '') or school.phone or '').strip(),
    }


def _allowed_modules(user):
    from apps.users.executive_modules import clean_modules

    return clean_modules(getattr(user, 'allowed_modules', None))


def build_user_payload(user):
    school_data = None
    if user.school:
        live_student_count = user.school.students.count()
        live_teacher_count = user.school.users.filter(role='TEACHER').count()
        school_data = {
            'id': user.school.id,
            'name': user.school.name,
            'short_name': user.school.short_name,
            'principal': user.school.principal,
            'motto': user.school.motto,
            'logo': user.school.logo,
            'banner': user.school.banner,
            'description': user.school.description,
            'location': user.school.location,
            'region': user.school.region,
            'division': user.school.division,
            'sub_division': user.school.sub_division,
            'city_village': user.school.city_village,
            'address': user.school.address,
            'postal_code': user.school.postal_code,
            'phone': user.school.phone,
            'email': user.school.email,
            'status': user.school.status,
            'student_count': live_student_count,
            'teacher_count': live_teacher_count,
            'matricule': user.school.matricule,
        }

    return {
        'id': str(user.id),
        'uid': user.uid,
        'matricule': user.matricule,
        'name': user.name,
        'email': user.email,
        'phone': user.phone or '',
        'whatsapp': user.whatsapp or '',
        'role': user.role,
        'school': school_data,
        'avatar': user.avatar or None,
        'is_license_paid': user.is_license_paid,
        'ai_request_count': user.ai_request_count,
        'is_active': user.is_active,
        'date_joined': user.date_joined.isoformat() if user.date_joined else None,
        'is_platform_executive': user.is_platform_executive,
        'is_school_admin': user.is_school_admin,
        # True after a principal reset: the app must ask for a new password.
        'must_change_password': bool(getattr(user, 'must_change_password', False)),
        # What an executive may do is the list the founders assigned. The client
        # builds the menu and the Overview from it, so it must arrive with the
        # login and /auth/me payloads, not only from /users/me/.
        'allowed_modules': _allowed_modules(user),
        'is_founder': str(getattr(user, 'role', '') or '').upper() in ('CEO', 'CTO'),
    }


class MatriculeLoginView(APIView):
    """
    POST /auth/login/
    Login with matricule and password.
    Returns access token, refresh token, and user profile.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    @extend_schema(
        request=LoginSerializer,
        responses={
            200: TokenResponseSerializer,
            400: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
        },
        tags=['Authentication'],
        description='Login with matricule and password',
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        matricule = serializer.validated_data['matricule']
        password = serializer.validated_data['password']

        try:
            user = User.objects.get(matricule=matricule)
        except User.DoesNotExist:
            return Response(
                {'detail': 'Matricule does not exist.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Suspension: if the suspension window has elapsed, lift it automatically
        # and let the user back in; otherwise block with a clear reason/date.
        if getattr(user, 'is_suspended', False):
            if user.is_currently_suspended:
                if user.suspended_until:
                    from django.utils import timezone as _tz
                    until = _tz.localtime(user.suspended_until).strftime('%d %b %Y')
                    detail = f'Your account is suspended until {until}.'
                else:
                    detail = 'Your account has been suspended by your school administrator.'
                if user.suspension_reason:
                    detail = f'{detail} Reason: {user.suspension_reason}'
                return Response({'detail': detail}, status=status.HTTP_403_FORBIDDEN)
            user.lift_suspension()

        if not user.is_active:
            return Response(
                {'detail': 'User account is inactive'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # A school whose one-time subscription is unpaid cannot be used by its
        # members (parents and platform executives excepted) until a founder
        # changes the status or the school pays.
        from apps.platform.access import user_school_access_blocked

        if user_school_access_blocked(user):
            return Response(
                {
                    'detail': (
                        'Your school\'s subscription is unpaid, so accounts are not '
                        'active yet. Ask your school administrator to settle it, or '
                        'contact EduIgnite.'
                    ),
                    'school_subscription_unpaid': True,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # '!pending_activation' marks an account that has not been activated
        # yet (see ActivateAccountView). It is stored as a real hash, so it
        # must never work as a password: it is written in this source code.
        if password == PENDING_ACTIVATION_MARKER or not user.check_password(password):
            from apps.platform.api import record_login
            record_login(request, user, success=False, reason='wrong password')
            return Response(
                {'detail': 'Wrong password.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        refresh = RefreshToken.for_user(user)
        user.last_login = __import__('django.utils.timezone', fromlist=['now']).now()
        user.save(update_fields=['last_login'])

        from apps.platform.api import record_login
        record_login(request, user, success=True)

        response_data = {
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
            'user': build_user_payload(user),
        }

        return Response(response_data, status=status.HTTP_200_OK)


class FirebaseLoginView(APIView):
    """
    POST /auth/firebase-login/
    Login with Firebase ID token.
    Returns access token, refresh token, and user profile.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    @extend_schema(
        request=FirebaseLoginSerializer,
        responses={
            200: TokenResponseSerializer,
            400: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
        },
        tags=['Authentication'],
        description='Login with Firebase ID token',
    )
    def post(self, request):
        serializer = FirebaseLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        id_token = serializer.validated_data['id_token']

        firebase_auth = FirebaseAuthentication()
        try:
            from firebase_admin import auth as fb_auth
            decoded_token = fb_auth.verify_id_token(id_token)
        except Exception as e:
            logger.warning(f'Firebase token verification failed: {str(e)}')
            return Response(
                {'detail': 'Invalid Firebase token'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        uid = decoded_token.get('uid')
        try:
            user = User.objects.get(uid=uid)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not user.is_active:
            return Response(
                {'detail': 'User account is inactive'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # A school whose one-time subscription is unpaid cannot be used by its
        # members (parents and platform executives excepted) until a founder
        # changes the status or the school pays.
        from apps.platform.access import user_school_access_blocked

        if user_school_access_blocked(user):
            return Response(
                {
                    'detail': (
                        'Your school\'s subscription is unpaid, so accounts are not '
                        'active yet. Ask your school administrator to settle it, or '
                        'contact EduIgnite.'
                    ),
                    'school_subscription_unpaid': True,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = RefreshToken.for_user(user)
        user.last_login = __import__('django.utils.timezone', fromlist=['now']).now()
        user.save(update_fields=['last_login'])

        response_data = {
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
            'user': build_user_payload(user),
        }

        return Response(response_data, status=status.HTTP_200_OK)


class RefreshTokenView(APIView):
    """
    POST /auth/refresh/
    Refresh access token using refresh token.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'refresh'

    @extend_schema(
        request={'type': 'object', 'properties': {'refresh': {'type': 'string'}}},
        responses={
            200: {'type': 'object', 'properties': {'access': {'type': 'string'}}},
        },
        tags=['Authentication'],
        description='Refresh access token',
    )
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'detail': 'Refresh token required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            refresh = RefreshToken(refresh_token)
            # A session ended by a credential reset or deactivation stays ended.
            from .jwt_auth import token_is_revoked

            owner = User.objects.filter(pk=refresh.get('user_id')).first()
            if owner is None or token_is_revoked(refresh, owner):
                raise ValueError('revoked')
            return Response({'access': str(refresh.access_token)}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'detail': 'Invalid refresh token'},
                status=status.HTTP_401_UNAUTHORIZED,
            )


class LogoutView(APIView):
    """
    POST /auth/logout/
    Logout by blacklisting refresh token.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request={'type': 'object', 'properties': {'refresh': {'type': 'string'}}},
        responses={
            200: {'type': 'object', 'properties': {'detail': {'type': 'string'}}},
        },
        tags=['Authentication'],
        description='Logout and blacklist refresh token',
    )
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'detail': 'Refresh token required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            refresh = RefreshToken(refresh_token)
            refresh.blacklist()
            return Response({'detail': 'Logged out successfully'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'detail': 'Invalid refresh token'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ActivateAccountView(APIView):
    """
    POST /auth/activate/
    First-time account activation and password setting.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'activation'

    @extend_schema(
        request=ActivateAccountSerializer,
        responses={200: {'type': 'object', 'properties': {'detail': {'type': 'string'}}}},
        tags=['Authentication'],
        description='Activate account and set password',
    )
    def post(self, request):
        serializer = ActivateAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        matricule = serializer.validated_data['matricule']
        new_password = serializer.validated_data['new_password']

        user = User.objects.filter(matricule=matricule).first()

        # Students claim their account once: see _activate_student.
        if user is not None and (user.role or '').upper() == 'STUDENT':
            return self._activate_student(user, new_password)

        if user:
            if user.has_usable_password() and not user.check_password(PENDING_ACTIVATION_MARKER):
                return Response(
                    {'detail': 'This matricule is already used.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            from apps.students import api as students_api

            activation = students_api.get_pending_activation(matricule)
            if activation is None:
                if students_api.activation_was_used(matricule):
                    return self._student_not_eligible()
                return Response(
                    {'detail': 'User not found'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            return self._activate_student_from_token(activation, matricule, new_password)

        user.set_password(new_password)
        user.must_change_password = False
        user.save(update_fields=['password', 'must_change_password'])

        refresh = RefreshToken.for_user(user)
        user.last_login = __import__('django.utils.timezone', fromlist=['now']).now()
        user.save(update_fields=['last_login'])

        response_data = {
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
            'user': build_user_payload(user),
        }

        return Response(response_data, status=status.HTTP_200_OK)

    # -- Student self-activation ("Activate My Account") ----------------------
    #
    # The school creates the student and the account is active at once; that
    # status is the school's and is not touched here. Self-activation is a
    # separate, one-time privilege: the student sets their own password. It is
    # spent on the student record, so a password reset never brings it back,
    # and it never signs the student in: they log in normally afterwards, where
    # every existing check (suspension, subscription) still applies.

    STUDENT_ACTIVATED = (
        'Account activated successfully. You can now log in with your matricule and password.'
    )

    @staticmethod
    def _student_not_eligible():
        # One answer for every refusal, so it says nothing about the account.
        return Response(
            {
                'detail': (
                    'This account cannot be activated. If you have already activated it, '
                    'log in with your password, or ask your school to reset it.'
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    def _student_activated(self):
        return Response({'detail': self.STUDENT_ACTIVATED, 'activated': True}, status=status.HTTP_200_OK)

    def _activate_student(self, user, new_password):
        from django.db import transaction
        from apps.students import api as students_api

        student = students_api.get_student_for_user(user)
        # The existing account rules decide eligibility; nothing here overrides them.
        if (
            student is None
            or not user.is_active
            or getattr(user, 'is_drafted', False)
            or getattr(user, 'is_currently_suspended', False)
        ):
            return self._student_not_eligible()
        # A student who already signs in with a password is never overwritten
        # through this form: they log in, or their principal resets it.
        if user.has_usable_password() and not user.check_password(PENDING_ACTIVATION_MARKER):
            return self._student_not_eligible()

        with transaction.atomic():
            if not students_api.claim_self_activation(student.pk):
                return self._student_not_eligible()
            user.set_password(new_password)
            user.must_change_password = False
            user.save(update_fields=['password', 'must_change_password'])
        return self._student_activated()

    def _activate_student_from_token(self, activation, matricule, new_password):
        """A student whose record waits on an activation sheet: create it, and spend the claim."""
        from django.db import IntegrityError, transaction
        from apps.students import api as students_api

        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    matricule=activation['matricule'],
                    name=activation['student_name'],
                    email=activation['placeholder_email'],
                    role='STUDENT',
                    school=activation['school'],
                    password=PENDING_ACTIVATION_MARKER,
                )
                student = students_api.create_student_from_activation(user, matricule)
                # No student means the token was spent between the lookup and
                # here; raising rolls back the user created above.
                if student is None or not students_api.claim_self_activation(student.pk):
                    raise IntegrityError('activation already spent')
                user.set_password(new_password)
                user.save(update_fields=['password'])
        except IntegrityError:
            # Also a second request racing this one for the same matricule.
            return self._student_not_eligible()
        return self._student_activated()


class ChangePasswordView(APIView):
    """
    POST /auth/change-password/
    Change password for authenticated user.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ChangePasswordSerializer,
        responses={200: {'type': 'object', 'properties': {'detail': {'type': 'string'}}}},
        tags=['Authentication'],
        description='Change password for authenticated user',
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        new_password = serializer.validated_data['new_password']

        user.set_password(new_password)
        user.must_change_password = False
        user.save(update_fields=['password', 'must_change_password'])

        return Response(
            {'detail': 'Password changed successfully'},
            status=status.HTTP_200_OK,
        )


class PasswordResetRequestView(APIView):
    """
    POST /auth/password-reset/
    Request password reset with email verification.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    @staticmethod
    def _student_recovery(user) -> dict:
        """What to tell a student who cannot sign in.

        Either 'activate your account', or 'see your principal'. Never 'check
        your email': no email is sent to a student, nor to their parent.
        """

        from apps.students import api as students_api

        student = students_api.get_student_for_user(user)
        never_set_a_password = (
            not user.has_usable_password()
            or user.check_password(PENDING_ACTIVATION_MARKER)
        )
        can_activate = bool(
            student is not None
            and user.is_active
            and not getattr(user, 'is_drafted', False)
            and not getattr(user, 'is_currently_suspended', False)
            and never_set_a_password
            and students_api.self_activation_available(student.pk)
        )

        if can_activate:
            return {
                'is_student': True,
                'can_self_activate': True,
                'detail': (
                    'Your account is ready. Choose your own password now using '
                    'your matricule, on the Activate my account screen.'
                ),
            }

        return {
            'is_student': True,
            'can_self_activate': False,
            'detail': (
                "Your password can only be reset by your school's Principal. "
                "Please contact your Principal for assistance."
            ),
            'principal_contact': principal_contact_for_student(user),
        }

    @extend_schema(
        request=PasswordResetRequestSerializer,
        responses={200: {'type': 'object', 'properties': {'detail': {'type': 'string'}}}},
        tags=['Authentication'],
        description='Request password reset',
    )
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        matricule = serializer.validated_data['matricule']

        try:
            user = User.objects.get(matricule=matricule)

            # Students never get a reset email. What they are told depends on
            # whether they have ever set a password of their own.
            #
            # A student who has not activated yet does not need anybody: the
            # school created the account and it is already active for staff to
            # work with, but the password is still the placeholder, so the
            # student claims it themselves with their matricule. Sending them
            # to the principal for that would be asking for help they do not
            # need, on their very first visit.
            #
            # Once that one-time activation is spent, the password is theirs,
            # and a forgotten one really is the principal's to reset.
            if (user.role or '').upper() == 'STUDENT':
                return Response(self._student_recovery(user), status=status.HTTP_200_OK)

            # A reset link must be short-lived and single-use. Django's
            # default_token_generator expires after PASSWORD_RESET_TIMEOUT and
            # self-invalidates the moment the password changes (the hash it
            # signs is derived from the current password), so a used or leaked
            # link cannot be replayed.
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
            raw_token = default_token_generator.make_token(user)
            frontend_url = getattr(django_settings, 'FRONTEND_URL', 'https://eduignite.online').rstrip('/')
            reset_url = f"{frontend_url}/reset-password?token={uidb64}.{raw_token}"
            valid_minutes = max(1, int(getattr(django_settings, 'PASSWORD_RESET_TIMEOUT', 300)) // 60)

            if send_password_reset_email(user, reset_url, valid_minutes):
                logger.info("Password reset email sent for user %s", user.pk)
            else:
                logger.warning("Password reset email was not delivered to provider for user %s", user.pk)

        except User.DoesNotExist:
            pass  # Don't leak whether the matricule exists

        # Always return the same response regardless of whether user exists
        return Response(
            {'detail': 'If an account with that matricule exists, a password reset link has been sent.'},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """
    POST /auth/password-reset/confirm/
    Confirm password reset with token.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    @extend_schema(
        request=PasswordResetConfirmSerializer,
        responses={200: {'type': 'object', 'properties': {'detail': {'type': 'string'}}}},
        tags=['Authentication'],
        description='Confirm password reset',
    )
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data['token']
        new_password = serializer.validated_data['new_password']

        try:
            uidb64, raw_token = token.split('.', 1)
            user_id = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=user_id)
            if not default_token_generator.check_token(user, raw_token):
                raise ValueError('Invalid or expired reset token')

            user.set_password(new_password)
            user.must_change_password = False
            user.save(update_fields=['password', 'must_change_password'])

            return Response(
                {'detail': 'Password reset successfully'},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            logger.warning(f'Password reset token validation failed: {str(e)}')
            return Response(
                {'detail': 'Invalid or expired reset token'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class MeView(APIView):
    """
    GET /auth/me/
    Return current authenticated user's full profile.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'id': {'type': 'string'},
                    'matricule': {'type': 'string'},
                    'name': {'type': 'string'},
                    'email': {'type': 'string'},
                    'phone': {'type': 'string'},
                    'whatsapp': {'type': 'string'},
                    'role': {'type': 'string'},
                    'school': {'type': 'object'},
                    'avatar': {'type': 'string'},
                    'is_license_paid': {'type': 'boolean'},
                    'ai_request_count': {'type': 'integer'},
                    'is_active': {'type': 'boolean'},
                    'date_joined': {'type': 'string'},
                },
            },
        },
        tags=['Authentication'],
        description='Get current user profile',
    )
    def get(self, request):
        return Response(build_user_payload(request.user), status=status.HTTP_200_OK)

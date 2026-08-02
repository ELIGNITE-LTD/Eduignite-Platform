from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model, authenticate
from django.conf import settings as django_settings
from django.utils.html import escape
from drf_spectacular.utils import extend_schema
import logging

from core.email_service import send_transactional_email
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
    }


class MatriculeLoginView(APIView):
    """
    POST /auth/login/
    Login with matricule and password.
    Returns access token, refresh token, and user profile.
    """
    permission_classes = [AllowAny]

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

        if not user.check_password(password):
            return Response(
                {'detail': 'Wrong password.'},
                status=status.HTTP_401_UNAUTHORIZED,
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


class FirebaseLoginView(APIView):
    """
    POST /auth/firebase-login/
    Login with Firebase ID token.
    Returns access token, refresh token, and user profile.
    """
    permission_classes = [AllowAny]

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

        if user:
            if user.has_usable_password() and not user.check_password('!pending_activation'):
                return Response(
                    {'detail': 'This matricule is already used.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            from apps.students import api as students_api

            activation = students_api.get_pending_activation(matricule)
            if activation is None:
                if students_api.activation_was_used(matricule):
                    return Response(
                        {'detail': 'This matricule is already used.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response(
                    {'detail': 'User not found'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            user = User.objects.create_user(
                matricule=activation['matricule'],
                name=activation['student_name'],
                email=activation['placeholder_email'],
                role='STUDENT',
                school=activation['school'],
                password='!pending_activation',
            )

            if students_api.create_student_from_activation(user, matricule) is None:
                # The token was spent between the lookup and here.
                user.delete()
                return Response(
                    {'detail': 'This matricule is already used.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        user.set_password(new_password)
        user.save(update_fields=['password'])

        refresh = RefreshToken.for_user(user)
        user.last_login = __import__('django.utils.timezone', fromlist=['now']).now()
        user.save(update_fields=['last_login'])

        response_data = {
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
            'user': build_user_payload(user),
        }

        return Response(response_data, status=status.HTTP_200_OK)


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
        user.save(update_fields=['password'])

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

            # Students cannot self-reset: they must get a new password from
            # their school administrator. Return a clear, distinct message.
            if (user.role or '').upper() == 'STUDENT':
                return Response(
                    {
                        'detail': 'As a student, you cannot reset your password online. '
                                  'Please see your school administrator to get a new password.',
                        'is_student': True,
                    },
                    status=status.HTTP_200_OK,
                )

            email = user.email
            refresh = RefreshToken.for_user(user)
            reset_token = str(refresh.access_token)

            # Build the reset URL (frontend handles the /reset-password?token=... route)
            frontend_url = getattr(django_settings, 'FRONTEND_URL', 'https://eduignite.online')
            reset_url = f"{frontend_url}/reset-password?token={reset_token}"

            user_name = user.get_full_name() or user.email
            issuer = getattr(getattr(user, 'school', None), 'name', None) or 'EduIgnite'

            subject = "EduIgnite - Password Reset Request"
            plain_body = (
                f"Hello {user_name},\n\n"
                "We received a request to reset your EduIgnite password.\n\n"
                "Click the link below to set a new password. This link is valid for 5 minutes:\n"
                f"{reset_url}\n\n"
                "If you did not request this, you can safely ignore this email.\n\n"
                "- The EduIgnite Team"
            )
            escaped_name = escape(user_name)
            escaped_reset_url = escape(reset_url)
            html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#eef4f8;margin:0;padding:0;color:#10233f;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:40px auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dce7f0;box-shadow:0 18px 45px rgba(11,58,115,.10);">
    <tr><td style="background:#0b3a73;padding:32px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:28px;letter-spacing:1px;">EduIgnite</h1>
      <p style="color:#c9d7e5;font-size:12px;margin:6px 0 0;">Secure School Management Platform</p>
    </td></tr>
    <tr><td style="padding:40px 48px;">
      <h2 style="color:#0b3a73;margin:0 0 16px;">Password Reset Request</h2>
      <p style="color:#334155;line-height:1.7;">Hello <strong>{escaped_name}</strong>,</p>
      <p style="color:#334155;line-height:1.7;">
        We received a request to reset the password for your EduIgnite account.
        Click the button below to set a new password. This link expires in <strong>5 minutes</strong>.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="{escaped_reset_url}" style="background:#0b3a73;color:#ffffff;padding:14px 34px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
          Reset My Password
        </a>
      </div>
      <p style="color:#64748b;font-size:13px;line-height:1.6;">
        If the button does not work, copy and paste this link into your browser:<br>
        <a href="{escaped_reset_url}" style="color:#0b3a73;word-break:break-all;">{escaped_reset_url}</a>
      </p>
      <hr style="border:none;border-top:1px solid #dce7f0;margin:32px 0;">
      <p style="color:#94a3b8;font-size:12px;">
        If you did not request a password reset, you can safely ignore this email.
        Your password will remain unchanged.
      </p>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:20px;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">EduIgnite - Cameroon - Secure transactional message</p>
    </td></tr>
  </table>
</body>
</html>"""

            sent = send_transactional_email(
                to_email=email,
                to_name=user_name,
                subject=subject,
                html=html_body,
                text=plain_body,
                sender_name=issuer,
                reply_to_email=getattr(getattr(user, 'school', None), 'email', None),
            )
            if sent:
                logger.info("Password reset email sent to %s", email)
            else:
                logger.warning("Password reset email was not delivered to provider for %s", email)

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
            from rest_framework_simplejwt.tokens import AccessToken
            access = AccessToken(token)  # validates signature & expiry
            user_id = access.get('user_id')
            user = User.objects.get(id=user_id)

            user.set_password(new_password)
            user.save(update_fields=['password'])

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

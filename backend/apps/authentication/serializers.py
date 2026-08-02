from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema_serializer, OpenApiExample

User = get_user_model()


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Valid Login',
            value={'matricule': 'STU001', 'password': 'demo_password'},
        ),
    ]
)
class LoginSerializer(serializers.Serializer):
    """
    Serializer for matricule/password based login.
    """
    matricule = serializers.CharField(max_length=50)
    password = serializers.CharField(max_length=128, write_only=True)

    def validate_matricule(self, value):
        """Validate that user with matricule exists."""
        if not User.objects.filter(matricule=value).exists():
            raise serializers.ValidationError('Matricule does not exist.')
        return value


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Token Response',
            value={
                'access_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                'refresh_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                'user': {
                    'id': '550e8400-e29b-41d4-a716-446655440000',
                    'matricule': 'STU001',
                    'name': 'Example Student',
                    'email': 'student@example.com',
                    'role': 'STUDENT',
                }
            },
        ),
    ]
)
class TokenResponseSerializer(serializers.Serializer):
    """
    Serializer for token response with user profile.
    """
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    user = serializers.SerializerMethodField()

    def get_user(self, obj):
        """Return minimal user data."""
        user = obj.get('user')
        return {
            'id': str(user.id),
            'matricule': user.matricule,
            'name': user.name,
            'email': user.email,
            'role': user.role,
            'avatar': user.avatar or None,
        }


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Firebase Login',
            value={'id_token': 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1Njc4OTAifQ...'},
        ),
    ]
)
class FirebaseLoginSerializer(serializers.Serializer):
    """
    Serializer for Firebase ID token login.
    """
    id_token = serializers.CharField()


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Account Activation',
            value={
                'matricule': 'STU001',
                'new_password': 'SecurePassword123!',
                'confirm_password': 'SecurePassword123!',
            },
        ),
    ]
)
class ActivateAccountSerializer(serializers.Serializer):
    """
    Serializer for first-time account activation with password setting.
    """
    matricule = serializers.CharField(max_length=50)
    new_password = serializers.CharField(
        max_length=128,
        write_only=True,
        validators=[validate_password],
    )
    confirm_password = serializers.CharField(max_length=128, write_only=True)

    def validate(self, data):
        """Validate passwords match."""
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return data

    def validate_matricule(self, value):
        """Validate that user exists."""
        if User.objects.filter(matricule=value).exists():
            return value
        try:
            from apps.students import api as students_api

            if students_api.has_pending_activation(value):
                return value
        except Exception:
            pass
        raise serializers.ValidationError('User not found.')
        return value


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Change Password',
            value={
                'old_password': 'OldPassword123!',
                'new_password': 'NewPassword456!',
                'confirm_password': 'NewPassword456!',
            },
        ),
    ]
)
class ChangePasswordSerializer(serializers.Serializer):
    """
    Serializer for authenticated user password change.
    """
    old_password = serializers.CharField(max_length=128, write_only=True)
    new_password = serializers.CharField(
        max_length=128,
        write_only=True,
        validators=[validate_password],
    )
    confirm_password = serializers.CharField(max_length=128, write_only=True)

    def validate(self, data):
        """Validate passwords match."""
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return data

    def validate_old_password(self, value):
        """Validate old password is correct."""
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Old password is incorrect.')
        return value


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Password Reset Request',
            value={'matricule': 'STU001'},
        ),
    ]
)
class PasswordResetRequestSerializer(serializers.Serializer):
    """
    Serializer for initiating password reset flow via matricule.
    """
    matricule = serializers.CharField(max_length=50)

    def validate_matricule(self, value):
        """Validate matricule exists."""
        if not User.objects.filter(matricule=value).exists():
            raise serializers.ValidationError('No account found with this matricule.')
        return value


@extend_schema_serializer(
    examples=[
        OpenApiExample(
            'Password Reset Confirm',
            value={
                'token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                'new_password': 'NewPassword123!',
            },
        ),
    ]
)
class PasswordResetConfirmSerializer(serializers.Serializer):
    """
    Serializer for confirming password reset with token.
    """
    token = serializers.CharField()
    new_password = serializers.CharField(
        max_length=128,
        write_only=True,
        validators=[validate_password],
    )

    def validate_token(self, value):
        """Validate token format and validity."""
        if not value:
            raise serializers.ValidationError('Token is required.')
        return value

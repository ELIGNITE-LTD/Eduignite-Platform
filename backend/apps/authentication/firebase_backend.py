import firebase_admin
from firebase_admin import auth as firebase_auth
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth import get_user_model

User = get_user_model()


class FirebaseAuthentication(BaseAuthentication):
    """
    Firebase ID token authentication backend for DRF.
    Verifies Firebase ID tokens and returns Django user if exists.
    """

    def authenticate(self, request):
        """
        Extract and verify Firebase ID token from Authorization header.
        Returns (user, token) tuple if valid, None if no header present.
        Raises AuthenticationFailed if token is invalid.
        """
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')

        if not auth_header:
            return None

        try:
            prefix, token = auth_header.split(' ')
            if prefix.lower() != 'bearer':
                return None
        except ValueError:
            raise AuthenticationFailed('Invalid Authorization header format')

        try:
            decoded_token = firebase_auth.verify_id_token(token)
        except firebase_admin.exceptions.FirebaseError as e:
            raise AuthenticationFailed(f'Invalid Firebase token: {str(e)}')
        except Exception as e:
            raise AuthenticationFailed(f'Token verification failed: {str(e)}')

        uid = decoded_token.get('uid')
        if not uid:
            raise AuthenticationFailed('No UID in Firebase token')

        try:
            user = User.objects.get(uid=uid)
        except User.DoesNotExist:
            raise AuthenticationFailed('User not found in database')

        if not user.is_active:
            raise AuthenticationFailed('User is inactive')

        return (user, token)

    def authenticate_header(self, request):
        """Return authenticate header for 401 responses."""
        return 'Bearer'

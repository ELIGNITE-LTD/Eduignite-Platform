"""Session revocation for JWTs.

``token_blacklist`` is not installed on this platform, so refresh tokens cannot
be blacklisted one by one. Instead ``User.sessions_valid_after`` marks a moment:
any access or refresh token issued before it is rejected. It is null for every
account by default, so behaviour only changes for an account whose credentials
another person changed (a proprietor resetting a school administrator) or that
was deactivated by a founder.

``iat`` is whole seconds. The comparison is against the exact timestamp, so a
token minted in the same second as the revocation is rejected too (fails
closed): a legitimate sign-in made within a second of the reset must be retried.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


def token_is_revoked(token, user) -> bool:
    cutoff = getattr(user, 'sessions_valid_after', None)
    if cutoff is None:
        return False
    try:
        issued_at = float(token.get('iat'))
    except (TypeError, ValueError):
        return True  # no usable issue time: cannot prove it is newer, so refuse
    return issued_at < cutoff.timestamp()


class SessionAwareJWTAuthentication(JWTAuthentication):
    """JWTAuthentication that also honours ``User.sessions_valid_after``."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if token_is_revoked(validated_token, user):
            raise AuthenticationFailed('This session has ended. Please sign in again.', code='session_revoked')
        return user

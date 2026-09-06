"""ECDSA P-256 / SHA-256 signing for EduIgnite Offline license certificates.

This module implements exactly the crypto rules from the wire contract
(``scratchpad/wave2-contract.md``, "Crypto" section) shared with the desktop
and companion-mobile agents building against the same contract:

- Algorithm: ECDSA P-256 (secp256r1), SHA-256 digest.
- Canonical payload for signing: ``JSON.stringify`` with keys sorted
  ascending, no whitespace, UTF-8 bytes. In Python this is
  ``json.dumps(payload, sort_keys=True, separators=(",", ":"))``.
- Signature encoding: base64 of the DER-encoded signature.
- Keys are standard PKCS8 (private) / SubjectPublicKeyInfo (public) PEM, so
  they interoperate with Node's ``crypto.generateKeyPairSync('ec', {namedCurve:
  'prime256v1'})`` output used by the other two clients.

Key handling: the private key never lives in source code. It is read from the
``OFFLINE_LICENSING_PRIVATE_KEY_PEM`` environment variable (dev-only value in
``.env.example``; production value must come from AWS SSM Parameter Store,
see ``backend/README`` / that env var's comment for the exact path).
"""

from __future__ import annotations

import base64
import json
from functools import lru_cache

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.exceptions import InvalidSignature
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


class CanonicalJSONError(ValueError):
    """Raised when a payload cannot be canonicalized for signing."""


def canonical_json_bytes(payload: dict) -> bytes:
    """Serialize ``payload`` per the wire contract's canonical JSON rule.

    Keys sorted ascending, no whitespace, UTF-8 bytes. Both the desktop and
    companion apps must reproduce this exact byte sequence (via
    ``JSON.stringify`` with sorted keys) for signatures to verify.
    """
    try:
        return json.dumps(
            payload,
            sort_keys=True,
            separators=(',', ':'),
            ensure_ascii=False,
        ).encode('utf-8')
    except (TypeError, ValueError) as exc:  # pragma: no cover - defensive
        raise CanonicalJSONError(str(exc)) from exc


def _load_private_key():
    pem = getattr(settings, 'OFFLINE_LICENSING_PRIVATE_KEY_PEM', '') or ''
    if not pem.strip():
        raise ImproperlyConfigured(
            'OFFLINE_LICENSING_PRIVATE_KEY_PEM is not configured. In dev, set it '
            'in .env from the DEV ONLY value in .env.example. In production it '
            'must be provisioned from AWS SSM Parameter Store at '
            '/eduignite/prod/offline-licensing/private-key (see backend README).'
        )
    return serialization.load_pem_private_key(pem.encode('utf-8'), password=None)


@lru_cache(maxsize=1)
def _cached_public_key_from_private():
    return _load_private_key().public_key()


def sign_payload(payload: dict) -> str:
    """Sign ``payload`` with the configured EC private key.

    Returns the base64 encoding of the DER-encoded ECDSA signature, per the
    wire contract's "Signature encoding" rule.
    """
    private_key = _load_private_key()
    data = canonical_json_bytes(payload)
    signature = private_key.sign(data, ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(signature).decode('ascii')


def verify_signature(payload: dict, signature_b64: str, public_key_pem: str | None = None) -> bool:
    """Verify a base64 DER ECDSA signature over the canonical JSON of ``payload``.

    If ``public_key_pem`` is omitted, the public key derived from the
    configured private key is used (useful for round-trip tests in this
    backend). The desktop app instead verifies with its own embedded copy of
    the public key, per the contract.
    """
    try:
        if public_key_pem:
            public_key = serialization.load_pem_public_key(public_key_pem.encode('utf-8'))
        else:
            public_key = _cached_public_key_from_private()
        data = canonical_json_bytes(payload)
        signature = base64.b64decode(signature_b64)
        public_key.verify(signature, data, ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def public_key_pem() -> str:
    """Return the PEM-encoded public key matching the configured private key.

    Exposed so operators/tests can confirm which public key the desktop app
    must embed; this is never used to make trust decisions on the backend.
    """
    public_key = _cached_public_key_from_private()
    return public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('ascii')

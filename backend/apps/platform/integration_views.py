"""CEO/CTO-only endpoint to read (masked) and rotate the AI + email keys.

The values here override the environment at runtime (see runtime_config), so a
founder can change the Gemini or Brevo key from the dashboard with no redeploy.
Keys are never returned in full - only whether they are set and the last 4 chars.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsCEOOrCTO
from . import runtime_config
from .models import IntegrationSecrets


def _mask(value: str) -> str:
    value = value or ''
    if not value:
        return ''
    return ('•' * max(0, len(value) - 4)) + value[-4:] if len(value) > 4 else '••••'


class IntegrationSecretsView(APIView):
    """GET masked status; PATCH to rotate. CEO/CTO only."""

    permission_classes = [IsAuthenticated, IsCEOOrCTO]

    def _state(self):
        s = IntegrationSecrets.load()
        return Response({
            'gemini_api_key_set': bool(s.gemini_api_key),
            'gemini_api_key_masked': _mask(s.gemini_api_key),
            'gemini_model': s.gemini_model or '',
            'gemini_model_effective': runtime_config.gemini_model(),
            'brevo_api_key_set': bool(s.brevo_api_key),
            'brevo_api_key_masked': _mask(s.brevo_api_key),
            'whatsapp_api_token_set': bool(s.whatsapp_api_token),
            'whatsapp_phone_number_id_set': bool(s.whatsapp_phone_number_id),
            'whatsapp_webhook_secret_set': bool(s.whatsapp_webhook_secret),
            'whatsapp_api_verified': bool(s.whatsapp_api_verified),
            'updated_at': s.updated_at,
            'updated_by': getattr(s.updated_by, 'name', '') if s.updated_by_id else '',
        })

    def get(self, request):
        return self._state()

    def patch(self, request):
        s = IntegrationSecrets.load()
        changed = []

        gk = str(request.data.get('gemini_api_key', '') or '').strip()
        if gk:
            s.gemini_api_key = gk
            changed.append('gemini_api_key')

        if 'gemini_model' in request.data:
            s.gemini_model = str(request.data.get('gemini_model') or '').strip()
            changed.append('gemini_model')

        bk = str(request.data.get('brevo_api_key', '') or '').strip()
        if bk:
            s.brevo_api_key = bk
            changed.append('brevo_api_key')

        for field in ('whatsapp_api_token', 'whatsapp_phone_number_id', 'whatsapp_webhook_secret'):
            value = str(request.data.get(field, '') or '').strip()
            if value:
                setattr(s, field, value)
                changed.append(field)
        if 'whatsapp_api_verified' in request.data:
            s.whatsapp_api_verified = bool(request.data.get('whatsapp_api_verified'))
            changed.append('whatsapp_api_verified')

        if changed:
            s.updated_by = request.user
            s.save()
            runtime_config.invalidate()

        return self._state()

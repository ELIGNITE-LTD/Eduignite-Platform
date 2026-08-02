"""Lightweight online-presence via the shared cache. A user is 'online' when
they made an authenticated request within the last PRESENCE_TTL seconds; the
frontend refreshes this by polling notifications on every screen."""
from django.core.cache import cache

PRESENCE_TTL = 150  # seconds


def touch_presence(user_id):
    if user_id:
        try:
            cache.set(f'presence:{user_id}', 1, PRESENCE_TTL)
        except Exception:  # noqa: BLE001
            pass


def is_online(user_id):
    try:
        return bool(cache.get(f'presence:{user_id}'))
    except Exception:  # noqa: BLE001
        return False

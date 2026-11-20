"""Security sensors: password guessing, credential stuffing, and a sign-in that succeeds after many failures.

Counting is in the cache with short windows, so nothing here touches the database on a normal sign-in. What is stored
about an attempt is a masked account name and the first part of an address, never a password.
"""

from __future__ import annotations

from django.core.cache import cache

from . import counters, recorder
from .sanitize import clean_text

WINDOW = 15 * 60
ACCOUNT_WARN = 8          # failures on one account in the window
IP_CRITICAL = 25          # failures from one address in the window
IP_ACCOUNTS_CRITICAL = 10  # different accounts tried from one address


def _mask(matricule: str) -> str:
    value = str(matricule or '')
    return (value[:3] + '…' + value[-2:]) if len(value) > 6 else value[:2] + '…'


def _ip_prefix(ip: str) -> str:
    ip = str(ip or '')
    if ':' in ip:
        return ':'.join(ip.split(':')[:3]) + ':…'
    parts = ip.split('.')
    return '.'.join(parts[:3]) + '.x' if len(parts) == 4 else ip[:12]


def _incr(key: str) -> int:
    try:
        if cache.add(key, 1, WINDOW):
            return 1
        return cache.incr(key)
    except Exception:  # noqa: BLE001
        return 0


def login_failed(request, matricule: str, reason: str = ''):
    """Call on every failed sign-in. Never raises."""
    try:
        counters.bump('login_failures')
        ip = _ip_of(request)
        account = _incr(f'watch:sec:acct:{matricule}')
        by_ip = _incr(f'watch:sec:ip:{ip}')
        accounts_key = f'watch:sec:ipaccts:{ip}'
        tried = set(cache.get(accounts_key) or [])
        tried.add(str(matricule))
        cache.set(accounts_key, list(tried)[:60], WINDOW)
        if by_ip >= IP_CRITICAL or len(tried) >= IP_ACCOUNTS_CRITICAL:
            recorder.record(
                'security', 'Many failed sign-ins from one address (possible credential stuffing)', severity='critical', source='api',
                message=f'{by_ip} failed sign-ins on {len(tried)} different accounts from {_ip_prefix(ip)} in 15 minutes.',
                fingerprint=recorder.fingerprint_of('stuffing', _ip_prefix(ip)),
                details={'address': _ip_prefix(ip), 'failures': by_ip, 'accounts_tried': len(tried)})
        elif account >= ACCOUNT_WARN:
            recorder.record(
                'security', 'Repeated failed sign-ins on one account (possible password guessing)', severity='warning', source='api',
                message=f'{account} failed sign-ins on account {_mask(matricule)} in 15 minutes ({clean_text(reason, 60)}).',
                fingerprint=recorder.fingerprint_of('guessing', matricule),
                details={'account': _mask(matricule), 'failures': account, 'address': _ip_prefix(ip)})
    except Exception:  # noqa: BLE001
        pass


def login_succeeded(request, user):
    """A sign-in that works right after many failures may be someone who guessed right."""
    try:
        failures = int(cache.get(f'watch:sec:acct:{user.matricule}') or 0)
        if failures >= 5:
            privileged = getattr(user, 'role', '') in ('CEO', 'CTO', 'SUPER_ADMIN', 'COO', 'SYSTEM_DEV', 'DESIGNER', 'SCHOOL_ADMIN')
            recorder.record(
                'security', 'Sign-in succeeded after repeated failures', severity='critical' if privileged else 'warning', source='api',
                message=f'Account {_mask(user.matricule)} ({user.role}) signed in after {failures} failed attempts. If this was not the owner, reset the password.',
                fingerprint=recorder.fingerprint_of('guess-success', user.pk), user=user,
                details={'account': _mask(user.matricule), 'role': user.role, 'failures_before': failures, 'address': _ip_prefix(_ip_of(request))})
            cache.delete(f'watch:sec:acct:{user.matricule}')
    except Exception:  # noqa: BLE001
        pass


def _ip_of(request) -> str:
    from core.utils import get_client_ip

    try:
        return get_client_ip(request) or ''
    except Exception:  # noqa: BLE001
        return ''

"""Official public contact information: validation and the public representation."""

import re
from urllib.parse import quote, urlparse

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from .models import ContactInfoItem, ContactKind

PUBLIC_CACHE_KEY = 'customer_care:public_contact_info'
PUBLIC_CACHE_SECONDS = 120

ALLOWED_HOSTS = {
    ContactKind.FACEBOOK: {'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com', 'fb.me'},
    ContactKind.INSTAGRAM: {'instagram.com', 'www.instagram.com'},
    ContactKind.LINKEDIN: {'linkedin.com', 'www.linkedin.com'},
    ContactKind.YOUTUBE: {'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'},
}
URL_KINDS = {ContactKind.WEBSITE, ContactKind.OTHER, *ALLOWED_HOSTS}


def _validate_url(kind, value):
    parsed = urlparse(value)
    if parsed.scheme != 'https':
        raise ValidationError('Links must start with https://')
    if not parsed.hostname or parsed.username or parsed.password:
        raise ValidationError('Enter a valid link without embedded credentials.')
    host = parsed.hostname.lower()
    if '.' not in host or not re.fullmatch(r'[a-z0-9.-]+', host):
        raise ValidationError('Enter a valid link.')
    allowed = ALLOWED_HOSTS.get(kind)
    if allowed and host not in allowed:
        raise ValidationError(f'This link must point to {sorted(allowed)[0]}.')
    return value


def clean_value(kind, value):
    """Validated, trimmed value or ``ValidationError``."""
    value = str(value or '').strip()
    if not value:
        raise ValidationError('A value is required.')
    if kind == ContactKind.EMAIL:
        validate_email(value)
    elif kind in (ContactKind.PHONE, ContactKind.WHATSAPP):
        digits = re.sub(r'\D', '', value)
        if not re.fullmatch(r'\+?[\d\s().-]{8,25}', value) or not (8 <= len(digits) <= 15):
            raise ValidationError('Enter a valid phone number (8 to 15 digits, country code recommended).')
    elif kind == ContactKind.ADDRESS:
        if len(value) > 300 or re.search(r'[<>]', value):
            raise ValidationError('Enter a plain-text address of at most 300 characters.')
    elif kind in URL_KINDS:
        _validate_url(kind, value)
    else:
        raise ValidationError('Unknown contact type.')
    return value


def href_for(item) -> str:
    if item.kind == ContactKind.EMAIL:
        return f'mailto:{item.value}'
    if item.kind == ContactKind.PHONE:
        return 'tel:+' + re.sub(r'\D', '', item.value) if item.value.startswith('+') else 'tel:' + re.sub(r'[^\d+]', '', item.value)
    if item.kind == ContactKind.WHATSAPP:
        return 'https://wa.me/' + re.sub(r'\D', '', item.value)
    if item.kind == ContactKind.ADDRESS:
        return 'https://www.google.com/maps/search/?api=1&query=' + quote(item.value, safe='')
    return item.value


def public_items():
    """Active items only; cached lightly. Contains nothing but display fields."""
    data = cache.get(PUBLIC_CACHE_KEY)
    if data is None:
        data = [
            {'id': str(i.id), 'kind': i.kind, 'label': i.label, 'value': i.value, 'href': href_for(i),
             'display_mode': i.display_mode}
            for i in ContactInfoItem.objects.filter(is_active=True).order_by('sort_order', 'created_at')
        ]
        cache.set(PUBLIC_CACHE_KEY, data, PUBLIC_CACHE_SECONDS)
    return data


def invalidate_public_cache():
    cache.delete(PUBLIC_CACHE_KEY)

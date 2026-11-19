"""What a founder or executive may show on their public card: a short bio and a few professional links.

The person writes both from their own account. Everything is checked here, on the server, because the
card is public and the links are clickable: only https links, only to the platform they claim to be, no
credentials or scripts in the address, and a small fixed number of them.
"""

import re
from urllib.parse import urlsplit, urlunsplit

from rest_framework import serializers

MAX_BIO_LENGTH = 280  # the column allows a little more so a trimmed value never overflows it
MAX_LINKS = 6
MAX_URL_LENGTH = 300

# type -> (label shown to the person, domains the link must belong to; empty means any public website)
LINK_TYPES = {
    'linkedin': ('LinkedIn', ('linkedin.com',)),
    'x': ('X', ('x.com', 'twitter.com')),
    'github': ('GitHub', ('github.com',)),
    'facebook': ('Facebook', ('facebook.com', 'fb.com')),
    'instagram': ('Instagram', ('instagram.com',)),
    'youtube': ('YouTube', ('youtube.com', 'youtu.be')),
    'website': ('Personal website', ()),
}

_CONTROL_CHARS = re.compile(r'[\x00-\x08\x0b-\x1f\x7f​-‏‪-‮⁦-⁩]')
_HOST_LABEL = re.compile(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')


def clean_bio(value) -> str:
    """Plain text on one paragraph: control and hidden characters removed, spaces collapsed."""
    text = _CONTROL_CHARS.sub('', str(value or ''))
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) > MAX_BIO_LENGTH:
        raise serializers.ValidationError(
            f'Keep your bio to {MAX_BIO_LENGTH} characters or fewer (it is {len(text)} now).'
        )
    return text


def _host_ok(host: str) -> bool:
    if not host or len(host) > 253 or '.' not in host:
        return False
    if re.fullmatch(r'[0-9.]+', host) or ':' in host:  # IPv4 / IPv6 literals
        return False
    return all(_HOST_LABEL.match(label) for label in host.split('.'))


def clean_url(link_type: str, raw) -> str:
    """Return a safe https URL for ``link_type`` or raise a message the person can act on."""
    label, domains = LINK_TYPES[link_type]
    url = _CONTROL_CHARS.sub('', str(raw or '')).strip()
    if not url:
        raise serializers.ValidationError(f'Enter the {label} link or remove it.')
    if len(url) > MAX_URL_LENGTH:
        raise serializers.ValidationError(f'The {label} link is too long.')
    if not re.match(r'^[a-z][a-z0-9+.-]*:', url, re.IGNORECASE):
        url = 'https://' + url.lstrip('/')  # "linkedin.com/in/name" is fine
    parts = urlsplit(url)
    if parts.scheme.lower() not in ('http', 'https'):
        raise serializers.ValidationError(f'The {label} link must start with https://.')
    if parts.username or parts.password:
        raise serializers.ValidationError(f'The {label} link must not contain a username or password.')
    try:
        host = (parts.hostname or '').lower().rstrip('.')
        parts.port  # raises ValueError on a malformed port
    except ValueError:
        raise serializers.ValidationError(f'The {label} link is not a valid address.')
    if host.startswith('www.'):
        host_core = host[4:]
    else:
        host_core = host
    if not _host_ok(host):
        raise serializers.ValidationError(f'The {label} link is not a valid public address.')
    if domains and not any(host_core == d or host_core.endswith('.' + d) for d in domains):
        raise serializers.ValidationError(f'The {label} link must be on {domains[0]}.')
    if not domains and host_core.endswith(('.local', '.internal', '.localhost')):
        raise serializers.ValidationError(f'The {label} link is not a valid public address.')
    # Always https, no fragment, nothing hidden after it.
    netloc = host + (f':{parts.port}' if parts.port and parts.port != 443 else '')
    return urlunsplit(('https', netloc, parts.path or '', parts.query, ''))


def clean_links(value) -> list:
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError('Links must be a list.')
    if len(value) > MAX_LINKS:
        raise serializers.ValidationError(f'You can add up to {MAX_LINKS} links.')
    cleaned, seen = [], set()
    for item in value:
        if not isinstance(item, dict):
            raise serializers.ValidationError('Each link needs a type and an address.')
        link_type = str(item.get('type') or '').strip().lower()
        if link_type not in LINK_TYPES:
            raise serializers.ValidationError('Choose a link type from the list.')
        if link_type in seen:
            raise serializers.ValidationError(f'Add only one {LINK_TYPES[link_type][0]} link.')
        seen.add(link_type)
        cleaned.append({'type': link_type, 'url': clean_url(link_type, item.get('url'))})
    return cleaned


class FounderPublicProfileSerializer(serializers.Serializer):
    """The two fields the person controls. Anything else in the request is ignored."""

    bio = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)
    links = serializers.ListField(required=False, child=serializers.DictField())

    def validate_bio(self, value):
        return clean_bio(value)

    def validate_links(self, value):
        return clean_links(value)


def public_links_for_display(raw) -> list:
    """Re-check stored links at read time so a bad value in the database can never reach the public page."""
    shown = []
    for item in raw if isinstance(raw, list) else []:
        try:
            link_type = str((item or {}).get('type') or '').lower()
            if link_type in LINK_TYPES:
                shown.append({'type': link_type, 'url': clean_url(link_type, (item or {}).get('url'))})
        except (serializers.ValidationError, AttributeError):
            continue
    return shown[:MAX_LINKS]

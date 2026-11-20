"""What a founder or executive shows on their public card: a short bio and a few professional links.

Everything here is public, so it is strict: plain text only, https links only, and each named link must really be
on that network (a "LinkedIn" link cannot point somewhere else). The owner edits it from their own account.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from rest_framework import serializers

BIO_MAX = 6000   # long enough for a full biography; the card shows only a Bio button, the text has its own page
MAX_LINKS = 6
URL_MAX = 200

#: kind -> label shown on the card, the hosts it may point to (None = any website), and a hint for the form.
LINK_KINDS = {
    'linkedin': {'label': 'LinkedIn', 'hosts': ('linkedin.com',), 'hint': 'https://www.linkedin.com/in/your-name'},
    'website': {'label': 'Website', 'hosts': None, 'hint': 'https://your-website.com'},
    'x': {'label': 'X (Twitter)', 'hosts': ('x.com', 'twitter.com'), 'hint': 'https://x.com/your-handle'},
    'github': {'label': 'GitHub', 'hosts': ('github.com',), 'hint': 'https://github.com/your-name'},
    'facebook': {'label': 'Facebook', 'hosts': ('facebook.com', 'fb.com'), 'hint': 'https://www.facebook.com/your-page'},
    'instagram': {'label': 'Instagram', 'hosts': ('instagram.com',), 'hint': 'https://www.instagram.com/your-handle'},
    'youtube': {'label': 'YouTube', 'hosts': ('youtube.com', 'youtu.be'), 'hint': 'https://www.youtube.com/@your-channel'},
}

_TAGS = re.compile(r'<[^>]*>')
_CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def clean_bio(value) -> str:
    """Plain text of at most BIO_MAX characters; markup and control characters are removed."""
    text = _CONTROL.sub('', _TAGS.sub('', str(value or '')))
    # Paragraphs are kept (one blank line between them); runs of blank lines are tidied.
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    if len(text) > BIO_MAX:
        raise serializers.ValidationError({'bio': f'Keep your bio to {BIO_MAX} characters or fewer.'})
    return text


def _host_ok(host: str, allowed) -> bool:
    return allowed is None or any(host == d or host.endswith('.' + d) for d in allowed)


def clean_links(value) -> list[dict]:
    """The validated links, each as {kind, url}. Raises a clear error for the first problem found."""
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError({'links': 'Links must be a list.'})
    if len(value) > MAX_LINKS:
        raise serializers.ValidationError({'links': f'Add at most {MAX_LINKS} links.'})
    out, seen = [], set()
    for item in value:
        if not isinstance(item, dict):
            raise serializers.ValidationError({'links': 'Each link needs a type and an address.'})
        kind = str(item.get('kind') or '').strip().lower()
        url = str(item.get('url') or '').strip()
        if kind not in LINK_KINDS:
            raise serializers.ValidationError({'links': 'Choose a link type from the list.'})
        label = LINK_KINDS[kind]['label']
        if kind in seen:
            raise serializers.ValidationError({'links': f'You can only add one {label} link.'})
        if not url:
            continue
        if len(url) > URL_MAX or re.search(r'\s', url):
            raise serializers.ValidationError({'links': f'The {label} address is not valid.'})
        parsed = urlparse(url)
        host = (parsed.hostname or '').lower()
        if parsed.scheme != 'https' or not host or '.' not in host or parsed.username or parsed.password:
            raise serializers.ValidationError({'links': f'The {label} address must start with https:// and be a real web address.'})
        if not _host_ok(host, LINK_KINDS[kind]['hosts']):
            raise serializers.ValidationError({'links': f'That is not a {label} address. Paste the link to your {label} page.'})
        seen.add(kind)
        out.append({'kind': kind, 'url': parsed._replace(fragment='').geturl()})
    return out


def public_links(stored) -> list[dict]:
    """Links as the public card shows them: kind, label and address (anything invalid stored earlier is dropped)."""
    out = []
    for item in stored if isinstance(stored, list) else []:
        kind = (item or {}).get('kind') if isinstance(item, dict) else None
        url = (item or {}).get('url') if isinstance(item, dict) else None
        if kind in LINK_KINDS and isinstance(url, str) and url.startswith('https://'):
            out.append({'kind': kind, 'label': LINK_KINDS[kind]['label'], 'url': url})
    return out

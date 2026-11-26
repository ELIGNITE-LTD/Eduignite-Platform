"""Keep the public website light: turn images and videos stored as base64 text into small cached files.

Profile photos, blog pictures and gallery items are saved in the database as ``data:`` URIs. The public API used to
send them inline (a 17 MB founders list, a 6 MB gallery video, ...) and the website then repeated them inside the
page, so the home page weighed ~45 MB. ``slim()`` decodes each one once, shrinks images to a sensible size (WebP),
writes the result under ``MEDIA_ROOT/public-cache/`` (served directly by the web server at ``/media/``) and returns
that URL instead. Values that are already normal URLs pass through untouched.
"""

import base64
import hashlib
import io
import logging
import re
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)

CACHE_DIR = 'public-cache'
MAX_DECODED_BYTES = 40 * 1024 * 1024   # refuse anything larger than this
MAX_INLINE_FALLBACK = 150 * 1024       # if a file cannot be written, only a tiny image may stay inline
IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'}
VIDEO_TYPES = {'video/mp4': 'mp4', 'video/webm': 'webm'}
# Longest side, in pixels, for each use.
SIZES = {'avatar': 384, 'photo': 1400, 'gallery': 1600}

_DATA_URI = re.compile(r'^data:([a-zA-Z0-9.+/-]+);base64,(.*)$', re.DOTALL)


def _origin() -> str:
    return (getattr(settings, 'PUBLIC_MEDIA_ORIGIN', '') or '').rstrip('/')


def _url_for(name: str) -> str:
    return f"{_origin()}{settings.MEDIA_URL}{CACHE_DIR}/{name}"


def _write_once(name: str, data: bytes) -> bool:
    folder = Path(settings.MEDIA_ROOT) / CACHE_DIR
    path = folder / name
    if path.exists() and path.stat().st_size > 0:
        return True
    try:
        folder.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + '.tmp')
        tmp.write_bytes(data)
        tmp.replace(path)  # atomic: a reader never sees half a file
        return True
    except OSError:
        logger.exception('public media: could not write %s', name)
        return False


def _shrink(raw: bytes, max_side: int) -> bytes:
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)  # also drops camera metadata on save
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGBA' if 'transparency' in img.info or img.mode in ('LA', 'PA') else 'RGB')
        img.thumbnail((max_side, max_side), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format='WEBP', quality=82, method=4)
        return out.getvalue()


def slim(value, kind: str = 'photo') -> str:
    """Return a light URL for ``value``. ``kind`` is 'avatar', 'photo' or 'gallery'. Never raises."""
    if not value or not isinstance(value, str):
        return value or ''
    if not value.startswith('data:'):
        return value  # already a normal link
    try:
        match = _DATA_URI.match(value)
        if not match:
            return ''
        mime, payload = match.group(1).lower(), match.group(2)
        if len(payload) > MAX_DECODED_BYTES * 4 // 3 + 16:
            return ''
        raw = base64.b64decode(payload, validate=False)
        if not raw or len(raw) > MAX_DECODED_BYTES:
            return ''
        digest = hashlib.sha256(raw).hexdigest()[:20]

        if mime in VIDEO_TYPES:
            name = f"{digest}.{VIDEO_TYPES[mime]}"
            return _url_for(name) if _write_once(name, raw) else ''

        if mime in IMAGE_TYPES:
            side = SIZES.get(kind, SIZES['photo'])
            name = f"{digest}-{side}.webp"
            path = Path(settings.MEDIA_ROOT) / CACHE_DIR / name
            if not (path.exists() and path.stat().st_size > 0):
                small = _shrink(raw, side)
                if not _write_once(name, small):
                    return value if len(value) <= MAX_INLINE_FALLBACK else ''
            return _url_for(name)
        return ''  # anything else (SVG, HTML, ...) is never passed on
    except Exception as exc:  # noqa: BLE001 - one bad image must not break the page
        logger.warning('public media: skipped an image that could not be processed (%s)', type(exc).__name__)
        return ''

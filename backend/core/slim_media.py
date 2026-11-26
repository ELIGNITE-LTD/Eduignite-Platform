"""Shrink images stored as base64 ``data:`` URIs, keeping them inline.

Uploads were stored exactly as sent: profile photos of 2-4 MB, banners of 3 MB, ... and every API response that
mentions a person or a school carried them, so lists, the chat and the dashboards were slow.

Everything here keeps the image INLINE as a ``data:`` URI, in a format every consumer already handles
(JPEG, or PNG when the picture has transparency). ID cards, report cards, PDFs and the offline apps therefore behave
exactly as before; only the byte count changes. Nothing raises: on any problem the original value is returned.
"""

import base64
import io
import logging
import re

logger = logging.getLogger(__name__)

# Longest side in pixels for each kind of picture (big enough for printing an ID card or a letterhead).
MAX_SIDE = {'avatar': 400, 'logo': 600, 'banner': 1600, 'photo': 1400}
LEAVE_ALONE_BYTES = 70 * 1024          # already small: do not touch
MAX_INPUT_BYTES = 40 * 1024 * 1024     # refuse to process anything larger than this
SHRINKABLE = {'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/bmp'}  # gif/svg are left untouched

_DATA_URI = re.compile(r'^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$', re.DOTALL)


def shrink_bytes(raw: bytes, mime: str, kind: str = 'photo'):
    """Return ``(new_bytes, new_mime)`` or ``None`` when the picture should stay as it is."""
    from PIL import Image, ImageOps

    max_side = MAX_SIDE.get(kind, MAX_SIDE['photo'])
    with Image.open(io.BytesIO(raw)) as img:
        width, height = img.size
        if len(raw) <= LEAVE_ALONE_BYTES and max(width, height) <= max_side:
            return None
        img = ImageOps.exif_transpose(img)  # camera rotation applied; metadata is dropped on save
        has_alpha = img.mode in ('RGBA', 'LA', 'PA') or 'transparency' in img.info
        img.thumbnail((max_side, max_side), Image.LANCZOS)
        out = io.BytesIO()
        if has_alpha:
            img.convert('RGBA').save(out, format='PNG', optimize=True)
            new_mime = 'image/png'
        else:
            img.convert('RGB').save(out, format='JPEG', quality=82, optimize=True, progressive=True)
            new_mime = 'image/jpeg'
    data = out.getvalue()
    if len(data) >= len(raw):
        return None  # never make a file bigger
    return data, new_mime


def shrink_data_uri(value, kind: str = 'photo'):
    """Smaller equivalent of an image ``data:`` URI; anything else is returned unchanged. Never raises."""
    if not isinstance(value, str) or not value.startswith('data:image/'):
        return value
    try:
        match = _DATA_URI.match(value)
        if not match:
            return value
        mime, payload = match.group(1).lower(), match.group(2)
        if mime not in SHRINKABLE or len(payload) > MAX_INPUT_BYTES * 4 // 3 + 16:
            return value
        raw = base64.b64decode(payload, validate=False)
        result = shrink_bytes(raw, mime, kind)
        if result is None:
            return value
        data, new_mime = result
        return f"data:{new_mime};base64,{base64.b64encode(data).decode('ascii')}"
    except Exception as exc:  # noqa: BLE001 - a bad image must never break an upload or a deploy
        logger.warning('slim_media: left an image as it was (%s)', type(exc).__name__)
        return value


def shrink_upload(file, kind: str = 'photo'):
    """``(bytes, content_type)`` for an uploaded file, shrunk when worthwhile. Never raises."""
    if hasattr(file, 'seek'):
        file.seek(0)
    raw = file.read()
    mime = (getattr(file, 'content_type', '') or '').lower()
    try:
        if mime in SHRINKABLE:
            result = shrink_bytes(raw, mime, kind)
            if result is not None:
                return result
    except Exception as exc:  # noqa: BLE001
        logger.warning('slim_media: kept an upload as it was (%s)', type(exc).__name__)
    return raw, getattr(file, 'content_type', '') or 'application/octet-stream'

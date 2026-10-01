"""Questions sent as photos.

A student photographs a page of homework, an exam question or a diagram and
asks about it. The images reach the model as data URLs, so nothing is stored
on the server: they are checked here, passed to the provider, and forgotten.

Every image is opened and re-checked, not taken on its declared type. A file
that says it is a JPEG but is not one is refused, because what goes to the
provider is paid for whether or not it could be read.
"""

from __future__ import annotations

import base64
import binascii
import io
import re

from django.conf import settings
from rest_framework.exceptions import ValidationError

ALLOWED_FORMATS = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp', 'GIF': 'image/gif'}
_DATA_URL = re.compile(r'^data:(image/[a-z0-9.+-]+);base64,(.+)$', re.IGNORECASE | re.DOTALL)
#: The provider refuses a picture larger than this many pixels.
MAX_PIXELS = 33_000_000


def max_images() -> int:
    return int(getattr(settings, 'AI_CHAT_MAX_IMAGES', 3))


def max_total_bytes() -> int:
    # The provider accepts up to 4 MB of base64 per request; base64 is a third
    # larger than the file, so the files themselves must stay under about 3 MB.
    return int(getattr(settings, 'AI_CHAT_MAX_IMAGE_BYTES', 3 * 1024 * 1024))


def _check(raw: bytes) -> str:
    """The real type of an image, or a refusal."""
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(raw)) as image:
            image.verify()
        with Image.open(io.BytesIO(raw)) as image:
            kind = image.format
            width, height = image.size
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise ValidationError({'images': 'One of the files is not an image that can be read.'})
    if kind not in ALLOWED_FORMATS:
        raise ValidationError({'images': 'Send photos as JPG, PNG, WebP or GIF.'})
    if width * height > MAX_PIXELS:
        raise ValidationError({'images': 'One of the photos is too large. Take it again at a lower resolution.'})
    return ALLOWED_FORMATS[kind]


def images_from_request(request) -> list[str]:
    """The images sent with a chat question, as checked data URLs.

    Accepted either as `images` in a JSON body (data URLs, which is what the
    apps send after shrinking the photo on the device) or as uploaded files in
    a multipart form.
    """
    raw_images: list[bytes] = []

    files = getattr(request, 'FILES', None)
    if files:
        for upload in files.getlist('images'):
            raw_images.append(upload.read())

    data = getattr(request, 'data', None)
    sent = data.get('images') if hasattr(data, 'get') else None
    if isinstance(sent, str):
        sent = [sent]
    if isinstance(sent, (list, tuple)):
        for item in sent:
            if not isinstance(item, str):
                raise ValidationError({'images': 'Images must be sent as data URLs.'})
            match = _DATA_URL.match(item.strip())
            if not match:
                raise ValidationError({'images': 'Images must be sent as data URLs.'})
            try:
                raw_images.append(base64.b64decode(match.group(2), validate=True))
            except (binascii.Error, ValueError):
                raise ValidationError({'images': 'One of the images could not be read.'})

    return _as_data_urls(raw_images)


def _as_data_urls(raw_images: list[bytes]) -> list[str]:
    if not raw_images:
        return []
    if len(raw_images) > max_images():
        raise ValidationError({'images': f'Send at most {max_images()} photos with one question.'})
    if sum(len(raw) for raw in raw_images) > max_total_bytes():
        limit_mb = max_total_bytes() / (1024 * 1024)
        raise ValidationError({'images': f'The photos are too large together. Keep them under {limit_mb:.0f} MB.'})

    urls = []
    for raw in raw_images:
        mime = _check(raw)
        urls.append(f'data:{mime};base64,{base64.b64encode(raw).decode("ascii")}')
    return urls


#: Long edge a photo is reduced to when it arrives full size. The apps do this
#: on the device; a chat app sends the original.
SHRINK_EDGE = 1600


def shrink(raw: bytes, *, edge: int = SHRINK_EDGE, quality: int = 85) -> bytes:
    """A full-size photo, redrawn at a readable size as JPEG.

    Anything that cannot be opened is returned unchanged, to be refused by the
    check that follows rather than here.
    """
    from PIL import Image, ImageOps

    try:
        with Image.open(io.BytesIO(raw)) as image:
            image = ImageOps.exif_transpose(image)
            if max(image.size) <= edge and len(raw) <= 900 * 1024:
                return raw
            image.thumbnail((edge, edge))
            if image.mode not in ('RGB', 'L'):
                background = Image.new('RGB', image.size, 'white')
                background.paste(image, mask=image.convert('RGBA').split()[-1])
                image = background
            out = io.BytesIO()
            image.convert('RGB').save(out, format='JPEG', quality=quality, optimize=True)
            return out.getvalue()
    except Exception:  # noqa: BLE001 - the check that follows gives the reason
        return raw


def images_from_bytes(raw_images: list[bytes]) -> list[str]:
    """Photos received as files (a chat bot), shrunk, checked, as data URLs."""
    return _as_data_urls([shrink(raw) for raw in raw_images])

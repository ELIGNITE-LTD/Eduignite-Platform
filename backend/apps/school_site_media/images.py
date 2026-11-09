"""Upload validation and sanitising for public-site images.

An uploaded file is never stored as received. It is opened with Pillow (so the
real content is checked, not the extension or the declared type), limited to
JPEG/PNG/WEBP, size and pixel capped, rotated by its EXIF orientation, then
re-encoded from raw pixels so EXIF/GPS/ICC/text metadata cannot survive. The
stored name is a random UUID; the uploader's filename is discarded.
"""

import io
import uuid
from dataclasses import dataclass

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_SOURCE_SIDE = 8000        # longest accepted side, in pixels
MAX_SOURCE_PIXELS = 40_000_000
MAX_STORED_SIDE = 2000        # the stored image is downscaled to this
THUMB_SIDE = 480
ALLOWED_FORMATS = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
ALLOWED_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


class ImageRejected(ValueError):
    """The upload cannot be accepted; the message is safe to show the user."""


@dataclass
class ProcessedImage:
    main: ContentFile
    thumb: ContentFile
    width: int
    height: int
    size: int


def _encode(img, fmt):
    buf = io.BytesIO()
    if fmt == 'JPEG':
        img.convert('RGB').save(buf, 'JPEG', quality=85, optimize=True)
    elif fmt == 'PNG':
        img.save(buf, 'PNG', optimize=True)
    else:
        img.save(buf, 'WEBP', quality=82)
    return buf.getvalue()


def process_upload(uploaded):
    """Validate and re-encode an uploaded image. Raises ImageRejected."""
    if uploaded is None:
        raise ImageRejected('No image was sent.')
    if uploaded.size > MAX_UPLOAD_BYTES:
        raise ImageRejected('The image is larger than 5 MB.')
    if uploaded.size == 0:
        raise ImageRejected('The image is empty.')
    name = (getattr(uploaded, 'name', '') or '').lower()
    ext = name.rsplit('.', 1)[-1] if '.' in name else ''
    if ext not in ALLOWED_EXTENSIONS:
        raise ImageRejected('Only JPEG, PNG or WEBP images are accepted.')
    ctype = (getattr(uploaded, 'content_type', '') or '').lower()
    if ctype and ctype not in ALLOWED_CONTENT_TYPES:
        raise ImageRejected('Only JPEG, PNG or WEBP images are accepted.')

    data = uploaded.read()
    try:
        probe = Image.open(io.BytesIO(data))
        fmt = probe.format
        probe.verify()
        img = Image.open(io.BytesIO(data))
        width, height = img.size
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError):
        raise ImageRejected('The file is not a valid image.')
    if fmt not in ALLOWED_FORMATS:
        raise ImageRejected('Only JPEG, PNG or WEBP images are accepted.')
    if max(width, height) > MAX_SOURCE_SIDE or width * height > MAX_SOURCE_PIXELS:
        raise ImageRejected('The image dimensions are too large (maximum 8000 pixels on a side).')
    if width < 1 or height < 1:
        raise ImageRejected('The file is not a valid image.')

    try:
        img.load()
        img = ImageOps.exif_transpose(img)  # bake in the orientation, then drop the tag
        # Rebuild from pixels only: no EXIF, GPS, ICC profile or text chunks carry over.
        clean = Image.new(img.mode if img.mode in ('RGB', 'RGBA', 'L') else 'RGBA', img.size)
        clean.paste(img.convert(clean.mode))
        main = clean.copy()
        main.thumbnail((MAX_STORED_SIDE, MAX_STORED_SIDE), Image.LANCZOS)
        thumb = clean.copy()
        thumb.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.LANCZOS)
        main_bytes = _encode(main, fmt)
        thumb_bytes = _encode(thumb, 'WEBP')
    except (OSError, ValueError, SyntaxError):
        raise ImageRejected('The image could not be processed.')

    stem = uuid.uuid4().hex
    return ProcessedImage(
        main=ContentFile(main_bytes, name=f'{stem}.{ALLOWED_FORMATS[fmt]}'),
        thumb=ContentFile(thumb_bytes, name=f'{stem}_t.webp'),
        width=main.size[0], height=main.size[1], size=len(main_bytes),
    )

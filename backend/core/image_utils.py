"""
Image processing utilities for EduIgnite.

Handles avatar resizing, thumbnail generation, format validation,
and base64 encoding/decoding for profile images and uploaded media.
"""
import base64
import io
import logging
import os
import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import InMemoryUploadedFile

from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
AVATAR_SIZE = (256, 256)
THUMBNAIL_SIZE = (64, 64)
BANNER_SIZE = (1200, 400)
LOGO_SIZE = (512, 512)
MAX_UPLOAD_MB = 10
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
OUTPUT_FORMAT = "WEBP"
OUTPUT_QUALITY = 85


# ── Validators ─────────────────────────────────────────────────────────────────

def validate_image_file(file) -> None:
    """Raise ValidationError if *file* is not a valid, safe image."""
    if file.size > MAX_UPLOAD_BYTES:
        raise ValidationError(
            f"Image file too large. Maximum size is {MAX_UPLOAD_MB} MB."
        )

    ext = Path(file.name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        file.seek(0)
        img = Image.open(file)
        img.verify()
        file.seek(0)
    except (UnidentifiedImageError, Exception) as exc:
        raise ValidationError(f"Invalid or corrupt image file: {exc}") from exc


# ── Processing helpers ─────────────────────────────────────────────────────────

def _open_image(source) -> Image.Image:
    """Open an image from a file-like object or bytes."""
    if isinstance(source, (bytes, bytearray)):
        source = io.BytesIO(source)
    img = Image.open(source)
    img = ImageOps.exif_transpose(img)           # auto-rotate via EXIF
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    return img


def resize_and_crop(img: Image.Image, target_size: tuple) -> Image.Image:
    """Resize *img* to *target_size* using a smart crop (cover)."""
    return ImageOps.fit(img, target_size, method=Image.LANCZOS)


def _encode_to_webp(img: Image.Image, quality: int = OUTPUT_QUALITY) -> bytes:
    """Encode a PIL image to WebP bytes."""
    buf = io.BytesIO()
    save_img = img.convert("RGB") if img.mode == "RGBA" else img
    save_img.save(buf, format="WEBP", quality=quality, method=6)
    return buf.getvalue()


# ── Public API ─────────────────────────────────────────────────────────────────

def process_avatar(file_or_bytes, size: tuple = AVATAR_SIZE) -> str:
    """
    Process an uploaded avatar image.

    Returns a base64-encoded data URI (data:image/webp;base64,...) suitable
    for storage in the User.avatar TextField or direct use in <img src>.
    """
    img = _open_image(file_or_bytes)
    img = resize_and_crop(img, size)
    webp_bytes = _encode_to_webp(img)
    encoded = base64.b64encode(webp_bytes).decode("utf-8")
    return f"data:image/webp;base64,{encoded}"


def process_logo(file_or_bytes) -> str:
    """Process a school logo — 512×512, WebP data URI."""
    return process_avatar(file_or_bytes, size=LOGO_SIZE)


def process_banner(file_or_bytes) -> str:
    """Process a school banner — 1200×400, WebP data URI."""
    return process_avatar(file_or_bytes, size=BANNER_SIZE)


def process_thumbnail(file_or_bytes) -> str:
    """Generate a 64×64 thumbnail data URI."""
    return process_avatar(file_or_bytes, size=THUMBNAIL_SIZE)


def process_to_django_file(
    file_or_bytes,
    target_size: tuple = AVATAR_SIZE,
    field_name: str = "image",
) -> InMemoryUploadedFile:
    """
    Process an image and return a Django InMemoryUploadedFile.

    Useful when saving to a model ImageField rather than a TextField.
    """
    img = _open_image(file_or_bytes)
    img = resize_and_crop(img, target_size)
    webp_bytes = _encode_to_webp(img)
    filename = f"{uuid.uuid4().hex}.webp"
    buf = io.BytesIO(webp_bytes)
    return InMemoryUploadedFile(
        file=buf,
        field_name=field_name,
        name=filename,
        content_type="image/webp",
        size=len(webp_bytes),
        charset=None,
    )


def decode_base64_image(data_uri: str) -> bytes:
    """
    Decode a base64 data URI to raw bytes.

    Accepts both ``data:image/...;base64,<data>`` and plain base64 strings.
    """
    if data_uri.startswith("data:"):
        _, encoded = data_uri.split(",", 1)
    else:
        encoded = data_uri
    return base64.b64decode(encoded)


def get_image_dimensions(file_or_bytes) -> tuple:
    """Return (width, height) of an image."""
    img = _open_image(file_or_bytes)
    return img.size


def is_valid_image(file_or_bytes) -> bool:
    """Return True if *file_or_bytes* is a valid image Pillow can open."""
    try:
        _open_image(file_or_bytes)
        return True
    except Exception:
        return False


def generate_placeholder_avatar(name: str, size: int = 256) -> str:
    """
    Generate a simple letter-based placeholder avatar as a base64 WebP data URI.

    Uses the first letter of *name* on a coloured background.
    """
    from PIL import ImageDraw, ImageFont

    # Pick a deterministic background colour from the name
    palette = [
        (52, 152, 219),   # blue
        (46, 204, 113),   # green
        (231, 76, 60),    # red
        (155, 89, 182),   # purple
        (230, 126, 34),   # orange
        (26, 188, 156),   # teal
        (241, 196, 15),   # yellow
        (149, 165, 166),  # grey
    ]
    colour = palette[sum(ord(c) for c in name) % len(palette)]

    img = Image.new("RGB", (size, size), colour)
    draw = ImageDraw.Draw(img)

    letter = (name[0].upper()) if name else "?"
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size // 2)
    except (IOError, OSError):
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), letter, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2 - bbox[0]
    y = (size - text_h) // 2 - bbox[1]
    draw.text((x, y), letter, fill=(255, 255, 255), font=font)

    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=90)
    encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/webp;base64,{encoded}"

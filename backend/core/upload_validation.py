import base64


IMAGE_UPLOAD_MAX_BYTES = 6 * 1024 * 1024
IMAGE_UPLOAD_MAX_LABEL = '6MB'

BASE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
SVG_IMAGE_TYPE = 'image/svg+xml'


def allowed_image_types(allow_svg=False):
    types = [*BASE_IMAGE_TYPES]
    if allow_svg:
        types.append(SVG_IMAGE_TYPE)
    return types


def readable_image_types_label(allow_svg=False):
    label = 'JPG, PNG, GIF, or WebP'
    return f'{label}, or SVG' if allow_svg else label


def validate_image_upload(file, field_label='image', allow_svg=False):
    """Return an API-friendly error string when an uploaded image is not acceptable."""
    type_label = readable_image_types_label(allow_svg)
    if not file:
        return f'No {field_label} file was received. Please choose a {type_label} image under {IMAGE_UPLOAD_MAX_LABEL}.'

    content_type = getattr(file, 'content_type', '') or ''
    if content_type not in allowed_image_types(allow_svg):
        return f'Unsupported {field_label} type. Please upload {type_label}.'

    size = getattr(file, 'size', 0) or 0
    if size <= 0:
        return f'The selected {field_label} appears to be empty. Please choose a valid image under {IMAGE_UPLOAD_MAX_LABEL}.'

    if size > IMAGE_UPLOAD_MAX_BYTES:
        return f'This {field_label} is too large. Maximum upload size is {IMAGE_UPLOAD_MAX_LABEL}.'

    return None


def image_to_data_url(file):
    try:
        if hasattr(file, 'seek'):
            file.seek(0)
        encoded = base64.b64encode(file.read()).decode('utf-8')
    except Exception as exc:
        raise ValueError('The upload could not be read. Please retry on a stable connection with a valid image file.') from exc
    return f'data:{file.content_type};base64,{encoded}'

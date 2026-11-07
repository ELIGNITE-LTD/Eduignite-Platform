"""Accept file uploads that arrive as base64 JSON.

The Capacitor mobile build routes every request through the native HTTP stack
(CapacitorHttp) to avoid CORS. That stack cannot send a real
``multipart/form-data`` body with file bytes, so uploads from the phone used to
arrive empty while the web and desktop builds (real browser networking) worked.

To fix uploads without changing the networking everything else depends on, the
mobile client encodes an upload as a small JSON envelope and sends it with the
content type below:

    {
      "fields": {"name": "value", ...},
      "files":  [{"field": "avatar", "filename": "p.jpg",
                   "content_type": "image/jpeg", "data": "<base64>"}, ...]
    }

This parser turns that envelope back into exactly what a normal multipart upload
would have produced: ``request.data`` holds the flat fields and
``request.FILES`` holds the files. Every existing view and serializer that reads
a ``FileField`` or ``request.FILES`` keeps working unchanged, and because the
parser only matches this one content type, no other request is affected.
"""

import base64
import binascii
import io
import json

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.http import QueryDict
from django.utils.datastructures import MultiValueDict
from rest_framework.exceptions import ParseError
from rest_framework.parsers import BaseParser, DataAndFiles

#: Only requests sent with exactly this content type are handled here. The
#: mobile client sets it when, and only when, it has rebuilt a FormData upload
#: as base64 JSON.
UPLOAD_MEDIA_TYPE = 'application/x-eduignite-base64-upload'


class Base64MultipartParser(BaseParser):
    """Rebuild a base64 JSON upload envelope into fields + files."""

    media_type = UPLOAD_MEDIA_TYPE

    def parse(self, stream, media_type=None, parser_context=None):
        raw = stream.read()
        if isinstance(raw, bytes):
            raw = raw.decode('utf-8', 'replace')
        try:
            envelope = json.loads(raw) if raw else {}
        except (ValueError, TypeError):
            raise ParseError('Malformed upload envelope.')
        if not isinstance(envelope, dict):
            raise ParseError('Malformed upload envelope.')

        data = QueryDict(mutable=True)
        for key, value in (envelope.get('fields') or {}).items():
            # A field may legitimately repeat (e.g. several roles); keep them all.
            if isinstance(value, (list, tuple)):
                for item in value:
                    data.appendlist(key, '' if item is None else str(item))
            else:
                data[key] = '' if value is None else str(value)

        files = MultiValueDict()
        for entry in (envelope.get('files') or []):
            if not isinstance(entry, dict):
                continue
            field = entry.get('field') or 'file'
            filename = entry.get('filename') or 'upload'
            content_type = entry.get('content_type') or 'application/octet-stream'
            try:
                content = base64.b64decode(entry.get('data') or '')
            except (binascii.Error, ValueError):
                raise ParseError(f'Could not decode uploaded file "{filename}".')
            uploaded = InMemoryUploadedFile(
                file=io.BytesIO(content),
                field_name=field,
                name=filename,
                content_type=content_type,
                size=len(content),
                charset=None,
            )
            files.appendlist(field, uploaded)

        return DataAndFiles(data, files)

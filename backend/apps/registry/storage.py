"""Getting a package onto local disk, whatever it is stored on.

Django's ``FieldFile.path`` only exists for local filesystem storage. When
``DEFAULT_FILE_STORAGE`` is S3 — which it is in production whenever the bucket
is configured — reading ``.path`` raises ``NotImplementedError``, so anything
that assumed a real path would fail on the server and pass everywhere else.

The runner needs a real file: it unpacks a zip, and the child process has no
network. So a package on remote storage is fetched once and kept in a local
cache, keyed by app and version. Builds are immutable, so a cached copy can
never be stale — a new version is a new key.
"""

from __future__ import annotations

import os
import shutil
import tempfile

CACHE_DIRNAME = 'app_packages'


class PackageUnavailable(RuntimeError):
    """The package file could not be made available locally."""


def _cache_root() -> str:
    from django.conf import settings

    root = getattr(settings, 'APP_PACKAGE_CACHE_ROOT', None)
    if not root:
        runtime = getattr(settings, 'APP_RUNTIME_ROOT', None)
        base = runtime or os.path.join(str(settings.BASE_DIR), 'app_runtime')
        root = os.path.join(base, CACHE_DIRNAME)
    return root


def local_package_path(build) -> str:
    """A filesystem path to this build's .eia, fetching it if necessary.

    Safe to call concurrently: the download goes to a temporary file and is
    moved into place atomically, so two workers racing produce one good file
    rather than one half-written one.
    """
    field = build.package_file
    if not field:
        raise PackageUnavailable('This build has no package file.')

    # Local storage: use it directly, no copying.
    try:
        path = field.path
        if os.path.isfile(path):
            return path
    except (NotImplementedError, ValueError, AttributeError):
        pass

    safe_key = ''.join(c for c in str(build.package.key) if c.isalnum() or c == '_')
    safe_version = ''.join(c for c in str(build.version) if c.isalnum() or c in '._')
    if not safe_key or not safe_version:
        raise PackageUnavailable('This build has an unusable key or version.')

    directory = os.path.join(_cache_root(), safe_key)
    target = os.path.join(directory, f'{safe_version}.eia')
    if os.path.isfile(target) and os.path.getsize(target) > 0:
        return target

    os.makedirs(directory, exist_ok=True)
    handle = None
    try:
        field.open('rb')
        fd, temporary = tempfile.mkstemp(dir=directory, suffix='.part')
        os.close(fd)
        with open(temporary, 'wb') as out:
            shutil.copyfileobj(field, out, length=1024 * 256)
        os.replace(temporary, target)
    except Exception as exc:  # noqa: BLE001
        raise PackageUnavailable(f'Could not fetch the app package: {exc}') from exc
    finally:
        try:
            field.close()
        except Exception:  # noqa: BLE001
            pass
        if handle is not None:
            handle.close()

    return target

"""Getting an approved build's server code ready to import.

App code is Python, so at some point it has to become an importable module.
Two rules make that safe enough to do:

* **only approved builds are ever unpacked.** A draft or rejected build has no
  presence on disk at all, so there is nothing to accidentally import.
* **unpacking happens inside the runner's child process**, never in the web
  process. The web process must never import app code — an import runs a
  module's top level, and that is exactly the thing we are trying to contain.

Each build is unpacked once to its own directory and imported under a name
carrying its version, so two versions of the same app can never collide in
``sys.modules`` and a rollback does not serve half of the old build.
"""

from __future__ import annotations

import importlib.util
import os
import posixpath
import sys
import zipfile

#: Where unpacked builds live. Kept outside MEDIA_ROOT so nothing here is
#: ever served over HTTP — this is code, not an asset.
RUNTIME_DIRNAME = 'app_runtime'


class LoaderError(RuntimeError):
    """A build that cannot be prepared or imported."""


def runtime_root() -> str:
    from django.conf import settings

    root = getattr(settings, 'APP_RUNTIME_ROOT', None)
    if not root:
        root = os.path.join(str(settings.BASE_DIR), RUNTIME_DIRNAME)
    return root


def build_directory(app_key: str, version: str) -> str:
    safe_key = ''.join(c for c in app_key if c.isalnum() or c == '_')
    safe_version = ''.join(c for c in version if c.isalnum() or c in '._')
    if not safe_key or not safe_version:
        raise LoaderError(f'Unusable app key or version: {app_key!r} {version!r}')
    return os.path.join(runtime_root(), safe_key, safe_version)


def _safe_member(name: str) -> str:
    """Re-check every path on the way out of the zip.

    The package reader already rejected traversal at upload time. This checks
    again because unpacking is the moment a bad path would actually write
    somewhere it should not, and a check at the point of danger is worth more
    than a check upstream.
    """
    if name.startswith('/') or '\\' in name:
        raise LoaderError(f'Unsafe path in package: {name!r}')
    normalised = posixpath.normpath(name)
    if normalised.startswith('..') or '/../' in f'/{normalised}':
        raise LoaderError(f'Path escapes the package: {name!r}')
    return normalised


def unpack(package_path: str, app_key: str, version: str, *, force: bool = False) -> str:
    """Unpack ``server/`` from a build. Returns the directory it went to.

    Only the server code is unpacked. Web bundles are served straight from
    storage and assets never need to be on the runtime path, so neither is
    written next to code that will be imported.
    """
    target = build_directory(app_key, version)
    marker = os.path.join(target, '.unpacked')

    if os.path.exists(marker) and not force:
        return target

    os.makedirs(target, exist_ok=True)
    with zipfile.ZipFile(package_path) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            name = _safe_member(entry.filename)
            if not name.startswith('server/') or not name.endswith('.py'):
                continue

            destination = os.path.join(target, *name.split('/'))
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            with archive.open(entry) as source, open(destination, 'wb') as handle:
                handle.write(source.read())

    package_init = os.path.join(target, 'server', '__init__.py')
    os.makedirs(os.path.dirname(package_init), exist_ok=True)
    if not os.path.exists(package_init):
        open(package_init, 'a').close()

    with open(marker, 'w', encoding='utf-8') as handle:
        handle.write(version)
    return target


def module_name(app_key: str, version: str) -> str:
    """A name unique to this build, so versions cannot collide in sys.modules."""
    slug = version.replace('.', '_')
    return f'eduignite_app__{app_key}__{slug}'


def import_handler(app_key: str, version: str, handler: str, directory: str):
    """Import ``handler`` from an unpacked build.

    ``handler`` is ``module.function`` relative to ``server/`` — for example
    ``handlers.register_clock_in``. Only ever called inside the runner's child
    process.
    """
    if '.' not in handler:
        raise LoaderError(
            f'Handler {handler!r} must name a module and a function, '
            'for example "handlers.clock_in".'
        )
    module_path, _, function_name = handler.rpartition('.')

    root = module_name(app_key, version)
    server_dir = os.path.join(directory, 'server')
    if not os.path.isdir(server_dir):
        raise LoaderError(f'{app_key} {version} has no server/ directory.')

    # The build's own directory is the only thing added to the path, and it is
    # removed again straight after, so one app can never import another's code.
    inserted = False
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)
        inserted = True
    try:
        file_path = os.path.join(server_dir, *module_path.split('.')) + '.py'
        if not os.path.isfile(file_path):
            raise LoaderError(f'{app_key} {version} has no server/{module_path}.py.')

        spec = importlib.util.spec_from_file_location(f'{root}.{module_path}', file_path)
        if spec is None or spec.loader is None:
            raise LoaderError(f'Cannot load server/{module_path}.py.')
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    finally:
        if inserted:
            try:
                sys.path.remove(server_dir)
            except ValueError:
                pass

    function = getattr(module, function_name, None)
    if function is None or not callable(function):
        raise LoaderError(
            f'{app_key} {version} has no function {function_name!r} '
            f'in server/{module_path}.py.'
        )
    return function

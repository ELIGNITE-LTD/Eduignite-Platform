"""Reading and validating an uploaded ``.eia`` package.

An ``.eia`` is a zip:

    manifest.json     what the app is, what it needs, what it contributes
    server/           Python package - app logic
    web/              built JS bundle(s) - app UI
    assets/           icons, images
    migrations/       declared data migrations between app versions
    CHANGELOG.md      shown to schools when an update is offered

Everything here runs on **untrusted-shaped input** even though our own team
produces it: a zip from a browser upload is attacker-shaped whether or not the
uploader meant harm. So the reader never extracts to disk, never imports
anything, and never trusts a declared size or path.

Nothing in a package executes at upload time. There is deliberately no install
hook: the only things that ever run are ``server/`` handlers the runtime calls,
and ``web/`` bundles the client loads, and both happen long after review.
"""

from __future__ import annotations

import json
import posixpath
import zipfile
from dataclasses import dataclass

from .manifest import AppManifest, ManifestError
from .manifest_schema import manifest_from_dict

#: A single package is capped well below anything that would trouble the
#: server; these clients run on mid-range Android over slow connections and a
#: bundle they cannot download is a bundle they cannot use.
MAX_PACKAGE_BYTES = 25 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024
MAX_ENTRIES = 5000

#: Only these top-level directories mean anything. Anything else is rejected
#: rather than ignored, so a package cannot smuggle files past review by
#: putting them where nobody looks.
ALLOWED_ROOTS = {'server', 'web', 'assets', 'migrations'}
ALLOWED_FILES = {'manifest.json', 'CHANGELOG.md'}


class PackageError(ValueError):
    """An uploaded package that cannot be accepted. Message is shown to the uploader."""


@dataclass(frozen=True)
class PackageContents:
    """What a validated package holds. No file has been written to disk."""

    manifest: AppManifest
    raw_manifest: dict
    changelog: str
    server_files: dict          # path -> decoded source
    web_files: list             # paths only; bundles are served, not parsed
    asset_files: list
    migration_files: dict       # path -> decoded source
    total_uncompressed: int


def _safe_name(name: str) -> str:
    """Reject anything that could escape a directory or hide from review."""
    if name.startswith('/') or name.startswith('\\'):
        raise PackageError(f'Absolute path in package: {name!r}')
    if '\\' in name:
        raise PackageError(f'Windows path separator in package: {name!r}')
    normalised = posixpath.normpath(name)
    if normalised.startswith('..') or '/../' in f'/{normalised}':
        raise PackageError(f'Path escapes the package: {name!r}')
    if normalised != name.rstrip('/'):
        raise PackageError(f'Non-canonical path in package: {name!r}')
    return normalised


def read_package(fileobj) -> PackageContents:
    """Validate an ``.eia`` and return its contents.

    Raises :class:`PackageError` with a message meant for whoever uploaded it.
    """
    try:
        archive = zipfile.ZipFile(fileobj)
    except zipfile.BadZipFile as exc:
        raise PackageError('That file is not a valid .eia package.') from exc

    entries = archive.infolist()
    if len(entries) > MAX_ENTRIES:
        raise PackageError(f'Package has more than {MAX_ENTRIES} files.')

    # Guard against a zip bomb before reading anything out of it.
    total = sum(entry.file_size for entry in entries)
    if total > MAX_UNCOMPRESSED_BYTES:
        raise PackageError(
            f'Package expands to {total // (1024 * 1024)} MB, over the '
            f'{MAX_UNCOMPRESSED_BYTES // (1024 * 1024)} MB limit.'
        )

    server_files: dict = {}
    migration_files: dict = {}
    web_files: list = []
    asset_files: list = []
    manifest_bytes = None
    changelog = ''

    for entry in entries:
        if entry.is_dir():
            continue
        name = _safe_name(entry.filename)
        root = name.split('/', 1)[0]

        if name == 'manifest.json':
            manifest_bytes = archive.read(entry)
            continue
        if name == 'CHANGELOG.md':
            changelog = _decode(archive.read(entry), name)
            continue
        if root not in ALLOWED_ROOTS or name in ALLOWED_FILES:
            raise PackageError(
                f'Unexpected file in package: {name!r}. Only manifest.json, '
                'CHANGELOG.md, server/, web/, assets/ and migrations/ are allowed.'
            )

        if root == 'server':
            if not name.endswith('.py'):
                raise PackageError(f'server/ may only contain Python files: {name!r}')
            server_files[name] = _decode(archive.read(entry), name)
        elif root == 'migrations':
            if not name.endswith('.py'):
                raise PackageError(f'migrations/ may only contain Python files: {name!r}')
            migration_files[name] = _decode(archive.read(entry), name)
        elif root == 'web':
            web_files.append(name)
        else:
            asset_files.append(name)

    if manifest_bytes is None:
        raise PackageError('Package has no manifest.json.')

    try:
        raw = json.loads(_decode(manifest_bytes, 'manifest.json'))
    except json.JSONDecodeError as exc:
        raise PackageError(f'manifest.json is not valid JSON: {exc}') from exc
    if not isinstance(raw, dict):
        raise PackageError('manifest.json must be a JSON object.')

    try:
        manifest = manifest_from_dict(raw)
    except ManifestError as exc:
        raise PackageError(str(exc)) from exc

    _check_entries_exist(manifest, raw, web_files)

    return PackageContents(
        manifest=manifest,
        raw_manifest=raw,
        changelog=changelog,
        server_files=server_files,
        web_files=web_files,
        asset_files=asset_files,
        migration_files=migration_files,
        total_uncompressed=total,
    )


def _decode(data: bytes, name: str) -> str:
    try:
        return data.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise PackageError(f'{name} is not valid UTF-8.') from exc


def _check_entries_exist(manifest: AppManifest, raw: dict, web_files: list) -> None:
    """Every screen must point at a bundle the package actually contains.

    A screen whose entry is missing would install cleanly and then show a blank
    panel to a school, which is exactly the kind of failure review should catch
    rather than a teacher discovering it.
    """
    present = set(web_files)
    for screen in raw.get('screens') or []:
        entry = (screen or {}).get('entry')
        if not entry:
            raise PackageError(
                f"Screen {screen.get('id', '?')!r} has no entry bundle."
            )
        if entry not in present:
            raise PackageError(
                f"Screen {screen.get('id', '?')!r} points at {entry!r}, "
                'which is not in the package.'
            )

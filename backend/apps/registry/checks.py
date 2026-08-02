"""Automated checks a submission must pass before a human reviews it.

These run on the package source without importing or executing any of it —
importing a module runs its top level, which is exactly what we must not do to
code that has not been reviewed yet. Everything here is AST analysis.

The checks catch the mistakes self-review reliably misses: an app quietly
reaching for the network, a permission used but not declared, a migration with
no reverse. They are a filter in front of a person, not a replacement for one.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field

#: Imports an app has no business making. Network and process access are the
#: obvious ones; the ORM and Django internals matter just as much, because an
#: app reaching the database directly bypasses the scoping that keeps one
#: school's records away from another's.
FORBIDDEN_IMPORTS = {
    'socket', 'subprocess', 'os', 'sys', 'shutil', 'pathlib', 'ctypes',
    'multiprocessing', 'threading', 'importlib', 'pickle', 'marshal',
    'urllib', 'http', 'requests', 'httpx', 'ftplib', 'smtplib', 'telnetlib',
    'django', 'psycopg2', 'sqlite3', 'sqlalchemy',
}

#: Builtins that let code reach outside itself whatever the import rules say.
FORBIDDEN_CALLS = {
    'eval', 'exec', 'compile', '__import__', 'open', 'globals', 'locals',
    'getattr', 'setattr', 'delattr', 'vars', 'memoryview',
}

#: SDK calls that imply a permission. Used to compare what the code does
#: against what the manifest declared.
SDK_PERMISSION_CALLS = {
    'insert': 'write', 'update': 'write', 'delete': 'write',
    'query': 'read', 'get': 'read', 'count': 'read',
}


@dataclass
class CheckResult:
    """Outcome of the automated pass."""

    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.errors

    def as_dict(self) -> dict:
        return {
            'passed': self.passed,
            'errors': list(self.errors),
            'warnings': list(self.warnings),
        }


def _root_module(name: str) -> str:
    return (name or '').split('.', 1)[0]


def _check_source(path: str, source: str, result: CheckResult) -> ast.AST | None:
    try:
        return ast.parse(source, filename=path)
    except SyntaxError as exc:
        result.errors.append(f'{path}: syntax error on line {exc.lineno}: {exc.msg}')
        return None


def _scan_imports_and_calls(path: str, tree: ast.AST, result: CheckResult) -> None:
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = _root_module(alias.name)
                if root in FORBIDDEN_IMPORTS:
                    result.errors.append(
                        f'{path}:{node.lineno}: imports {alias.name!r}. Apps reach data '
                        'through the SDK and cannot use the network, the filesystem or '
                        'the database directly.'
                    )
        elif isinstance(node, ast.ImportFrom):
            root = _root_module(node.module or '')
            if node.level and node.level > 0:
                continue  # relative import inside the app itself is fine
            if root in FORBIDDEN_IMPORTS:
                result.errors.append(
                    f'{path}:{node.lineno}: imports from {node.module!r}. Apps reach data '
                    'through the SDK and cannot use the network, the filesystem or the '
                    'database directly.'
                )
        elif isinstance(node, ast.Call):
            name = getattr(node.func, 'id', None)
            if name in FORBIDDEN_CALLS:
                result.errors.append(
                    f'{path}:{node.lineno}: calls {name}(), which can reach outside the '
                    'app whatever the import rules say.'
                )
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith('__') and node.attr.endswith('__'):
                if node.attr not in {'__name__', '__doc__'}:
                    result.warnings.append(
                        f'{path}:{node.lineno}: touches {node.attr}, which is usually a '
                        'way around the runtime rather than a legitimate need.'
                    )


def _collections_used(tree: ast.AST) -> set:
    """Find ctx.data.collection('name').<action>(...) usage.

    Best-effort by design: a name built at runtime cannot be resolved
    statically, and this is a filter in front of review rather than proof.
    """
    used = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not isinstance(func, ast.Attribute):
            continue
        action = SDK_PERMISSION_CALLS.get(func.attr)
        if action is None:
            continue
        inner = func.value
        while isinstance(inner, ast.Call):
            if (
                isinstance(inner.func, ast.Attribute)
                and inner.func.attr == 'collection'
                and inner.args
                and isinstance(inner.args[0], ast.Constant)
                and isinstance(inner.args[0].value, str)
            ):
                used.add((inner.args[0].value, action))
                break
            inner = inner.func.value if isinstance(inner.func, ast.Attribute) else None
            if inner is None:
                break
    return used


def run_checks(contents, *, published_key: str | None = None,
               published_version: str | None = None) -> CheckResult:
    """Run every automated check over a validated package.

    ``published_key`` and ``published_version`` come from the app already in the
    store, when there is one.
    """
    result = CheckResult()
    manifest = contents.manifest
    raw = contents.raw_manifest

    # --- identity -----------------------------------------------------------
    if published_key and manifest.key != published_key:
        result.errors.append(
            f'This build declares key {manifest.key!r} but the published app is '
            f'{published_key!r}. Changing an app key orphans every installation and '
            'every row of school data.'
        )
    if published_version and not _version_greater(str(raw.get('version')), published_version):
        result.errors.append(
            f'Version {raw.get("version")} is not newer than the published '
            f'{published_version}. Every submission must increment the version.'
        )

    # --- source -------------------------------------------------------------
    declared = set()
    for entry in (raw.get('permissions') or {}).get('collections') or []:
        name, _, action = entry.partition(':')
        declared.add((name, action))

    used: set = set()
    for path, source in sorted(contents.server_files.items()):
        tree = _check_source(path, source, result)
        if tree is None:
            continue
        _scan_imports_and_calls(path, tree, result)
        used |= _collections_used(tree)

    # Anything the code does but did not ask for. The reverse — declared but
    # unused — is only a warning, since a permission may be used on a path the
    # scanner cannot see.
    for name, action in sorted(used - declared):
        result.errors.append(
            f'Code performs {action} on collection {name!r} but the manifest does not '
            f'declare "{name}:{action}".'
        )
    for name, action in sorted(declared - used):
        result.warnings.append(
            f'Manifest declares "{name}:{action}" but no call to it was found. '
            'Remove it if the app does not need it.'
        )

    # --- migrations ---------------------------------------------------------
    for path, source in sorted(contents.migration_files.items()):
        tree = _check_source(path, source, result)
        if tree is None:
            continue
        _scan_imports_and_calls(path, tree, result)
        functions = {
            node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)
        }
        if 'forward' not in functions:
            result.errors.append(f'{path}: migration has no forward().')
        if 'reverse' not in functions:
            result.errors.append(
                f'{path}: migration has no reverse(). Without one a rollback is a '
                'data loss event.'
            )

    # --- shape --------------------------------------------------------------
    if not contents.web_files and raw.get('screens'):
        result.errors.append('Manifest declares screens but the package has no web/ bundles.')
    if not raw.get('screens') and not raw.get('jobs'):
        result.warnings.append('App declares no screens and no jobs, so it does nothing.')
    if not contents.changelog.strip():
        result.warnings.append(
            'No CHANGELOG.md. Schools are shown this when deciding whether to update.'
        )

    return result


def _version_greater(candidate: str, existing: str) -> bool:
    def parts(value):
        try:
            return tuple(int(p) for p in str(value).split('.'))
        except (TypeError, ValueError):
            return (0, 0, 0)

    return parts(candidate) > parts(existing)

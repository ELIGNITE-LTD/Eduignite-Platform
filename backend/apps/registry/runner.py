"""Running an app handler with limits, in a process that is not the web process.

Why a separate process at all, given our own team writes the apps: a bug is
enough. An infinite loop, a runaway allocation or a segfault inside gunicorn
takes the platform down for every school. In a child process it takes down one
call, and the parent reports a clean error.

What the child gets:

* a wall-clock timeout — the parent kills it and reports rather than waiting;
* an address-space cap and a CPU cap, where the OS supports them;
* its own database connections, never the parent's inherited ones;
* no return path except a pickled result over a pipe.

What this does **not** do is stop determined code from reaching the network.
The AST checks refuse the imports that would let an app try, and review stands
behind that, but a process-level guarantee would need OS namespaces and is not
claimed here. It is written down rather than glossed because the difference
matters if anyone ever describes this to a school.
"""

from __future__ import annotations

import multiprocessing
import os
import traceback
from dataclasses import dataclass

#: Defaults. Overridable in settings for a heavier app, but not by the app.
DEFAULT_TIMEOUT_SECONDS = 8
DEFAULT_MEMORY_MB = 512
DEFAULT_CPU_SECONDS = 10


class RunnerError(RuntimeError):
    """The handler could not be run. Distinct from the handler itself failing."""


@dataclass
class RunResult:
    """What came back. ``ok`` false means the app failed, not the platform."""

    ok: bool
    value: object = None
    error: str = ''
    error_type: str = ''
    timed_out: bool = False
    traceback: str = ''

    def as_dict(self) -> dict:
        return {
            'ok': self.ok,
            'value': self.value,
            'error': self.error,
            'error_type': self.error_type,
            'timed_out': self.timed_out,
        }


def _limits():
    from django.conf import settings

    return (
        int(getattr(settings, 'APP_RUNTIME_TIMEOUT_SECONDS', DEFAULT_TIMEOUT_SECONDS)),
        int(getattr(settings, 'APP_RUNTIME_MEMORY_MB', DEFAULT_MEMORY_MB)),
        int(getattr(settings, 'APP_RUNTIME_CPU_SECONDS', DEFAULT_CPU_SECONDS)),
    )


def _apply_rlimits(memory_mb: int, cpu_seconds: int) -> None:
    """Cap the child. POSIX only; a no-op elsewhere, which is why the child is
    still never trusted with anything the SDK does not hand it."""
    try:
        import resource
    except ImportError:      # Windows
        return
    try:
        limit = memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
        # A handler has no business writing files, so it may not create any.
        resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    except (ValueError, OSError):
        pass


def _child(pipe, job: dict, memory_mb: int, cpu_seconds: int) -> None:
    """Runs in the child. Everything here is disposable."""
    _apply_rlimits(memory_mb, cpu_seconds)

    try:
        # A forked child inherits the parent's database connections, and two
        # processes sharing one socket corrupt both. Drop them and let Django
        # open fresh ones on first use.
        from django.db import connections

        connections.close_all()

        from .loader import import_handler, unpack
        from .sdk import AppContext

        directory = unpack(job['package_path'], job['app_key'], job['version'])
        function = import_handler(
            job['app_key'], job['version'], job['handler'], directory
        )

        user = None
        if job.get('user_id'):
            from django.contrib.auth import get_user_model

            user = get_user_model().objects.filter(id=job['user_id']).first()

        context = AppContext(
            app_key=job['app_key'],
            school_id=job['school_id'],
            manifest_raw=job['manifest'],
            user=user,
        )

        value = function(context, job.get('payload') or {})
        pipe.send(RunResult(ok=True, value=_plain(value)))
    except BaseException as exc:  # noqa: BLE001 - the child must never escape
        pipe.send(
            RunResult(
                ok=False,
                error=str(exc)[:2000],
                error_type=type(exc).__name__,
                traceback=traceback.format_exc()[:8000],
            )
        )
    finally:
        try:
            pipe.close()
        except Exception:  # noqa: BLE001
            pass


def _plain(value):
    """Only plain data crosses the pipe.

    A handler returning a model instance or a queryset would drag the ORM
    across the boundary and hand the caller something it could query with. It
    is converted here, or refused.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    raise RunnerError(
        f'A handler returned {type(value).__name__}. Handlers must return plain '
        'data — dicts, lists, strings, numbers or None.'
    )


def _fork_available() -> bool:
    return 'fork' in multiprocessing.get_all_start_methods()


def run_handler(*, app_key: str, version: str, handler: str, manifest: dict,
                package_path: str, school_id, user_id=None,
                payload: dict | None = None) -> RunResult:
    """Run one handler and return what it produced.

    Never raises for an app-level failure: a broken handler is a result with
    ``ok`` false, because one app misbehaving is not a platform error.
    """
    timeout, memory_mb, cpu_seconds = _limits()

    job = {
        'app_key': app_key,
        'version': version,
        'handler': handler,
        'manifest': manifest,
        'package_path': package_path,
        'school_id': str(school_id) if school_id else None,
        'user_id': str(user_id) if user_id else None,
        'payload': payload or {},
    }

    if not _fork_available():
        return _run_inline(job)

    context = multiprocessing.get_context('fork')
    parent_conn, child_conn = context.Pipe(duplex=False)
    process = context.Process(
        target=_child, args=(child_conn, job, memory_mb, cpu_seconds), daemon=True
    )
    process.start()
    child_conn.close()

    result = None
    try:
        if parent_conn.poll(timeout):
            result = parent_conn.recv()
    except EOFError:
        result = None
    finally:
        parent_conn.close()
        process.join(timeout=1)
        if process.is_alive():
            process.terminate()
            process.join(timeout=2)
            if process.is_alive():
                process.kill()

    if result is None:
        if process.exitcode not in (0, None):
            return RunResult(
                ok=False,
                error='The app stopped unexpectedly.',
                error_type='Crashed',
            )
        return RunResult(
            ok=False,
            error=f'The app took longer than {timeout} seconds and was stopped.',
            error_type='Timeout',
            timed_out=True,
        )
    return result


def _run_inline(job: dict) -> RunResult:
    """Development fallback where fork is unavailable, such as Windows.

    Refused when DEBUG is off. Running app code inside the web process is
    exactly what this whole module exists to prevent, so it must never become
    the quiet default in production because a deployment moved.
    """
    from django.conf import settings

    if not getattr(settings, 'DEBUG', False) and not getattr(
        settings, 'APP_RUNTIME_ALLOW_INLINE', False
    ):
        return RunResult(
            ok=False,
            error=(
                'App execution needs process isolation, which this platform does not '
                'provide. Apps are disabled here rather than run inside the web process.'
            ),
            error_type='NoIsolation',
        )

    class _Inline:
        def __init__(self):
            self.value = None

        def send(self, value):
            self.value = value

        def close(self):
            pass

    pipe = _Inline()
    _child(pipe, job, DEFAULT_MEMORY_MB, DEFAULT_CPU_SECONDS)
    return pipe.value or RunResult(ok=False, error='No result.', error_type='NoResult')

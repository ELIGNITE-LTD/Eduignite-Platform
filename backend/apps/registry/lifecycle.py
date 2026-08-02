"""The store-side lifecycle of an uploaded build.

    Draft -> Submitted -> (checks) -> In review -> Approved -> Published
                              |            |
                        Checks failed   Rejected      -> back to Draft

    Published -> Deprecated -> Pulled

Transitions live here rather than in the views so there is one place that knows
what is legal. A build cannot reach schools without passing through every gate,
and the gates cannot be reordered by adding an endpoint.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from .build_models import AppBuild, AppPackage, BuildState

#: from-state -> states it may move to.
ALLOWED = {
    BuildState.DRAFT: {BuildState.SUBMITTED},
    BuildState.SUBMITTED: {BuildState.IN_REVIEW, BuildState.CHECKS_FAILED},
    BuildState.CHECKS_FAILED: {BuildState.DRAFT, BuildState.SUBMITTED},
    BuildState.IN_REVIEW: {BuildState.APPROVED, BuildState.REJECTED},
    BuildState.REJECTED: {BuildState.DRAFT, BuildState.SUBMITTED},
    BuildState.APPROVED: {BuildState.PUBLISHED, BuildState.REJECTED},
    BuildState.PUBLISHED: {BuildState.DEPRECATED, BuildState.PULLED},
    BuildState.DEPRECATED: {BuildState.PULLED, BuildState.PUBLISHED},
    BuildState.PULLED: {BuildState.PUBLISHED},
}


class LifecycleError(RuntimeError):
    """An illegal transition. The message is safe to show whoever attempted it."""


def _move(build: AppBuild, to_state: BuildState, **fields) -> AppBuild:
    current = BuildState(build.state)
    if to_state not in ALLOWED.get(current, set()):
        raise LifecycleError(
            f'A build that is {current.label.lower()} cannot become '
            f'{BuildState(to_state).label.lower()}.'
        )
    build.state = to_state
    for name, value in fields.items():
        setattr(build, name, value)
    build.save()
    return build


def submit(build: AppBuild, *, by=None) -> AppBuild:
    """Send a draft for review, running the automated checks immediately."""
    from .checks import run_checks
    from .package import PackageError, read_package

    _move(build, BuildState.SUBMITTED, submitted_by=by, submitted_at=timezone.now())

    published = build.package.live_build
    try:
        build.package_file.open('rb')
        try:
            contents = read_package(build.package_file)
        finally:
            build.package_file.close()
        report = run_checks(
            contents,
            published_key=build.package.key if published else None,
            published_version=published.version if published else None,
        )
    except PackageError as exc:
        build.state = BuildState.CHECKS_FAILED
        build.check_report = {'passed': False, 'errors': [str(exc)], 'warnings': []}
        build.save(update_fields=['state', 'check_report', 'modified'])
        return build

    build.check_report = report.as_dict()
    build.state = BuildState.IN_REVIEW if report.passed else BuildState.CHECKS_FAILED
    build.save(update_fields=['state', 'check_report', 'modified'])
    return build


def approve(build: AppBuild, *, by=None, note: str = '') -> AppBuild:
    """Approve a reviewed build. Does not publish it — that is a second act.

    A founder may approve their own build. The platform's apps are written and
    reviewed by the same small founding team, so requiring a second person would
    block a solo founder from ever shipping. The automated checks still run at
    submit, and who approved a build is recorded either way, so an approval is
    always attributable even when author and approver are the same person.
    """
    return _move(
        build, BuildState.APPROVED,
        reviewed_by=by, reviewed_at=timezone.now(), review_note=note,
    )


def reject(build: AppBuild, *, by=None, note: str = '') -> AppBuild:
    """Send a build back with a reason."""
    if not note.strip():
        raise LifecycleError('A rejection needs a reason the author can act on.')
    return _move(
        build, BuildState.REJECTED,
        reviewed_by=by, reviewed_at=timezone.now(), review_note=note,
    )


@transaction.atomic
def publish(build: AppBuild) -> AppBuild:
    """Make an approved build the one schools install and are offered.

    Schools already running an earlier build stay on it — they are *offered*
    the update, not moved to it. See the architecture document, section 11.
    """
    package = AppPackage.objects.select_for_update().get(pk=build.package_id)

    previous = package.live_build
    _move(build, BuildState.PUBLISHED, published_at=timezone.now())

    if previous is not None and previous.pk != build.pk:
        if previous.state == BuildState.PUBLISHED:
            previous.state = BuildState.DEPRECATED
            previous.save(update_fields=['state', 'modified'])

    package.live_build = build
    package.save(update_fields=['live_build', 'modified'])
    return build


@transaction.atomic
def pull(build: AppBuild, *, reason: str = '') -> AppBuild:
    """Stop a build running anywhere, including for schools already on it.

    This is the lever for a build that is actively harmful. Where possible the
    package falls back to the previous published build so schools are not left
    with nothing; if there is none, the app goes dark until a fix is published.
    """
    if not reason.strip():
        raise LifecycleError('Pulling a build needs a reason — schools lose it immediately.')

    package = AppPackage.objects.select_for_update().get(pk=build.package_id)
    _move(build, BuildState.PULLED, review_note=reason)

    if package.live_build_id == build.pk:
        fallback = (
            AppBuild.objects.filter(
                package=package, state=BuildState.DEPRECATED
            ).order_by('-published_at').first()
        )
        if fallback is not None:
            fallback.state = BuildState.PUBLISHED
            fallback.save(update_fields=['state', 'modified'])
        package.live_build = fallback
        package.save(update_fields=['live_build', 'modified'])
    return build

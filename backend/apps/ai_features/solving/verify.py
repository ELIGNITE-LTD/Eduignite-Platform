"""Try again when the checks disagree, and say so honestly when they still do.

A disagreement between two methods is information. The old tutor threw it away
by writing a sentence about rounding; this feeds it back and tries again, up to
three times, because a solver given the specific discrepancy often fixes it.

What matters more is the end of that road. If the checks still disagree after
three attempts, the answer is not shown as though it were certain. It is shown
with what was verified, what was not, and a badge that says so. An honest
"partially verified" is worth more to a student than a confident wrong answer,
and far more than silence.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Callable

from .claims import audit_claims
from .charts import ChartProblem, validate_chart
from .lint import LintProblem
from .physics import Check, Solution

logger = logging.getLogger(__name__)

#: How many times a solver is asked to fix a disagreement before we stop.
MAX_REPAIR_ATTEMPTS = 3


@dataclass
class Attempt:
    """One pass of the solver, kept so the whole road can be logged."""

    number: int
    verified: bool
    failures: list[str] = field(default_factory=list)


@dataclass
class Verification:
    """Everything known about how trustworthy an answer is."""

    solution: Solution | None
    attempts: list[Attempt] = field(default_factory=list)
    claim_problems: list[LintProblem] = field(default_factory=list)
    chart_problems: list[ChartProblem] = field(default_factory=list)
    #: Set when the solver could not produce anything at all.
    error: str = ''

    @property
    def checks(self) -> list[Check]:
        return self.solution.checks if self.solution else []

    @property
    def checks_passed(self) -> int:
        return sum(1 for check in self.checks if check.agrees)

    @property
    def fully_verified(self) -> bool:
        return bool(
            self.solution
            and self.solution.verified
            and not self.claim_problems
            and not self.chart_problems
        )

    @property
    def confidence(self) -> float:
        """A score from the checks that actually ran, between 0 and 1.

        Internal. A student sees a badge, never a number: a percentage invites
        them to weigh up an answer they are not in a position to judge.
        """

        if self.error or not self.solution:
            return 0.0

        total = len(self.checks)
        score = (self.checks_passed / total) if total else 0.0
        # Claims and charts are each worth a slice, because an answer with
        # right numbers and a false sentence is not a verified answer.
        if self.claim_problems:
            score *= 0.5
        if self.chart_problems:
            score *= 0.8
        # Needing repairs is itself a signal, even when the repair worked.
        if len(self.attempts) > 1:
            score *= 0.9
        return round(min(1.0, max(0.0, score)), 3)

    @property
    def badge(self) -> str:
        """The only thing the student is shown about any of this."""

        if self.fully_verified:
            return 'Verified'
        if self.solution and self.checks_passed:
            return 'Partially verified'
        return 'Not verified'

    def honest_note(self) -> str:
        """What to print beside a partially verified answer.

        Names what held and what did not, in a sentence a student can act on.
        Saying nothing, or showing it as certain, are both worse.
        """

        if self.fully_verified:
            return ''
        if self.error:
            return (
                'This question could not be solved reliably, so no answer is shown. '
                'Please ask your teacher.'
            )

        parts: list[str] = []
        total = len(self.checks)
        if total:
            parts.append(f'{self.checks_passed} of {total} checks agreed')
        failed = [check.name for check in self.checks if not check.agrees]
        if failed:
            parts.append(f'this did not: {failed[0].lower()}')
        if self.claim_problems:
            parts.append('one statement in the explanation could not be supported')
        if self.chart_problems:
            parts.append('a chart could not be confirmed against the working')

        detail = '; '.join(parts) if parts else 'the checks could not be completed'
        return (
            f'Partially verified: {detail}. '
            'Treat the working as a guide and check it with your teacher.'
        )

    def log_line(self) -> str:
        """For the server log. No student data, only the shape of what happened."""

        return (
            f'attempts={len(self.attempts)} '
            f'checks={self.checks_passed}/{len(self.checks)} '
            f'claims={len(self.claim_problems)} charts={len(self.chart_problems)} '
            f'confidence={self.confidence} badge={self.badge!r}'
        )


def verify(
    solve: Callable[[list[str]], Solution],
    *,
    answer_text: str = '',
    required_curves: list[str] | None = None,
    max_attempts: int = MAX_REPAIR_ATTEMPTS,
) -> Verification:
    """Solve, check, and retry with the discrepancy when the checks disagree.

    `solve` is called with the failures from the previous attempt, so a solver
    that can use them does, and one that cannot simply ignores the argument and
    returns the same answer. Either way the loop stops as soon as the checks
    agree, and never runs more than `max_attempts` times.
    """

    attempts: list[Attempt] = []
    solution: Solution | None = None
    failures: list[str] = []
    error = ''

    for number in range(1, max(1, max_attempts) + 1):
        try:
            solution = solve(failures)
        except Exception as exc:  # noqa: BLE001 - a solver may fail in any way
            error = str(exc)
            logger.warning('Solver failed on attempt %s: %s', number, exc)
            attempts.append(Attempt(number=number, verified=False, failures=[error]))
            break

        failures = [check.sentence() for check in solution.failures()]
        attempts.append(Attempt(number=number, verified=solution.verified, failures=list(failures)))

        if solution.verified:
            break
        logger.info('Checks disagreed on attempt %s: %s', number, failures)

    verification = Verification(solution=solution if not error else None, attempts=attempts, error=error)

    if verification.solution is not None:
        if answer_text:
            verification.claim_problems = audit_claims(answer_text, verification.solution.facts)
        if verification.solution.curves:
            verification.chart_problems = validate_chart(
                verification.solution.curves, required=required_curves
            )

    logger.info('Verification finished: %s', verification.log_line())
    return verification

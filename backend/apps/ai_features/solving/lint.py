"""The gate between a model's answer and a student's screen.

A student should never read a model changing its mind. "Wait, let's
re-evaluate", a wrong figure corrected two lines later, a note that re-derives
and re-doubts the answer: all of that is the model thinking, and thinking is
not an explanation.

Stripping `<think>` blocks was never enough, because a model that reasons in
plain prose has no tags to strip. These are checks on the finished text.

Each returns a list of problems. An empty list means the text may be shown.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from .compute import Computed


@dataclass(frozen=True)
class LintProblem:
    kind: str
    detail: str
    #: The text that triggered it, so a failure can be read without guessing.
    evidence: str = ''


#: Phrases that mean the model is working rather than explaining. Each is a
#: regex so word boundaries stop "await" matching "wait".
SCRATCH_PATTERNS = [
    (r"\bwait\b", 'thinking aloud'),
    (r"let'?s re-?evaluate", 'self-correction'),
    (r"let'?s re-?examine", 'self-correction'),
    (r"let me (re)?calculate", 'self-correction'),
    (r"\bhmm+\b", 'thinking aloud'),
    (r"no,? simpler", 'self-correction'),
    (r"i made a mistake", 'self-correction'),
    (r"\bdiscrepanc(y|ies)\b", 'unresolved disagreement'),
    (r"on second thought", 'self-correction'),
    (r"\bactually,\s", 'self-correction'),
    (r"that'?s (not )?right,? (so|let)", 'self-correction'),
    (r"this matches .{0,40} closely", 'agreement claimed without a figure'),
    (r"\bscratch that\b", 'self-correction'),
    (r"\boops\b", 'thinking aloud'),
]

#: Maths that never made it through the renderer and reached the page raw.
RAW_MATH_PATTERNS = [
    (r"\\\(", r'raw \( delimiter'),
    (r"\\\)", r'raw \) delimiter'),
    (r"\\\[", r'raw \[ delimiter'),
    (r"\\\]", r'raw \] delimiter'),
    (r"\\begin\{(?!align|equation|cases|matrix|pmatrix|bmatrix)", 'unsupported LaTeX environment'),
]

_CODE_FENCE = re.compile(r'```.*?```', re.DOTALL)
_INLINE_CODE = re.compile(r'`[^`]*`')
_DISPLAY_MATH = re.compile(r'\$\$.*?\$\$', re.DOTALL)
_INLINE_MATH = re.compile(r'\$[^$\n]+\$')


def _prose_only(text: str) -> str:
    """The text with code and maths removed.

    A scratch phrase matters in prose. The same letters inside a formula or a
    chart's JSON do not, and flagging those would make the linter useless.
    """

    without = _CODE_FENCE.sub(' ', text)
    without = _DISPLAY_MATH.sub(' ', without)
    without = _INLINE_MATH.sub(' ', without)
    return _INLINE_CODE.sub(' ', without)


def check_scratch(text: str) -> list[LintProblem]:
    """Catch the model thinking out loud."""

    prose = _prose_only(text)
    problems: list[LintProblem] = []
    for pattern, kind in SCRATCH_PATTERNS:
        match = re.search(pattern, prose, re.IGNORECASE)
        if match:
            start = max(0, match.start() - 40)
            problems.append(
                LintProblem(
                    kind='scratch',
                    detail=f'{kind}: {match.group(0)!r}',
                    evidence=prose[start:match.end() + 40].strip(),
                )
            )
    return problems


def check_raw_math(text: str) -> list[LintProblem]:
    """Catch maths that reached the page as its own source."""

    problems: list[LintProblem] = []
    for pattern, detail in RAW_MATH_PATTERNS:
        match = re.search(pattern, text)
        if match:
            problems.append(LintProblem(kind='raw-math', detail=detail, evidence=match.group(0)))

    # A lone $ with no partner leaves a stray symbol on screen.
    stripped = _CODE_FENCE.sub(' ', text)
    stripped = _DISPLAY_MATH.sub(' ', stripped)
    if stripped.count('$') % 2 == 1:
        problems.append(LintProblem(kind='raw-math', detail='unbalanced $ delimiter'))
    return problems


_NUMBER = re.compile(r'(?<![\w.])-?\d+(?:[.,]\d+)?(?:\s*[eE]\s*[-+]?\d+)?(?![\w])')


def _numbers_in(text: str) -> list[float]:
    found = []
    for raw in _NUMBER.findall(_prose_only(text)):
        try:
            found.append(float(raw.replace(',', '.').replace(' ', '')))
        except ValueError:
            continue
    return found


def check_consistency(
    text: str,
    computed: Computed,
    *,
    question_numbers: list[float] | None = None,
    tolerance: float = 0.005,
) -> list[LintProblem]:
    """Every figure in the prose must be one we computed, or one from the question.

    This is what stops a model quoting 40.03 in one line and 40.17 in the
    next: neither can appear unless it is in `computed`.

    Small integers are ignored. "step 2", "part (3)", "to 3 s.f." are counting
    words, not measurements, and treating them as claims would flag every
    well-written answer.
    """

    known = [q.value for q in computed.quantities.values()]
    known += list(question_numbers or [])
    # A rounded figure is still the same claim, so the rounded forms count too.
    for q in computed.quantities.values():
        for figures in (2, 3, 4):
            known.append(q.rounded(figures))

    problems: list[LintProblem] = []
    for number in _numbers_in(text):
        if abs(number) < 10 and float(number).is_integer():
            continue
        if any(_close(number, candidate, tolerance) for candidate in known):
            continue
        problems.append(
            LintProblem(
                kind='consistency',
                detail=f'{number:g} is not a computed value or given in the question',
                evidence=f'{number:g}',
            )
        )
    return problems


def _close(a: float, b: float, tolerance: float) -> bool:
    if not math.isfinite(a) or not math.isfinite(b):
        return False
    if b == 0:
        return abs(a) < tolerance
    return abs(a - b) <= tolerance * max(abs(a), abs(b))


def check_completeness(text: str, required_parts: list[str]) -> list[LintProblem]:
    """Every sub-part the question asks for must be answered."""

    lowered = text.lower()
    missing = [part for part in required_parts if f'({part.lower()})' not in lowered]
    return [
        LintProblem(kind='completeness', detail=f'sub-part ({part}) has no answer')
        for part in missing
    ]


def lint_answer(
    text: str,
    computed: Computed | None = None,
    *,
    required_parts: list[str] | None = None,
    question_numbers: list[float] | None = None,
) -> list[LintProblem]:
    """Every check, in one call. An empty list means the answer may be shown."""

    problems = check_scratch(text) + check_raw_math(text)
    if computed is not None:
        problems += check_consistency(text, computed, question_numbers=question_numbers)
    if required_parts:
        problems += check_completeness(text, required_parts)
    return problems

"""The checks that apply to an answer in any subject.

Most of what went wrong with the physics set had nothing to do with physics. A
student reading a History essay, a Biology answer or a Literature analysis can
be shown exactly the same faults: the model thinking out loud, contradicting
itself two paragraphs later, hedging a guess into something that reads like a
fact, or citing a study that does not exist.

Numbers can be checked by computing them again. A claim in prose cannot, so
these checks ask a different question: not "is this true?", which no linter can
answer, but "is this presented as more certain than the answer earns?" and
"does this answer contradict itself?". Both are answerable from the text alone,
and both are what a student actually gets hurt by.
"""

from __future__ import annotations

import re

from .lint import LintProblem, _prose_only

#: A guess dressed as an answer. Fine in a sentence that is openly discussing
#: uncertainty, wrong in a line that is supposed to be the answer.
HEDGE_PATTERNS = [
    (r"\bi think\b", 'opinion offered as answer'),
    (r"\bi believe\b", 'opinion offered as answer'),
    (r"\bprobably\b", 'guess offered as answer'),
    (r"\bi'?m not (entirely )?sure\b", 'uncertainty in the answer'),
    (r"\bit seems (likely|that)\b", 'guess offered as answer'),
    (r"\bsomething like\b", 'vague quantity'),
    (r"\bor so\b", 'vague quantity'),
    (r"\bmore or less\b", 'vague quantity'),
    (r"\broughly speaking\b", 'vague quantity'),
    (r"\bif i recall\b", 'recall offered as fact'),
]

#: A source that cannot be checked because it was never named.
VAGUE_SOURCE_PATTERNS = [
    (r"\baccording to (a|some|one) (study|report|research|paper|article)\b", 'unnamed source'),
    (r"\b(studies|researchers|scientists|experts) (have )?(show|shown|say|said|found|agree)\b", 'unnamed source'),
    (r"\bit is (widely )?(known|believed|accepted) that\b", 'unattributed claim'),
    (r"\bsources (say|suggest|indicate)\b", 'unnamed source'),
    (r"\bresearch (shows|suggests|indicates)\b", 'unnamed source'),
]

#: Pairs that cannot both be true of the same thing in the same answer. Each
#: entry is (subject of the claim, affirmative, negative).
CONTRADICTION_PAIRS = [
    (r"\bis symmetric(al)?\b", r"\bis not symmetric(al)?\b"),
    (r"\bis continuous\b", r"\bis not continuous\b"),
    (r"\bhas (a|an) (point of )?inflection\b", r"\b(has no|does not have) (a |an )?(point of )?inflection\b"),
    (r"\bincreases\b", r"\bdoes not increase\b"),
    (r"\bis conserved\b", r"\bis not conserved\b"),
    (r"\bis valid\b", r"\bis not valid\b"),
    (r"\bis correct\b", r"\bis incorrect\b"),
    (r"\bis possible\b", r"\bis impossible\b"),
]

#: Text a model leaves behind when it has not actually done the work.
PLACEHOLDER_PATTERNS = [
    (r"\[insert[^\]]*\]", 'unfilled placeholder'),
    (r"\byour (name|answer|school) here\b", 'unfilled placeholder'),
    (r"\bTODO\b", 'unfinished text'),
    (r"\bas (an? )?(AI|language model)\b", 'assistant talking about itself'),
    (r"\bxx+\b", 'placeholder left in'),
    (r"\.\.\.\s*\(.*(continue|and so on|etc).*\)", 'answer trails off'),
]


def check_hedging(text: str) -> list[LintProblem]:
    """A guess must not be written in the voice of an answer."""

    prose = _prose_only(text)
    problems = []
    for pattern, detail in HEDGE_PATTERNS:
        match = re.search(pattern, prose, re.IGNORECASE)
        if match:
            start = max(0, match.start() - 40)
            problems.append(
                LintProblem(
                    kind='hedging',
                    detail=f'{detail}: {match.group(0)!r}',
                    evidence=prose[start:match.end() + 40].strip(),
                )
            )
    return problems


def check_sources(text: str) -> list[LintProblem]:
    """A source a student cannot look up is not a source.

    This is the prose version of an uncomputed number: it reads like evidence
    and cannot be checked, which is the worst combination for someone revising.
    """

    prose = _prose_only(text)
    problems = []
    for pattern, detail in VAGUE_SOURCE_PATTERNS:
        match = re.search(pattern, prose, re.IGNORECASE)
        if match:
            start = max(0, match.start() - 40)
            problems.append(
                LintProblem(
                    kind='unnamed-source',
                    detail=f'{detail}: {match.group(0)!r}',
                    evidence=prose[start:match.end() + 50].strip(),
                )
            )
    return problems


def check_contradiction(text: str) -> list[LintProblem]:
    """An answer that says a thing and then unsays it.

    The physics set did this: the working proved the motion was not symmetric
    and the sketch description said it was. Checked by looking for a claim and
    its negation in the same answer.
    """

    prose = _prose_only(text)
    problems = []
    for affirmative, negative in CONTRADICTION_PAIRS:
        says_yes = re.search(affirmative, prose, re.IGNORECASE)
        says_no = re.search(negative, prose, re.IGNORECASE)
        if says_yes and says_no:
            problems.append(
                LintProblem(
                    kind='contradiction',
                    detail=f'the answer claims both {says_yes.group(0)!r} and {says_no.group(0)!r}',
                    evidence=f'...{says_yes.group(0)}... / ...{says_no.group(0)}...',
                )
            )
    return problems


def check_placeholders(text: str) -> list[LintProblem]:
    """Work the model left for somebody else to finish."""

    prose = _prose_only(text)
    problems = []
    for pattern, detail in PLACEHOLDER_PATTERNS:
        match = re.search(pattern, prose, re.IGNORECASE)
        if match:
            problems.append(
                LintProblem(kind='placeholder', detail=detail, evidence=match.group(0).strip())
            )
    return problems


def check_answers_the_question(text: str, command_words: list[str]) -> list[LintProblem]:
    """An essay question asks for a particular act, not just a topic.

    "Evaluate" wants a judgement, "compare" wants both sides, "justify" wants
    reasons. An answer that never performs the act has not answered, however
    much it knows. Checked shallowly on purpose: this looks for the shape of
    the act, and a teacher still judges the substance.
    """

    prose = _prose_only(text).lower()
    expectations = {
        'compare': ['whereas', 'while', 'both', 'in contrast', 'similarly', 'unlike', 'differ'],
        'contrast': ['whereas', 'while', 'in contrast', 'unlike', 'differ', 'however'],
        'evaluate': ['however', 'overall', 'on balance', 'therefore', 'strength', 'weakness', 'limitation'],
        'discuss': ['however', 'on the other hand', 'although', 'nevertheless'],
        'justify': ['because', 'since', 'therefore', 'this shows', 'as a result'],
        'explain': ['because', 'this means', 'so that', 'as a result', 'which causes'],
        'assess': ['however', 'overall', 'on balance', 'strength', 'limitation'],
        'suggest': ['could', 'would', 'one way', 'this would'],
    }

    problems = []
    for word in command_words:
        markers = expectations.get(word.lower().strip())
        if not markers:
            continue
        if not any(marker in prose for marker in markers):
            problems.append(
                LintProblem(
                    kind='command-word',
                    detail=f'the question says {word!r} but the answer never does it',
                )
            )
    return problems


def lint_prose(
    text: str,
    *,
    command_words: list[str] | None = None,
) -> list[LintProblem]:
    """Every subject-independent check on a written answer."""

    problems = check_hedging(text)
    problems += check_sources(text)
    problems += check_contradiction(text)
    problems += check_placeholders(text)
    if command_words:
        problems += check_answers_the_question(text, command_words)
    return problems

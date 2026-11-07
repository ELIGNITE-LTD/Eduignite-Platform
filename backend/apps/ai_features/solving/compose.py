"""The shape of a good answer, and the removal of what should never be in one.

Two jobs, both about the finished text.

The first is the shape. An examiner's model answer has a form: the idea, the
setup, the working, a check, the answer, and the mistake to avoid. A student
revising from an answer with that shape learns the method; one revising from a
wall of algebra learns only that they cannot do it. The template below is given
to the model as instructions rather than assembled here, because the words are
the model's job and the structure is ours.

The second is the removal. A model that reasons in prose leaves its reasoning
in the prose: "Wait, let's re-evaluate", a figure it then corrects, a note
re-deriving an answer it has already given. Stripping `<think>` tags never
caught any of that, because there were no tags.

It removes rather than regenerates on purpose. Those sentences are noise around
an answer that is usually right, so deleting them costs nothing and needs no
second call to a model. Anything deletion cannot fix is reported instead, for
the caller to decide about.
"""

from __future__ import annotations

import logging
import re

from .lint import SCRATCH_PATTERNS, LintProblem, _prose_only
from .prose import PLACEHOLDER_PATTERNS

logger = logging.getLogger(__name__)

#: The structure every solved sub-question is asked to follow. Given to the
#: model: the headings are its words, the order is ours.
ANSWER_STRUCTURE = (
    'Write each sub-part in this order, as short labelled lines, not as a wall '
    'of algebra:\n'
    '  Idea - one or two sentences on the method and why it fits this question.\n'
    '  Setup - the coordinate system, sign convention and resolved quantities, '
    'and what a diagram would show.\n'
    '  Working - numbered steps. One idea per step: the formula, the '
    'substitution with units, the result.\n'
    '  Check - one line naming a second method or a substitution back into the '
    'original equation, and the figure it gives. Only write this line if you '
    'actually did that check; never write it to fill the space.\n'
    '  Answer - the final value with its unit, rounded as the paper asks, in bold.\n'
    '  Watch out - one line on the mistake a student usually makes here, when '
    'there is one worth naming.\n'
    'Explain why each step is taken, not only what is done.'
)

#: Where one sentence ends and the next begins.
#:
#: Splitting on every full stop cut 6.33 into "6." and "33", so removing the
#: sentence around it left fragments like "T = 2.60 s.33 m." on screen. A
#: sentence ends at a stop followed by whitespace and a capital; inside a
#: decimal the stop is followed by a digit, so it is not a boundary.
_BOUNDARY = re.compile(r'(?<=[.!?])(?=\s+["\'(\[]?[A-Z])')

_CODE_FENCE = re.compile(r'```.*?```', re.DOTALL)

#: Stands in for a fenced block while the prose around it is edited. Plain
#: text containing no escape sequence, so nothing in any toolchain can turn it
#: into a control character.
_FENCE_PREFIX = '@@EDUIGNITE_FENCE_'


def _fence_mark(index: int) -> str:
    return f'{_FENCE_PREFIX}{index}@@'


def _is_scratch(sentence: str) -> bool:
    prose = _prose_only(sentence)
    return any(re.search(pattern, prose, re.IGNORECASE) for pattern, _ in SCRATCH_PATTERNS)


def _is_placeholder(sentence: str) -> bool:
    prose = _prose_only(sentence)
    return any(re.search(pattern, prose, re.IGNORECASE) for pattern, _ in PLACEHOLDER_PATTERNS)


def remove_scratch(text: str) -> tuple[str, list[str]]:
    """Delete the sentences where the model is thinking rather than explaining.

    Works a sentence at a time, so a single "Wait, let me redo that." disappears
    and the paragraph around it survives. Fenced blocks are set aside whole: a
    sentence inside a chart description or a code sample is not prose, and
    editing part of one would break the block.

    Returns the cleaned text and what was removed, so a removal can be logged
    and, if it ever takes too much, seen.
    """

    if not text:
        return text, []

    removed: list[str] = []
    fences: list[str] = []

    def stash(match: re.Match) -> str:
        fences.append(match.group(0))
        return _fence_mark(len(fences) - 1)

    guarded = _CODE_FENCE.sub(stash, text)

    kept_lines: list[str] = []
    for line in guarded.split('\n'):
        if _FENCE_PREFIX in line or not line.strip():
            kept_lines.append(line)
            continue

        survivors = []
        for sentence in _BOUNDARY.split(line):
            if _is_scratch(sentence) or _is_placeholder(sentence):
                stripped = sentence.strip()
                if stripped:
                    removed.append(stripped)
                continue
            survivors.append(sentence)
        kept_lines.append(''.join(survivors).rstrip())

    cleaned = '\n'.join(kept_lines)

    # Tidy what the deletions left behind: doubled spaces, and blank lines
    # where a paragraph was nothing but the model talking to itself.
    cleaned = re.sub(r'[ \t]{2,}', ' ', cleaned)
    cleaned = re.sub(r'\n[ \t]+\n', '\n\n', cleaned)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)

    for index, fence in enumerate(fences):
        cleaned = cleaned.replace(_fence_mark(index), fence)

    return cleaned.strip(), removed


def polish(text: str) -> tuple[str, list[LintProblem]]:
    """Clean an answer, and report what cleaning could not fix.

    Nothing here fails an answer. Losing a correct explanation because one
    sentence is clumsy would help nobody; the caller decides what the remaining
    problems are worth.
    """

    from .lint import check_raw_math
    from .prose import check_contradiction

    cleaned, removed = remove_scratch(text)

    problems: list[LintProblem] = []
    problems += check_raw_math(cleaned)
    problems += check_contradiction(cleaned)

    if removed:
        logger.info('Removed %s scratch sentence(s) from an answer.', len(removed))

    return cleaned, problems

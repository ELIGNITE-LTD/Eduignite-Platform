"""One gate, every subject.

The physics failures were the ones reported, but nothing about them was
particular to physics. An answer in History can leak the model's thinking just
as easily, a Biology answer can contradict itself, a Literature essay can cite
a study that does not exist, and any subject can quietly skip sub-part (c).

So the gate runs on every answer, whatever the subject. What changes between
subjects is only how much *extra* can be checked:

  * Subjects with arithmetic in them - physics, chemistry, quantitative
    biology, maths, economics, geography with data - can also have their
    numbers computed and cross-checked, and their charts validated against
    those numbers.
  * Subjects without - English, History, Literature, Religious Studies,
    Citizenship - get the universal checks and the command-word check, which
    is the closest thing an essay has to a wrong answer.

A subject is matched by name because subjects are free text per school
(`grades.Subject.name`), so "Physics", "Phy", "Physique" and "Physics (A
Level)" all have to find the same module.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .compute import Computed
from .lint import LintProblem, lint_answer
from .prose import lint_prose


@dataclass(frozen=True)
class SubjectModule:
    """What a subject adds on top of the universal gate."""

    key: str
    #: Words in a subject's name that select this module.
    aliases: tuple[str, ...]
    #: Whether answers in this subject are expected to contain computed values.
    quantitative: bool
    #: Rules the composer must follow for this subject, added to the prompt.
    guidance: tuple[str, ...] = ()


PHYSICS = SubjectModule(
    key='physics',
    aliases=('physics', 'physique', 'phy'),
    quantitative=True,
    guidance=(
        'State the coordinate system and the sign convention before resolving anything.',
        'On an incline, resolve gravity both along and perpendicular to the slope, '
        'and never assume the motion along the slope is symmetric.',
        'Carry units through every step and apply the significant figures only at the end.',
    ),
)

CHEMISTRY = SubjectModule(
    key='chemistry',
    aliases=('chemistry', 'chimie', 'chem'),
    quantitative=True,
    guidance=(
        'Balance every equation before using it in a calculation.',
        'Show moles explicitly: n = m/M or n = cV, then the mole ratio from the equation.',
        'State the limiting reagent when two amounts are given.',
    ),
)

BIOLOGY = SubjectModule(
    key='biology',
    aliases=('biology', 'biologie', 'bio'),
    quantitative=True,
    guidance=(
        'Give magnification as image size over actual size, with both in the same unit.',
        'For genetics, show the gametes and the grid before stating a ratio.',
        'Name the structures in a diagram rather than describing them vaguely.',
    ),
)

MATHS = SubjectModule(
    key='mathematics',
    aliases=('math', 'maths', 'mathematics', 'mathematiques', 'further maths', 'add maths'),
    quantitative=True,
    guidance=(
        'Substitute the answer back into the original equation and show that it holds.',
        'State the domain and any excluded values.',
    ),
)

ECONOMICS = SubjectModule(
    key='economics',
    aliases=('economics', 'economie', 'commerce', 'accounting', 'accounts'),
    quantitative=True,
    guidance=(
        'Label both axes of any diagram, including the units.',
        'Show the formula before the figures when calculating.',
    ),
)

GEOGRAPHY = SubjectModule(
    key='geography',
    aliases=('geography', 'geographie'),
    quantitative=True,
    guidance=('Name real places and real figures, or say plainly that an example is illustrative.',),
)

#: Essay subjects. Nothing to compute, so the universal gate is the whole gate,
#: with the command-word check doing the work the numbers would otherwise do.
ESSAY_SUBJECTS = tuple(
    SubjectModule(key=key, aliases=aliases, quantitative=False, guidance=guidance)
    for key, aliases, guidance in [
        ('english', ('english', 'anglais', 'language', 'grammar'),
         ('Quote the text directly when making a point about it.',)),
        ('literature', ('literature', 'litterature'),
         ('Quote the text and give the act, scene or chapter.',
          'Never invent a quotation; if the wording is uncertain, describe the moment instead.')),
        ('french', ('french', 'francais'), ()),
        ('history', ('history', 'histoire'),
         ('Give dates and named people, and say when a date is approximate.',
          'Never invent a source, a treaty or a statistic.')),
        ('citizenship', ('citizenship', 'civics', 'ecm'), ()),
        ('religious-studies', ('religious', 'religion', 'rel'),
         ('Attribute a teaching to the text or tradition it comes from.',)),
        ('computer-science', ('computer', 'ict', 'informatique', 'computing'),
         ('Show the code and say what it outputs, rather than describing it.',)),
    ]
)

ALL_SUBJECTS: tuple[SubjectModule, ...] = (
    PHYSICS, CHEMISTRY, BIOLOGY, MATHS, ECONOMICS, GEOGRAPHY, *ESSAY_SUBJECTS
)

#: Used when the subject is unknown, which must still be a working answer and
#: not an excuse to skip the gate. Not quantitative, because inventing a
#: consistency check against numbers we never computed would reject good work.
GENERAL = SubjectModule(key='general', aliases=(), quantitative=False)

#: The command words a question can use, in the two languages the platform
#: serves. Found in the question, checked against the answer.
COMMAND_WORDS = (
    'compare', 'contrast', 'evaluate', 'discuss', 'justify', 'explain',
    'assess', 'suggest', 'describe', 'calculate', 'determine', 'prove',
    'comparez', 'expliquez', 'justifiez', 'discutez', 'calculez',
)


#: Names that contain a subject word but are not that subject. Without these,
#: 'Home Economics' routes to Economics and is told to label its axes.
FALSE_FRIENDS = (
    'home economics',
    'food and nutrition',
    'physical education',
    'health education',
)


def subject_for(name: str | None) -> SubjectModule:
    """Match a school's free-text subject name to a module.

    The longest matching alias wins, because subject names nest: a paper
    called 'Literature in English' is Literature, and matching whichever alias
    happened to be checked first made it English.
    """

    text = (name or '').strip().lower()
    if not text:
        return GENERAL
    if any(phrase in text for phrase in FALSE_FRIENDS):
        return GENERAL

    best = None
    for module in ALL_SUBJECTS:
        for alias in module.aliases:
            if re.search(rf'\b{re.escape(alias)}', text):
                if best is None or len(alias) > best[0]:
                    best = (len(alias), module)
    return best[1] if best else GENERAL


def command_words_in(question: str) -> list[str]:
    """The acts a question asks the student to perform."""

    lowered = (question or '').lower()
    return [word for word in COMMAND_WORDS if re.search(rf'\b{word}\b', lowered)]


def sub_parts_in(question: str) -> list[str]:
    """The sub-parts a question asks for: (a), (b), (c)...

    Read from the question so the completeness check cannot be satisfied by an
    answer that simply invents fewer parts than were asked.
    """

    found = re.findall(r'\(([a-z])\)\s', question or '', re.IGNORECASE)
    ordered: list[str] = []
    for part in found:
        lowered = part.lower()
        if lowered not in ordered:
            ordered.append(lowered)
    return ordered


@dataclass
class AnswerReview:
    """Everything the gate found, and whether the answer may be shown."""

    subject: SubjectModule
    problems: list[LintProblem] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.problems

    def summary(self) -> str:
        if self.passed:
            return 'passed every check'
        counts: dict[str, int] = {}
        for problem in self.problems:
            counts[problem.kind] = counts.get(problem.kind, 0) + 1
        return ', '.join(f'{kind}: {count}' for kind, count in sorted(counts.items()))


def review_answer(
    answer: str,
    *,
    question: str = '',
    subject_name: str | None = None,
    computed: Computed | None = None,
    question_numbers: list[float] | None = None,
) -> AnswerReview:
    """Run every check that applies to this answer.

    The universal checks always run. The numeric consistency check runs only
    when the subject is quantitative *and* a computed set exists, because
    demanding that every figure in a History essay match a computed value
    would reject every correct date on the page.
    """

    module = subject_for(subject_name)
    required_parts = sub_parts_in(question)

    problems = lint_answer(
        answer,
        computed if (module.quantitative and computed is not None) else None,
        required_parts=required_parts,
        question_numbers=question_numbers,
    )
    problems += lint_prose(answer, command_words=command_words_in(question))

    return AnswerReview(subject=module, problems=problems)

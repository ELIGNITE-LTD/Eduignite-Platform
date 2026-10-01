"""Whole papers: every question read, every question solved, one answer.

A student who sends a full problem set or a GCE Paper 2 wants all of it
solved, with every graph and diagram drawn, not the first question and a cut
off second. One model call cannot do that: the answer runs to tens of
thousands of tokens and the provider caps each response. So a paper is done
in three steps:

  1. **Read.** The paper is written out as a list of questions: from the
     photos by the vision model, or from pasted text by the text model.
  2. **Solve.** Each question goes to the strongest text model on its own,
     with the whole token budget for itself. Questions run side by side,
     spread over every Groq key the server has, and an answer cut off by the
     token limit is continued where it stopped.
  3. **Assemble.** The solutions are joined in order under the paper's title,
     as one markdown answer. The apps draw it; the bots send it as one PDF.

Every call is made inside the caller's credit meter, so the paper is charged
for exactly what it used, like any other question.
"""

from __future__ import annotations

import contextvars
import hashlib
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

#: What a read paper is kept for, so a "Continue?" does not read it twice.
READ_CACHE_SECONDS = 15 * 60

READ_PROMPT = (
    'Transcribe the exam paper or problem set in these images exactly, so that '
    'it can be solved without the images. Return JSON only, in this shape: '
    '{"title": "the paper\'s title, or a short description", "instructions": '
    '"rules for the whole paper (constants such as g, significant figures, '
    'what to show); empty if none", "questions": [{"number": "1", "title": '
    '"short topic, if the paper gives one", "text": "the full question with '
    'every sub-part (a), (b), (i)..., every number, unit, symbol and answer '
    'option exactly as printed", "figure": "a precise description in words of '
    'any diagram, graph, circuit or table that belongs to the question, with '
    'all its values and labels; empty if none"}]}. Keep the questions in the '
    'order printed and include every one of them. If the images hold one '
    'question only, return a list of one. If something cannot be read, write '
    '[unreadable] in its place rather than guessing.'
)

SPLIT_PROMPT = (
    'The student pasted the text below. If it contains several separate '
    'questions to answer (an exam paper, a problem set, an exercise list), '
    'return JSON only: {"title": "...", "instructions": "rules for the whole '
    'paper, empty if none", "questions": [{"number": "1", "title": "short topic '
    'or empty", "text": "the full question with all its sub-parts, exactly as '
    'written", "figure": ""}]}, keeping every question in order. If it is one '
    'question, or a request that is not a set of questions, return {"questions": '
    '[]}.\n\nTEXT:\n'
)

SOLVE_PROMPT = (
    'EXAM MODE. You are writing the model answer to one question of the paper '
    'below, for a student preparing for the examination. The SHORT FIRST rule '
    'does not apply: solve this question completely, now, without asking '
    'anything.\n'
    '- Answer every sub-part, in order, each under its own "### " heading '
    '(for example "### (a) Time of flight"). Do not write a heading for the '
    'question itself and do not copy the question out; it is shown above your '
    'answer.\n'
    '- Show all the working an examiner expects: the principle or formula, the '
    'substitution with units, each step, and the result to the precision the '
    'paper asks for, with units. Check results where a check is quick.\n'
    '- Whenever the question says plot, sketch, draw, graph, label or show on a '
    'diagram, you MUST draw it with a "graph" block (curves, axes, marked '
    'points) or a "figure" block (apparatus, circuits, forces, labelled '
    'diagrams). Never tell the student to draw it themselves. Mark every point '
    'the question asks for, label the axes with quantities and units, and use '
    '"domain" for each piece of a piecewise graph.\n'
    '- End with a line "**Answers:** ..." listing the final results of every '
    'sub-part.\n'
)


@dataclass
class Question:
    number: str
    text: str
    title: str = ''
    figure: str = ''

    @property
    def heading(self) -> str:
        number = self.number.strip()
        if number and not re.match(r'(?i)^(question|q|exercise|problem|exercice)\b', number):
            number = f'Question {number}'
        label = number or 'Question'
        return f'{label} - {self.title.strip()}' if self.title.strip() else label


@dataclass
class Paper:
    title: str
    instructions: str
    questions: list[Question]
    #: The provider call that read it, when it was read just now (not cached),
    #: so the caller's meter can count it.
    reading_call: dict | None = None
    solved: int = 0
    failed: list[str] = field(default_factory=list)


def _setting(name, default):
    return getattr(settings, name, default)


def max_questions() -> int:
    return int(_setting('AI_PAPER_MAX_QUESTIONS', 15))


# ---------------------------------------------------------------------------
# 1. Read
# ---------------------------------------------------------------------------

#: "Question 2", "Q3", "Exercise 4", "2.", "2)", "(b)" at the start of a line.
_QUESTION_MARK = re.compile(
    r'(?im)^\s*(?:question|q\.?|exercise|exercice|problem|probl[eè]me)\s*\d+|^\s*\d{1,2}\s*[.)]\s+\S'
)


def looks_like_paper(message: str) -> bool:
    """Whether pasted text may be several questions rather than one."""
    text = message or ''
    return len(text) >= 300 and len(_QUESTION_MARK.findall(text)) >= 2


def _cache_key(kind: str, parts) -> str:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(part.encode('utf-8', 'ignore') if isinstance(part, str) else part)
        digest.update(b'\0')
    return f'ai:paper:{kind}:{digest.hexdigest()}'


def _parse(raw: str | None) -> Paper | None:
    if not raw:
        return None
    text = raw.strip()
    fenced = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    elif not text.startswith('{'):
        start, end = text.find('{'), text.rfind('}')
        if start < 0 or end <= start:
            return None
        text = text[start:end + 1]
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    questions = []
    for index, entry in enumerate(data.get('questions') or [], start=1):
        if not isinstance(entry, dict):
            continue
        body = str(entry.get('text') or '').strip()
        if not body:
            continue
        questions.append(Question(
            number=str(entry.get('number') or index).strip(),
            title=str(entry.get('title') or '').strip(),
            text=body,
            figure=str(entry.get('figure') or '').strip(),
        ))
    return Paper(
        title=str(data.get('title') or '').strip(),
        instructions=str(data.get('instructions') or '').strip(),
        questions=questions[:max_questions()],
    )


def read_paper(message: str, images=None) -> Paper | None:
    """The questions in these photos or this pasted text, or None if unreadable.

    Read once and kept for a while: the same photos sent again (after a
    "Continue?", say) are not read and paid for a second time.
    """
    from .utils import call_groq_api

    images = list(images or [])
    if images:
        key = _cache_key('photos', [message or '', *images])
    elif looks_like_paper(message):
        key = _cache_key('text', [message])
    else:
        return None

    cached = cache.get(key)
    if cached is not None:
        return _parse(cached)

    if images:
        prompt = READ_PROMPT + (f'\n\nThe student also wrote: {message}' if message else '')
        result = call_groq_api(
            prompt, purpose='paper_reading', images=images, image_prompt='',
            response_format={'type': 'json_object'}, max_tokens=int(_setting('AI_PAPER_READ_MAX_TOKENS', 6000)),
        )
    else:
        result = call_groq_api(
            SPLIT_PROMPT + message, purpose='paper_reading',
            response_format={'type': 'json_object'}, max_tokens=int(_setting('AI_PAPER_READ_MAX_TOKENS', 6000)),
        )
    if not result.get('success'):
        logger.warning('Could not read the paper: %s', result.get('error'))
        return None
    paper = _parse(result.get('response'))
    if paper is None:
        logger.warning('The paper reader did not return usable JSON.')
        return None
    cache.set(key, result.get('response'), READ_CACHE_SECONDS)
    paper.reading_call = result
    return paper


# ---------------------------------------------------------------------------
# 2. Solve
# ---------------------------------------------------------------------------

def solver_keys() -> list[str]:
    """Every distinct Groq key the server has. Each has its own rate limit."""
    names = ('GROQ_API_KEY', 'GROQ_FAST_API_KEY', 'GROQ_EXAM_API_KEY', 'GROQ_CAREER_API_KEY')
    keys = []
    for name in names:
        value = _setting(name, '')
        if value and value not in keys:
            keys.append(value)
    return keys


def _question_prompt(paper: Paper, question: Question) -> str:
    lines = [SOLVE_PROMPT, '']
    if paper.title:
        lines.append(f'PAPER: {paper.title}')
    if paper.instructions:
        lines.append(f'RULES FOR THE WHOLE PAPER: {paper.instructions}')
    lines += ['', f'{question.heading}:', question.text]
    if question.figure:
        lines += ['', f'The figure printed with the question: {question.figure}']
    return '\n'.join(lines)


def solve_question(paper: Paper, question: Question, *, api_key: str | None = None) -> str | None:
    """One question's full model answer, continued if it was cut off."""
    from .utils import call_groq_api

    prompt = _question_prompt(paper, question)
    options = {
        'max_tokens': int(_setting('AI_PAPER_MAX_TOKENS', 8000)),
        'api_key': api_key,
        'reasoning_effort': _setting('GROQ_PAPER_REASONING_EFFORT', 'medium'),
        'timeout': int(_setting('AI_PAPER_TIMEOUT_SECONDS', 150)),
        # A busy key answers "too many requests" with how long to wait; the
        # client waits and tries again rather than losing the question.
        'max_retries': int(_setting('AI_PAPER_MAX_RETRIES', 6)),
    }
    answer = ''
    previous = None
    for _attempt in range(1 + int(_setting('AI_PAPER_CONTINUATIONS', 2))):
        result = call_groq_api(prompt, continue_from=answer or None, **options)
        if not result.get('success'):
            break
        if previous is not None:
            previous['continued'] = True  # carried on here; not a partial answer
        answer += result.get('response') or ''
        if (result.get('finish_reason') or '') != 'length':
            break
        previous = result
    return answer.strip() or None


def solve_paper(paper: Paper, *, on_progress=None) -> str:
    """Solve every question, side by side, and return them as one answer."""
    questions = paper.questions
    keys = solver_keys() or [None]
    workers = max(1, min(len(questions), int(_setting('AI_PAPER_CONCURRENCY', 3))))
    answers: list[str | None] = [None] * len(questions)
    done = 0

    def work(index):
        # Each question takes the next key in turn, so the work is spread
        # over every key's rate limit.
        return solve_question(paper, questions[index], api_key=keys[index % len(keys)])

    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix='paper') as pool:
        # Each worker runs in a copy of this context, so every call it makes
        # is counted by the caller's credit meter.
        futures = {pool.submit(contextvars.copy_context().run, work, index): index for index in range(len(questions))}
        for future in futures:
            index = futures[future]
            try:
                answers[index] = future.result()
            except Exception:  # noqa: BLE001 - one question must not sink the paper
                logger.exception('Solving %s failed', questions[index].heading)
            done += 1
            if on_progress:
                try:
                    on_progress(done, len(questions))
                except Exception:  # noqa: BLE001 - progress is a courtesy
                    logger.debug('Progress callback failed', exc_info=True)

    paper.solved = sum(1 for answer in answers if answer)
    paper.failed = [question.heading for question, answer in zip(questions, answers) if not answer]
    return assemble(paper, answers)


# ---------------------------------------------------------------------------
# 3. Assemble
# ---------------------------------------------------------------------------

def _quote(text: str) -> str:
    return '\n'.join(f'> {line}' if line.strip() else '>' for line in text.strip().splitlines())


def assemble(paper: Paper, answers) -> str:
    parts = []
    if paper.title:
        parts.append(f'# {paper.title}')
    if paper.instructions:
        parts.append(f'*{paper.instructions}*')
    for question, answer in zip(paper.questions, answers):
        parts.append('---')
        parts.append(f'## {question.heading}')
        parts.append(_quote(question.text))
        if question.figure:
            parts.append(f'*Figure: {question.figure}*')
        parts.append(answer or (
            '> **Note:** This question could not be solved just now. '
            'Send it again on its own and it will be answered.'
        ))
    return '\n\n'.join(parts).strip()

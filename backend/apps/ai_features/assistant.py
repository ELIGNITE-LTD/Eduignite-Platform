"""The EduIgnite AI assistant, as a service any channel can call.

The apps reach it through `POST /ai/chat/`; the chat bots call it directly.
Either way a question goes through exactly the same steps, so an answer, its
price and its refund are the same wherever it was asked:

  1. the conversation so far and, for a student asking about their marks,
     their real grades are put in front of the question;
  2. the cost is estimated, and refused up front if it cannot be paid (or,
     for heavy work, confirmed first);
  3. the estimate is held, the model answers, and the hold is settled
     against what the answer actually used - or returned if it failed.

Photos, or a long paste, that hold several questions (a problem set, a whole
GCE paper) are solved as a paper: every question in full, side by side, in
one answer (see `paper.py`). The price is estimated per question.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from django.conf import settings

from . import credit_engine
from . import credit_pricing as pricing
from . import paper as papers
from .models import AIRequest

#: Said to the model when a question arrives as photos with no words.
PHOTO_ONLY_QUESTION = 'Please read the question in the image and answer it.'
GRADE_KEYWORDS = {'grade', 'grades', 'mark', 'marks', 'score', 'scores', 'subject', 'subjects', 'notes', 'moyenne'}


class AssistantUnavailable(Exception):
    """The model could not answer. Nothing was charged."""

    def __init__(self, error: str, balance: dict):
        super().__init__(error)
        self.error = error
        self.balance = balance


@dataclass
class AssistantAnswer:
    reply: str
    credits_used: int
    balance: dict
    tokens_used: int
    processing_time_ms: int
    ai_request: AIRequest
    #: For a paper: its title and how many questions it held, else 0.
    paper_title: str = ''
    questions: int = 0
    unsolved: list = field(default_factory=list)


def _history_text(history) -> str:
    lines = []
    for entry in (history or [])[-10:]:
        if not isinstance(entry, dict):
            continue
        role = entry.get('role', 'user')
        content = entry.get('content', '')
        if role in ('user', 'assistant') and content:
            lines.append(f"{'User' if role == 'user' else 'Assistant'}: {content}")
    return '\n'.join(lines)


def _student_context(user, message: str) -> str:
    """A student's real recent marks, when the question is about them."""
    if (getattr(user, 'role', '') or '').upper() != 'STUDENT':
        return ''
    if not any(keyword in message.lower() for keyword in GRADE_KEYWORDS):
        return ''
    from apps.grades.models import Grade
    from apps.students import api as students_api

    student = students_api.get_student_for_user(user)
    if not student:
        return ''
    recent = Grade.objects.select_related('subject', 'sequence').filter(student=student).order_by('-created_at')[:12]
    grades = [
        {
            'subject': grade.subject.name if grade.subject else 'Unknown Subject',
            'score': str(grade.score),
            'sequence': grade.sequence.name if grade.sequence else '',
        }
        for grade in recent
    ]
    class_name = (
        getattr(getattr(student, 'school_class', None), 'name', None)
        or getattr(student, 'student_class', None)
        or 'N/A'
    )
    return (
        'Use this verified EduIgnite student context when answering. '
        'Do not invent grades or subjects that are not listed.\n'
        f'Student: {student.display_name}\n'
        f'Class: {class_name}\n'
        f'Recent grades: {grades}\n\n'
    )


def _read_paper(message: str, images) -> papers.Paper | None:
    """The paper in these photos or this paste, if it holds several questions."""
    if not getattr(settings, 'AI_PAPER_MODE', True):
        return None
    if not images and not papers.looks_like_paper(message):
        return None
    try:
        paper = papers.read_paper(message, images)
    except Exception:  # noqa: BLE001 - fall back to answering it as one question
        import logging

        logging.getLogger(__name__).exception('Reading the paper failed')
        return None
    if paper is None or len(paper.questions) < 2:
        return None
    return paper


def _paper_estimate(feature: str, paper: papers.Paper, images: int) -> pricing.Estimate:
    from .utils import build_system_prompt, model_for_purpose

    count = len(paper.questions)
    system = pricing.tokens_for_text(build_system_prompt('', None))
    sent = sum(pricing.tokens_for_text(papers._question_prompt(paper, question)) for question in paper.questions)
    per_question = int(getattr(settings, 'AI_PAPER_TOKENS_PER_QUESTION', 3500))
    return credit_engine.estimate_request(
        feature,
        purpose='',
        input_tokens=sent + system * (count - 1),
        expected_output_tokens=per_question * count,
        images=images,
        model=model_for_purpose(''),
    )


def answer(user, message: str, *, history=None, images=None, request=None, channel: str = 'app',
           can_confirm=None, confirmed=None, on_paper=None, on_progress=None) -> AssistantAnswer:
    """Answer one question, or every question of a paper, charging the person's AI credits.

    Raises `credit_engine.InsufficientCredits` or
    `credit_engine.CreditConfirmationRequired` before anything is sent, and
    `AssistantUnavailable` if the model fails (nothing is charged then).

    `on_paper(paper)` is called once a paper has been read and accepted, and
    `on_progress(done, total)` as its questions are solved, so a chat can say
    what is happening during a long answer.
    """
    from .utils import call_groq_api

    images = list(images or [])
    typed = (message or '').strip()
    message = typed or (PHOTO_ONLY_QUESTION if images else '')
    feature = 'image_question' if images else 'chat'

    paper = _read_paper(typed, images)
    if paper is not None:
        return _answer_paper(user, paper, message, images=images, feature=feature, request=request,
                             channel=channel, can_confirm=can_confirm, confirmed=confirmed,
                             on_paper=on_paper, on_progress=on_progress)

    earlier = _history_text(history)
    prompt = f'Previous conversation:\n{earlier}\n\nUser: {message}' if earlier else message
    prompt = _student_context(user, message) + prompt

    max_tokens = getattr(settings, 'AI_CHAT_MAX_TOKENS', 2400)
    estimate = credit_engine.estimate_request(
        feature,
        purpose='',
        input_text=prompt,
        question=message,
        images=len(images),
        max_output_tokens=max_tokens,
    )
    credit_engine.require_affordable(user, estimate, request=request, can_confirm=can_confirm, confirmed=confirmed)

    ai_request = AIRequest.objects.create(
        user=user,
        school=getattr(user, 'school', None) if getattr(user, 'school_id', None) else None,
        request_type='general',
        # The photos themselves are not kept; the record says they were sent.
        prompt=prompt + (f'\n\n[{len(images)} image(s) attached]' if images else ''),
        status='processing',
    )
    hold = credit_engine.hold_for_request(ai_request, estimate)

    with credit_engine.metered(
        ai_request, feature=feature, hold=hold, images=len(images),
        estimated_credits=estimate.credits, channel=channel,
    ) as meter:
        result = call_groq_api(prompt, max_tokens=max_tokens, images=images or None)
        if result['success']:
            ai_request.mark_completed(
                response=result['response'],
                tokens_used=result['tokens_used'],
                processing_time_ms=result['processing_time_ms'],
            )
            meter.complete()
        else:
            ai_request.mark_failed(result.get('error', 'AI request failed'))
            meter.fail()

    current = credit_engine.balance(user)
    if not result['success']:
        raise AssistantUnavailable(result.get('error', 'AI request failed'), current)

    usage = ai_request.usage_records.order_by('-created_at').first()
    return AssistantAnswer(
        reply=result['response'],
        credits_used=usage.charged_credits if usage else 0,
        balance=current,
        tokens_used=result['tokens_used'],
        processing_time_ms=result['processing_time_ms'],
        ai_request=ai_request,
    )


def _answer_paper(user, paper, message, *, images, feature, request, channel, can_confirm, confirmed,
                  on_paper, on_progress) -> AssistantAnswer:
    """Every question of a paper, solved in full, as one answer."""
    estimate = _paper_estimate(feature, paper, len(images))
    credit_engine.require_affordable(user, estimate, request=request, can_confirm=can_confirm, confirmed=confirmed)

    ai_request = AIRequest.objects.create(
        user=user,
        school=getattr(user, 'school', None) if getattr(user, 'school_id', None) else None,
        request_type='general',
        prompt=(
            f'[Paper: {paper.title or "untitled"} - {len(paper.questions)} questions'
            + (f', {len(images)} image(s) attached' if images else '') + ']\n\n'
            + '\n\n'.join(f'{question.heading}: {question.text}' for question in paper.questions)
        ),
        status='processing',
    )
    hold = credit_engine.hold_for_request(ai_request, estimate)
    if on_paper:
        on_paper(paper)

    with credit_engine.metered(
        ai_request, feature=feature, hold=hold, images=len(images),
        estimated_credits=estimate.credits, channel=channel,
    ) as meter:
        if paper.reading_call:
            meter.add(paper.reading_call)
        reply = papers.solve_paper(paper, on_progress=on_progress)
        tokens = sum(int(call.get('tokens_used') or 0) for call in meter.successful_calls)
        elapsed = sum(int(call.get('processing_time_ms') or 0) for call in meter.calls)
        if paper.solved:
            ai_request.mark_completed(response=reply, tokens_used=tokens, processing_time_ms=elapsed)
            meter.complete()
        else:
            ai_request.mark_failed('No question of the paper could be solved.')
            meter.fail()

    current = credit_engine.balance(user)
    if not paper.solved:
        raise AssistantUnavailable('No question of the paper could be solved.', current)

    usage = ai_request.usage_records.order_by('-created_at').first()
    return AssistantAnswer(
        reply=reply,
        credits_used=usage.charged_credits if usage else 0,
        balance=current,
        tokens_used=tokens,
        processing_time_ms=elapsed,
        ai_request=ai_request,
        paper_title=paper.title,
        questions=len(paper.questions),
        unsolved=list(paper.failed),
    )

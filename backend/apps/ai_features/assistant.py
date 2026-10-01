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
"""

from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

from . import credit_engine
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
        f'Student: {student.user.get_full_name()}\n'
        f'Class: {class_name}\n'
        f'Recent grades: {grades}\n\n'
    )


def answer(user, message: str, *, history=None, images=None, request=None, channel: str = 'app',
           can_confirm=None, confirmed=None) -> AssistantAnswer:
    """Answer one question, charging the person's AI credits for it.

    Raises `credit_engine.InsufficientCredits` or
    `credit_engine.CreditConfirmationRequired` before anything is sent, and
    `AssistantUnavailable` if the model fails (nothing is charged then).
    """
    from .utils import call_groq_api

    images = list(images or [])
    message = (message or '').strip() or (PHOTO_ONLY_QUESTION if images else '')
    feature = 'image_question' if images else 'chat'

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

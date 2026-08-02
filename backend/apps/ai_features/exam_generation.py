"""
AI exam question generation service.

The service writes generated questions to AIExamDraft only. A teacher or school
admin must review the draft before the publish endpoint can create a real exam.
"""
import hashlib
import json
import logging

from django.db import transaction
from django.db.models import F

from .models import AIExamQuestion, AIRequest, QuestionBank
from .service_utils import extract_json_payload
from .utils import call_groq_api
from .validators import validate_exam_questions

logger = logging.getLogger(__name__)


def build_mcq_prompt(subject, class_level, topics, difficulty, num_questions, subsystem='anglophone'):
    topic_str = f'focusing on these topics: {topics}' if topics else 'covering the general curriculum'
    lang_note = 'in French (Francais)' if subsystem == 'francophone' else 'in English'

    return f"""You are an expert {subject} examiner for {class_level} students in Cameroon's secondary education system.

Generate exactly {num_questions} multiple choice questions {topic_str}.
Difficulty level: {difficulty}.
Language: {lang_note}.

STRICT RULES:
- Each question must have exactly 4 options (A, B, C, D)
- Only one option must be correct
- Questions must be appropriate for {class_level} level
- No duplicate questions
- No trick questions
- All options must be plausible
- Provide a brief explanation for the correct answer

Return ONLY valid JSON in this exact format:
{{
  "questions": [
    {{
      "order": 1,
      "text": "Question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option": 0,
      "explanation": "Brief explanation why Option A is correct",
      "marks": 1
    }}
  ]
}}"""


def build_structural_prompt(subject, class_level, topics, difficulty, num_questions, subsystem='anglophone'):
    topic_str = f'focusing on: {topics}' if topics else 'covering the core curriculum'
    lang_note = 'in French (Francais)' if subsystem == 'francophone' else 'in English'

    return f"""You are an expert {subject} examiner for {class_level} in Cameroon.

Generate exactly {num_questions} structural examination questions {topic_str}.
Difficulty: {difficulty}. Language: {lang_note}.

Include a mix of theory questions, problem-solving questions, essay questions, and practical questions where relevant.

Return ONLY valid JSON in this exact format:
{{
  "questions": [
    {{
      "order": 1,
      "kind": "THEORY",
      "text": "Full question text",
      "expected_answer": "Model answer for the teacher",
      "marking_guide": "Breakdown of marks: point A (2 marks), point B (3 marks)",
      "marks": 5
    }}
  ]
}}

kind must be one of: THEORY, PROBLEM, ESSAY, PRACTICAL"""


def build_exam_prompt(subject, class_level, topics, difficulty, num_mcq, num_structural, subsystem='anglophone'):
    topic_str = f'focusing on: {topics}' if topics else 'covering the core curriculum'
    lang_note = 'in French (Francais)' if subsystem == 'francophone' else 'in English'
    structural_note = (
        f'- Generate exactly {num_structural} structural questions. kind must be one of THEORY, PROBLEM, ESSAY, PRACTICAL.'
        if num_structural
        else '- Do not generate structural questions.'
    )
    mcq_note = (
        f'- Generate exactly {num_mcq} MCQ questions. Each MCQ must have exactly 4 options and one correct_option from 0 to 3.'
        if num_mcq
        else '- Do not generate MCQ questions.'
    )

    return f"""You are an expert {subject} examiner for {class_level} students in Cameroon's secondary education system.

Generate a concise exam question draft {topic_str}.
Difficulty: {difficulty}. Language: {lang_note}.

STRICT RULES:
{mcq_note}
{structural_note}
- Questions must be level-appropriate for {class_level}.
- No duplicates, no harmful content, no trick wording.
- Keep explanations and marking guides concise.

Return ONLY valid JSON in this exact shape:
{{
  "questions": [
    {{
      "order": 1,
      "kind": "MCQ",
      "text": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option": 0,
      "explanation": "Short explanation",
      "marks": 1
    }},
    {{
      "order": 2,
      "kind": "THEORY",
      "text": "Structural question text",
      "expected_answer": "Short model answer",
      "marking_guide": "Concise marks breakdown",
      "marks": 5
    }}
  ]
}}"""


def _subject_name(draft):
    return draft.subject.name if draft.subject else 'General Studies'


def _class_level(draft):
    return draft.school_class.name if draft.school_class else draft.title


def _mark_failed(draft, error_message):
    draft.generation_error = error_message
    draft.status = draft.Status.FAILED
    draft.save(update_fields=['generation_error', 'status', 'updated_at'])
    if draft.ai_request_id:
        draft.ai_request.mark_failed(error_message)


def _normalize_questions(questions):
    normalized = []
    for index, question in enumerate(questions, start=1):
        question['order'] = index
        question['kind'] = question.get('kind') or 'MCQ'
        if question['kind'] == 'STRUCTURAL':
            question['kind'] = 'THEORY'
        question['marks'] = max(int(question.get('marks') or 1), 1)
        if question['kind'] == 'MCQ':
            question['options'] = [str(option).strip() for option in question.get('options', [])]
            question['correct_option'] = int(question.get('correct_option', 0))
        else:
            question['options'] = []
            question['correct_option'] = 0
        normalized.append(question)
    return normalized


def _question_token_budget(num_mcq, num_structural):
    return min(2600, max(750, (num_mcq * 90) + (num_structural * 170) + 420))


def _topic_pool(topics):
    values = [topic.strip() for topic in (topics or '').replace(';', ',').split(',') if topic.strip()]
    return values or ['core concepts', 'classwork', 'revision']


def _fallback_questions(draft, num_mcq, num_structural, reason):
    """Create a safe review-ready draft when the AI provider is unavailable."""
    subject_name = _subject_name(draft)
    class_level = _class_level(draft)
    topics = _topic_pool(draft.topics)
    questions = []

    for index in range(num_mcq):
        topic = topics[index % len(topics)]
        questions.append({
            'kind': 'MCQ',
            'text': (
                f'Question {index + 1}: In {subject_name} for {class_level}, which option best matches the key idea '
                f'taught under {topic}?'
            ),
            'options': [
                f'The correct concept or method for {topic}',
                f'An unrelated idea from another topic',
                f'A common misconception about {topic}',
                'None of the above without justification',
            ],
            'correct_option': 0,
            'explanation': f'Teachers should verify and adapt this fallback item for the exact lesson on {topic}.',
            'marks': 1,
        })

    for index in range(num_structural):
        topic = topics[(index + num_mcq) % len(topics)]
        questions.append({
            'kind': 'THEORY',
            'text': (
                f'Structural question {index + 1}: Explain the main ideas of {topic} in {subject_name} and give one classroom '
                f'example suitable for {class_level}.'
            ),
            'expected_answer': (
                f'The answer should define the key idea, explain how it is used, and include '
                f'a correct example from {topic}.'
            ),
            'marking_guide': 'Definition and key idea (2 marks); explanation/application (2 marks); relevant example (1 mark).',
            'marks': 5,
        })

    if reason:
        logger.warning('Using fallback AI exam questions for draft %s: %s', draft.id, reason)
    return questions


def _bank_questions_for_draft(draft, kind, limit):
    if limit <= 0:
        return []

    subject_name = _subject_name(draft)
    class_level = _class_level(draft)
    query = QuestionBank.objects.filter(
        school=draft.school,
        kind=kind,
        subject_name__iexact=subject_name,
        class_level__iexact=class_level,
    )
    if draft.difficulty in {'easy', 'medium', 'hard'}:
        query = query.filter(difficulty=draft.difficulty)

    items = list(query.order_by('use_count', '-created_at')[:limit])
    if items:
        QuestionBank.objects.filter(id__in=[item.id for item in items]).update(use_count=F('use_count') + 1)

    questions = []
    for item in items:
        if kind == QuestionBank.Kind.MCQ:
            questions.append({
                'kind': 'MCQ',
                'text': item.text,
                'options': item.options,
                'correct_option': item.correct_option or 0,
                'explanation': '',
                'marks': item.marks,
            })
        else:
            questions.append({
                'kind': 'THEORY',
                'text': item.text,
                'expected_answer': item.expected_answer,
                'marking_guide': item.marking_guide,
                'marks': item.marks,
            })
    return questions


def generate_exam_questions(draft):
    """
    Generate questions for an AIExamDraft.

    Returns:
        tuple[bool, str | None]
    """
    subject_name = _subject_name(draft)
    class_level = _class_level(draft)
    subsystem = getattr(draft.school, 'subsystem', 'anglophone')
    all_questions = []
    total_tokens = 0
    total_processing = 0

    try:
        if draft.ai_request_id:
            AIRequest.objects.filter(id=draft.ai_request_id).update(status='processing')

        requested_mcq = draft.num_mcq if draft.question_type in ('MCQ', 'MIXED') else 0
        requested_structural = draft.num_structural if draft.question_type in ('STRUCTURAL', 'MIXED') else 0

        reused_mcq = _bank_questions_for_draft(draft, QuestionBank.Kind.MCQ, requested_mcq)
        reused_structural = _bank_questions_for_draft(draft, QuestionBank.Kind.STRUCTURAL, requested_structural)
        all_questions.extend(reused_mcq)
        all_questions.extend(reused_structural)

        remaining_mcq = max(requested_mcq - len(reused_mcq), 0)
        remaining_structural = max(requested_structural - len(reused_structural), 0)

        if remaining_mcq or remaining_structural:
            prompt = build_exam_prompt(
                subject_name,
                class_level,
                draft.topics,
                draft.difficulty,
                remaining_mcq,
                remaining_structural,
                subsystem,
            )
            try:
                result = call_groq_api(
                    prompt,
                    max_tokens=_question_token_budget(remaining_mcq, remaining_structural),
                    purpose='ai_exam_generation',
                    response_format={'type': 'json_object'},
                )
            except Exception as exc:  # noqa: BLE001 - missing keys/provider errors should not leave a spinner.
                result = {'success': False, 'error': str(exc)}
            if result['success']:
                total_tokens += result.get('tokens_used', 0)
                total_processing += result.get('processing_time_ms', 0)
                try:
                    payload = extract_json_payload(result['response'])
                    all_questions.extend(payload.get('questions', []))
                except Exception as exc:  # noqa: BLE001 - fallback keeps the teacher workflow moving.
                    all_questions.extend(_fallback_questions(draft, remaining_mcq, remaining_structural, exc))
            else:
                all_questions.extend(
                    _fallback_questions(
                        draft,
                        remaining_mcq,
                        remaining_structural,
                        result.get('error', 'Exam question generation failed.'),
                    )
                )

        all_questions = _normalize_questions(all_questions)
        mcq_questions = [question for question in all_questions if question['kind'] == 'MCQ'][:requested_mcq]
        structural_questions = [question for question in all_questions if question['kind'] != 'MCQ'][:requested_structural]
        missing_mcq = max(requested_mcq - len(mcq_questions), 0)
        missing_structural = max(requested_structural - len(structural_questions), 0)
        if missing_mcq or missing_structural:
            supplement = _normalize_questions(
                _fallback_questions(
                    draft,
                    missing_mcq,
                    missing_structural,
                    'AI returned fewer questions than requested.',
                )
            )
            mcq_questions.extend([question for question in supplement if question['kind'] == 'MCQ'][:missing_mcq])
            structural_questions.extend([question for question in supplement if question['kind'] != 'MCQ'][:missing_structural])
        all_questions = _normalize_questions([*mcq_questions, *structural_questions])
        valid, validation_error = validate_exam_questions(all_questions)
        if not valid:
            _mark_failed(draft, validation_error)
            return False, validation_error

        with transaction.atomic():
            AIExamQuestion.objects.filter(draft=draft).delete()
            AIExamQuestion.objects.bulk_create([
                AIExamQuestion(
                    draft=draft,
                    order=question['order'],
                    kind=question.get('kind', 'MCQ'),
                    text=question['text'],
                    options=question.get('options', []),
                    correct_option=question.get('correct_option', 0),
                    expected_answer=question.get('expected_answer', ''),
                    marking_guide=question.get('marking_guide', ''),
                    marks=question.get('marks', 1),
                    explanation=question.get('explanation', ''),
                )
                for question in all_questions
            ])
            draft.status = draft.Status.DRAFT
            draft.generation_error = ''
            draft.save(update_fields=['status', 'generation_error', 'updated_at'])

        if draft.ai_request_id:
            draft.ai_request.mark_completed(
                response=json.dumps({'question_count': len(all_questions)}),
                tokens_used=total_tokens,
                processing_time_ms=total_processing,
            )

        return True, None
    except Exception as exc:  # noqa: BLE001 - task needs a clean failure message.
        logger.exception('Unexpected AI exam generation error for draft %s', draft.id)
        error = str(exc)
        _mark_failed(draft, error)
        return False, error


def save_draft_questions_to_bank(draft):
    """Persist reviewed/published draft questions into the reusable question bank."""
    subject_name = _subject_name(draft)
    class_level = _class_level(draft)
    created = 0

    for question in draft.questions.all():
        normalized_text = ' '.join(question.text.split()).lower()
        text_hash = hashlib.sha256(normalized_text.encode('utf-8')).hexdigest()
        kind = QuestionBank.Kind.MCQ if question.kind == 'MCQ' else QuestionBank.Kind.STRUCTURAL
        difficulty = draft.difficulty if draft.difficulty in {'easy', 'medium', 'hard'} else 'medium'
        _, was_created = QuestionBank.objects.get_or_create(
            school=draft.school,
            text_hash=text_hash,
            defaults={
                'subject_name': subject_name,
                'class_level': class_level,
                'topic': draft.topics[:255],
                'difficulty': difficulty,
                'kind': kind,
                'text': question.text,
                'options': question.options,
                'correct_option': question.correct_option if question.kind == 'MCQ' else None,
                'expected_answer': question.expected_answer,
                'marking_guide': question.marking_guide,
                'marks': question.marks,
                'source_draft': draft,
            },
        )
        if was_created:
            created += 1
    return created

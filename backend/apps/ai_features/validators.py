from typing import Tuple

BANNED_CONTENT_KEYWORDS = ['bomb', 'weapon', 'drug', 'illegal', 'violence']


def _contains_banned_content(value: str) -> str:
    lowered = (value or '').lower()
    for keyword in BANNED_CONTENT_KEYWORDS:
        if keyword in lowered:
            return keyword
    return ''


def validate_exam_questions(questions: list) -> Tuple[bool, str]:
    """Validate AI-generated exam questions before saving."""
    if not questions:
        return False, 'No questions generated'

    seen_texts = set()
    for index, question in enumerate(questions, start=1):
        text = str(question.get('text', '')).strip()
        if not text:
            return False, f'Question {question.get("order") or index} has empty text'

        duplicate_key = text.lower()
        if duplicate_key in seen_texts:
            return False, f'Question {question.get("order") or index} is duplicated'
        seen_texts.add(duplicate_key)

        banned = _contains_banned_content(text)
        if banned:
            return False, f"Question contains prohibited content: '{banned}'"

        kind = question.get('kind') or 'MCQ'
        if kind == 'MCQ':
            options = question.get('options') or []
            if len(options) != 4:
                return False, f'MCQ question {question.get("order") or index} must have exactly 4 options'
            if question.get('correct_option', -1) not in range(4):
                return False, f'MCQ question {question.get("order") or index} has invalid correct_option'
            for option in options:
                banned_option = _contains_banned_content(str(option))
                if banned_option:
                    return False, f"MCQ option contains prohibited content: '{banned_option}'"

    return True, ''


def validate_career_report(data: dict) -> Tuple[bool, str]:
    """Validate AI career report structure."""
    required_keys = [
        'career_overview',
        'subjects_to_focus',
        'step_by_step_roadmap',
        'recommended_universities',
    ]
    for key in required_keys:
        if key not in data:
            return False, f'Missing required field: {key}'

    if not isinstance(data.get('step_by_step_roadmap'), list):
        return False, 'step_by_step_roadmap must be a list'
    if not isinstance(data.get('recommended_universities'), list):
        return False, 'recommended_universities must be a list'

    for university in data.get('recommended_universities') or []:
        if isinstance(university, dict):
            note = str(university.get('note', '')).lower()
            if 'verify admission requirements' not in note:
                university['note'] = 'Verify admission requirements directly with the university.'

    return True, ''


def ensure_list(value):
    if isinstance(value, list):
        return value
    if value in (None, ''):
        return []
    return [str(value)]

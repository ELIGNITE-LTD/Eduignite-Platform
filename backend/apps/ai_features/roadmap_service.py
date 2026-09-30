"""Academic roadmap AI service."""
import json
import logging

from .service_utils import (
    class_display_name,
    extract_json_payload,
    get_attendance_rate,
    get_student_grade_summary,
    student_display_name,
)
from . import credit_engine
from .utils import call_groq_api

logger = logging.getLogger(__name__)


ROADMAP_SCHEMA = {
    'academic_year': 'string',
    'student_summary': 'string',
    'term_plans': [
        {
            'term': 'Term 1',
            'goals': ['goal'],
            'study_schedule': ['weekly activity'],
            'milestones': [{'title': 'string', 'target': 'string'}],
        }
    ],
    'subject_strategies': [
        {'subject': 'Mathematics', 'strategy': 'string', 'weekly_hours': 4}
    ],
    'weekly_revision_plan': [
        {'day': 'Monday', 'activities': ['activity']}
    ],
    'risk_alerts': [
        {'subject': 'Mathematics', 'risk': 'string', 'intervention': 'string'}
    ],
    'measurable_goals': ['goal'],
}


def build_roadmap_prompt(roadmap) -> str:
    student = roadmap.student
    grades = get_student_grade_summary(student)
    attendance_rate = get_attendance_rate(student)
    weak_subjects = [
        item for item in grades
        if item['score'] < 10 or (item['class_average'] and item['score'] < item['class_average'])
    ]

    return f"""You are EduIgnite Academic Planning AI for Cameroon secondary schools.

Create a practical academic roadmap for the student below.

STUDENT:
- Name: {student_display_name(student)}
- Class: {class_display_name(student)}
- School: {student.school.name}
- Academic Year: {roadmap.academic_year}
- Target Average: {roadmap.target_grade or 'Not specified'}
- Target Career: {roadmap.target_career or 'Not specified'}
- Attendance Rate: {attendance_rate}%
- Grade Data: {json.dumps(grades, ensure_ascii=False)}
- Weak Subjects: {json.dumps(weak_subjects, ensure_ascii=False)}

INSTRUCTIONS:
1. Create a 3-term study schedule.
2. Include subject-specific improvement strategies.
3. Include a weekly revision plan.
4. Include milestones with measurable goals.
5. Include risk alerts where marks or attendance show danger.
6. Use the student's language context when obvious. Otherwise respond in English.

Return ONLY valid JSON matching this schema:
{json.dumps(ROADMAP_SCHEMA, indent=2)}"""


@credit_engine.meters(lambda target: target.ai_request if target.ai_request_id else None)
def generate_academic_roadmap(roadmap):
    prompt = build_roadmap_prompt(roadmap)
    if roadmap.ai_request_id:
        roadmap.ai_request.status = 'processing'
        roadmap.ai_request.prompt = prompt
        roadmap.ai_request.save(update_fields=['status', 'prompt', 'updated_at'])

    result = call_groq_api(prompt, max_tokens=2200, purpose='academic_roadmap')
    if not result['success']:
        error = result.get('error', 'Academic roadmap generation failed.')
        roadmap.status = 'failed'
        roadmap.error_message = error
        roadmap.save(update_fields=['status', 'error_message', 'updated_at'])
        if roadmap.ai_request_id:
            roadmap.ai_request.mark_failed(error)
        return False, error

    try:
        data = extract_json_payload(result['response'])
        if not data.get('term_plans'):
            raise ValueError('Roadmap must include term_plans.')
        roadmap.roadmap_data = data
        roadmap.status = 'completed'
        roadmap.error_message = ''
        roadmap.save(update_fields=['roadmap_data', 'status', 'error_message', 'updated_at'])
        if roadmap.ai_request_id:
            roadmap.ai_request.mark_completed(
                response=json.dumps(data),
                tokens_used=result.get('tokens_used', 0),
                processing_time_ms=result.get('processing_time_ms', 0),
            )
        return True, None
    except Exception as exc:  # noqa: BLE001
        logger.exception('Academic roadmap response could not be parsed')
        error = f'Invalid roadmap response: {exc}'
        roadmap.status = 'failed'
        roadmap.error_message = error
        roadmap.save(update_fields=['status', 'error_message', 'updated_at'])
        if roadmap.ai_request_id:
            roadmap.ai_request.mark_failed(error)
        return False, error

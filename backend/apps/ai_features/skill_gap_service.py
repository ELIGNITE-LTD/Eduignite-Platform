"""Skill gap analysis AI service."""
import json
import logging

from .service_utils import (
    class_display_name,
    extract_json_payload,
    get_attendance_rate,
    get_student_grade_summary,
    student_display_name,
)
from .utils import call_groq_api

logger = logging.getLogger(__name__)


SKILL_GAP_SCHEMA = {
    'weak_subjects': [
        {
            'subject': 'Mathematics',
            'student_score': 8.5,
            'class_average': 12.0,
            'gap': 3.5,
            'severity': 'HIGH',
            'root_cause_hypothesis': 'string',
            'improvement_strategies': ['string'],
            'recommended_resources': ['string'],
        }
    ],
    'strong_subjects': [
        {'subject': 'English', 'student_score': 15, 'class_average': 12}
    ],
    'overall_assessment': 'string',
    'priority_action_plan': ['step 1', 'step 2'],
    'study_hours_recommendation': {
        'weekly_total': 20,
        'per_subject': {'Mathematics': 5},
    },
}


def build_skill_gap_prompt(report):
    student = report.student
    grades = get_student_grade_summary(student, report.sequence)
    attendance_rate = get_attendance_rate(student)
    sequence_name = report.sequence.name if report.sequence else 'Most recent available sequence'

    return f"""You are EduIgnite Academic Diagnostics AI for Cameroon secondary schools.

Analyze this student's academic skill gaps using the real school data below.

STUDENT:
- Name: {student_display_name(student)}
- Class: {class_display_name(student)}
- School: {student.school.name}
- Sequence: {sequence_name}
- Attendance Rate: {attendance_rate}%
- Subject Grades with Class Averages: {json.dumps(grades, ensure_ascii=False)}

INSTRUCTIONS:
1. Compare student scores with class averages.
2. Identify weak and strong subjects.
3. For weak subjects, include realistic root-cause hypotheses, not accusations.
4. Give practical improvement strategies for Cameroon secondary school learners.
5. Recommend weekly study hours.
6. Return English or French based on the student's context.

Return ONLY valid JSON matching this schema:
{json.dumps(SKILL_GAP_SCHEMA, indent=2)}"""


def generate_skill_gap_report(report):
    prompt = build_skill_gap_prompt(report)
    if report.ai_request_id:
        report.ai_request.status = 'processing'
        report.ai_request.prompt = prompt
        report.ai_request.save(update_fields=['status', 'prompt', 'updated_at'])

    result = call_groq_api(prompt, max_tokens=2000, purpose='skill_gap_analysis')
    if not result['success']:
        error = result.get('error', 'Skill gap analysis failed.')
        report.status = 'failed'
        report.error_message = error
        report.save(update_fields=['status', 'error_message', 'updated_at'])
        if report.ai_request_id:
            report.ai_request.mark_failed(error)
        return False, error

    try:
        data = extract_json_payload(result['response'])
        if 'weak_subjects' not in data or 'overall_assessment' not in data:
            raise ValueError('Skill gap report is missing required sections.')
        report.analysis_data = data
        report.status = 'completed'
        report.error_message = ''
        report.save(update_fields=['analysis_data', 'status', 'error_message', 'updated_at'])
        if report.ai_request_id:
            report.ai_request.mark_completed(
                response=json.dumps(data),
                tokens_used=result.get('tokens_used', 0),
                processing_time_ms=result.get('processing_time_ms', 0),
            )
        return True, None
    except Exception as exc:  # noqa: BLE001
        logger.exception('Skill gap response could not be parsed')
        error = f'Invalid skill gap response: {exc}'
        report.status = 'failed'
        report.error_message = error
        report.save(update_fields=['status', 'error_message', 'updated_at'])
        if report.ai_request_id:
            report.ai_request.mark_failed(error)
        return False, error

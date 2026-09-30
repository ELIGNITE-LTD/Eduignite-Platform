"""Student guidance report AI service."""
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


GUIDANCE_SCHEMA = {
    'academic_strengths': ['string'],
    'academic_weaknesses': ['string'],
    'attendance_summary': 'string',
    'behavioural_notes': 'string',
    'career_direction_suggestions': ['string'],
    'subject_recommendations': ['string'],
    'study_recommendations': ['string'],
    'future_academic_plan': ['string'],
}


def _staff_remarks(student, academic_year, term):
    try:
        from apps.staff_remarks.models import StaffRemark
    except Exception:  # noqa: BLE001 - optional app structure differs by deployment.
        return []

    fields = [field.name for field in StaffRemark._meta.fields]
    queryset = StaffRemark.objects.filter(student=student)
    if 'academic_year' in fields:
        queryset = queryset.filter(academic_year=academic_year)
    if 'term' in fields:
        queryset = queryset.filter(term=term)

    values = []
    for remark in queryset[:8]:
        text = (
            getattr(remark, 'remark', None)
            or getattr(remark, 'comment', None)
            or getattr(remark, 'message', None)
            or str(remark)
        )
        values.append(str(text))
    return values


def build_guidance_prompt(report):
    student = report.student
    grades = get_student_grade_summary(student)
    attendance_rate = get_attendance_rate(student)
    remarks = _staff_remarks(student, report.academic_year, report.term)

    return f"""You are EduIgnite Student Guidance AI for Cameroon secondary education.

Generate a professional guidance report for the selected audience.

CONTEXT:
- Student: {student_display_name(student)}
- Class: {class_display_name(student)}
- School: {student.school.name}
- Academic Year: {report.academic_year}
- Term: {report.term}
- Audience: {report.audience}
- Attendance Rate: {attendance_rate}%
- Grades: {json.dumps(grades, ensure_ascii=False)}
- Staff Remarks: {json.dumps(remarks, ensure_ascii=False)}

INSTRUCTIONS:
1. Use real grade data only. If data is missing, say the school should update records.
2. Adjust tone for audience: student = encouraging and direct, parent = clear and supportive, teacher = practical and instructional.
3. Include strengths, weaknesses, attendance, remarks, career hints, subject recommendations, study recommendations, and future plan.
4. Respond in English or French based on school/student context.

Return ONLY valid JSON matching this schema:
{json.dumps(GUIDANCE_SCHEMA, indent=2)}"""


@credit_engine.meters(lambda target: target.ai_request if target.ai_request_id else None)
def generate_student_guidance_report(report):
    prompt = build_guidance_prompt(report)
    if report.ai_request_id:
        report.ai_request.status = 'processing'
        report.ai_request.prompt = prompt
        report.ai_request.save(update_fields=['status', 'prompt', 'updated_at'])

    result = call_groq_api(prompt, max_tokens=2200, purpose='student_guidance')
    if not result['success']:
        error = result.get('error', 'Guidance report generation failed.')
        report.status = 'failed'
        report.error_message = error
        report.save(update_fields=['status', 'error_message', 'updated_at'])
        if report.ai_request_id:
            report.ai_request.mark_failed(error)
        return False, error

    try:
        data = extract_json_payload(result['response'])
        missing = [key for key in GUIDANCE_SCHEMA if key not in data]
        if missing:
            raise ValueError(f'Missing guidance sections: {", ".join(missing)}')
        report.report_data = data
        report.status = 'completed'
        report.error_message = ''
        report.save(update_fields=['report_data', 'status', 'error_message', 'updated_at'])
        if report.ai_request_id:
            report.ai_request.mark_completed(
                response=json.dumps(data),
                tokens_used=result.get('tokens_used', 0),
                processing_time_ms=result.get('processing_time_ms', 0),
            )
        return True, None
    except Exception as exc:  # noqa: BLE001
        logger.exception('Guidance report response could not be parsed')
        error = f'Invalid guidance report response: {exc}'
        report.status = 'failed'
        report.error_message = error
        report.save(update_fields=['status', 'error_message', 'updated_at'])
        if report.ai_request_id:
            report.ai_request.mark_failed(error)
        return False, error

import logging
import time
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)

FAST_GROQ_PURPOSES = {
    'ai_exam_generation',
    'career_orientation',
    'academic_roadmap',
    'skill_gap_analysis',
    'student_guidance',
}


def _purpose_from_context(context):
    if isinstance(context, dict):
        return context.get('purpose') or context.get('request_type') or context.get('feature')
    return None


def _groq_config_for_purpose(purpose=None, model_override=None):
    normalized_purpose = (purpose or '').strip()
    use_fast_lane = normalized_purpose in FAST_GROQ_PURPOSES

    if normalized_purpose == 'career_orientation':
        api_key = (
            getattr(settings, 'GROQ_CAREER_API_KEY', '')
            or getattr(settings, 'GROQ_FAST_API_KEY', '')
            or getattr(settings, 'GROQ_API_KEY', '')
        )
        model = model_override or getattr(
            settings,
            'GROQ_CAREER_MODEL',
            getattr(settings, 'GROQ_FAST_MODEL', getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')),
        ) or getattr(settings, 'GROQ_FAST_MODEL', '') or getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')
        key_source = 'career' if getattr(settings, 'GROQ_CAREER_API_KEY', '') else 'fast' if getattr(settings, 'GROQ_FAST_API_KEY', '') else 'primary'
    elif normalized_purpose == 'ai_exam_generation':
        api_key = (
            getattr(settings, 'GROQ_EXAM_API_KEY', '')
            or getattr(settings, 'GROQ_FAST_API_KEY', '')
            or getattr(settings, 'GROQ_API_KEY', '')
        )
        model = model_override or getattr(
            settings,
            'GROQ_EXAM_MODEL',
            getattr(settings, 'GROQ_FAST_MODEL', getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')),
        ) or getattr(settings, 'GROQ_FAST_MODEL', '') or getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')
        key_source = 'exam' if getattr(settings, 'GROQ_EXAM_API_KEY', '') else 'fast' if getattr(settings, 'GROQ_FAST_API_KEY', '') else 'primary'
    elif use_fast_lane:
        api_key = getattr(settings, 'GROQ_FAST_API_KEY', '') or getattr(settings, 'GROQ_API_KEY', '')
        model = model_override or getattr(settings, 'GROQ_FAST_MODEL', getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')) or getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b')
        key_source = 'fast' if getattr(settings, 'GROQ_FAST_API_KEY', '') else 'primary'
    else:
        api_key = getattr(settings, 'GROQ_API_KEY', '')
        model = model_override or getattr(settings, 'GROQ_MODEL', 'openai/gpt-oss-120b') or 'openai/gpt-oss-120b'
        key_source = 'primary'

    if normalized_purpose == 'career_orientation':
        timeout = getattr(settings, 'GROQ_CAREER_TIMEOUT_SECONDS', getattr(settings, 'GROQ_FAST_TIMEOUT_SECONDS', 18))
        max_retries = getattr(settings, 'GROQ_CAREER_MAX_RETRIES', getattr(settings, 'GROQ_FAST_MAX_RETRIES', 0))
    else:
        timeout = (
            getattr(settings, 'GROQ_FAST_TIMEOUT_SECONDS', 18)
            if use_fast_lane
            else getattr(settings, 'GROQ_TIMEOUT_SECONDS', 35)
        )
        max_retries = (
            getattr(settings, 'GROQ_FAST_MAX_RETRIES', 0)
            if use_fast_lane
            else getattr(settings, 'GROQ_MAX_RETRIES', 1)
        )
    return api_key, model, timeout, max_retries, key_source


def call_groq_api(prompt, context=None, max_tokens=2048, purpose=None, model=None, response_format=None):
    """
    Call Groq API with the given prompt.

    Args:
        prompt (str): The prompt to send to Groq
        context (dict): Optional context data for the request (unused, kept for
                        backward-compatible call signatures)
        max_tokens (int): Maximum tokens for response
        purpose (str): Optional AI feature key used to route fast workloads to
                       the secondary Groq key.
        model (str): Optional model override for a specific call.

    Returns:
        dict: Response containing 'success', 'response', 'tokens_used', 'processing_time_ms'
    """
    try:
        from groq import Groq

        request_purpose = purpose or _purpose_from_context(context)
        api_key, selected_model, timeout, max_retries, key_source = _groq_config_for_purpose(request_purpose, model)
        if not api_key:
            raise ValidationError(_('Groq API key is not configured.'))

        client = Groq(
            api_key=api_key,
            timeout=timeout,
            max_retries=max_retries,
        )

        # The chat is read in a bubble on a phone, so a good answer is short
        # and shaped. Only the open conversation gets this: a feature that asks
        # for a report or for JSON has its own prompt and its own length.
        is_conversation = not (request_purpose or '').strip() and not response_format
        answer_shape = (
            'ANSWER SHAPE: Answer the question itself first, in one or two short '
            'sentences. Where an answer really has parts, add up to four short '
            'bullet points and stop there. Then offer the longer version in one '
            'closing question that names what you would expand on, for example '
            '"Would you like me to go through the steps in detail?". Write at '
            'length only when the person has asked you to, or when a short answer '
            'would be wrong or unsafe. Never answer with a wall of text.\n\n'
            if is_conversation
            else ''
        )
        # The apps render this markdown themselves, so ask for the part they
        # render. Anything else reaches the reader as punctuation.
        formatting = (
            ''
            if response_format
            else (
                'FORMATTING: Write in markdown, using only what the apps display: a '
                'short bold line as a heading where an answer has sections, "- " for '
                'bullets, "1." for steps that must happen in order, **bold** for the '
                'one thing to remember, and a blank line between blocks. Keep '
                'sentences short. Do not use tables, HTML, or code fences unless you '
                'are actually showing code.\n\n'
            )
        )

        start_time = time.time()

        request_kwargs = {
            'model': selected_model,
            'messages': [
                {
                    'role': 'system',
                    'content': (
                        'You are the EduIgnite AI, a highly intelligent, supportive and '
                        'trustworthy educational assistant built into the EduIgnite school '
                        'management platform for schools in Cameroon. You serve every kind '
                        'of user on the platform: students, parents/guardians, teachers, '
                        'bursars, librarians and school administrators.\n\n'
                        'SCOPE: Gladly help with any matter about school and education. This '
                        'includes the EduIgnite platform and its tools (grades, attendance, '
                        'fees, timetable, library, assignments, exams, live classes, '
                        'messaging, report cards) as well as broader learning topics: '
                        'understanding subjects, study techniques, homework help, exam '
                        'preparation, academic planning, school life, and career or '
                        'university guidance. Tailor the depth and tone to the user\'s role. '
                        'If a request is clearly unrelated to school, education or the '
                        'platform, gently steer the conversation back to those topics.\n\n'
                        'LOYALTY: EduIgnite is the platform you are part of. Always speak '
                        'about EduIgnite, its features, the school and its staff in a '
                        'positive, respectful and constructive way. Never disparage, mock, '
                        'insult or discourage use of EduIgnite or say it is bad, broken, '
                        'inferior or worse than alternatives, and do not recommend competing '
                        'products. If a feature is missing, a user hits a limitation, or '
                        'something is not working, stay constructive: explain what the '
                        'platform can do, suggest the correct steps or the right person to '
                        'contact (e.g. their school administrator or EduIgnite support), and '
                        'frame it as a next step rather than a fault. You may still be '
                        'honest and accurate; simply remain professional and never insult '
                        'the system.\n\n'
                        'STYLE: Always respond helpfully, professionally, and in the same '
                        'language the user writes in (English or French).\n\n'
                        + answer_shape
                        + formatting
                    ),
                },
                {
                    'role': 'user',
                    'content': prompt,
                },
            ],
            'max_tokens': max_tokens,
            'temperature': 0.35 if response_format else 0.45,
            'top_p': 0.9,
        }
        if response_format:
            request_kwargs['response_format'] = response_format

        # gpt-oss thinks before it answers, and that thinking is paid for out of
        # max_tokens - at the 900 the chat allows, a long think leaves the answer
        # cut off mid-sentence. Keep the thinking short so the answer fits.
        # Sent through extra_body so it does not depend on the SDK version.
        if 'gpt-oss' in (selected_model or ''):
            request_kwargs['extra_body'] = {
                'reasoning_effort': getattr(settings, 'GROQ_REASONING_EFFORT', 'low') or 'low',
            }

        completion = client.chat.completions.create(**request_kwargs)

        processing_time = int((time.time() - start_time) * 1000)

        response_text = completion.choices[0].message.content
        tokens_used = completion.usage.total_tokens if completion.usage else 0

        return {
            'success': True,
            'response': response_text,
            'tokens_used': tokens_used,
            'processing_time_ms': processing_time,
            'model': selected_model,
            'key_source': key_source,
        }

    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        return {
            'success': False,
            'error': f"Groq API error: {str(e)}",
            'response': None,
            'tokens_used': 0,
            'processing_time_ms': 0,
        }


# Keep old name as alias so any code that still references it doesn't break
call_gemini_api = call_groq_api


def build_study_plan_prompt(student_data, subjects, weeks):
    """
    Build a prompt for generating a personalized study plan.

    Args:
        student_data (dict): Student information
        subjects (list): List of subjects
        weeks (int): Number of weeks for the plan

    Returns:
        str: Formatted prompt for Groq API
    """
    subjects_str = ', '.join(subjects)

    prompt = f"""Create a comprehensive {weeks}-week study plan for {student_data.get('name', 'the student')} covering the following subjects: {subjects_str}.

Student Background:
- Current Grade: {student_data.get('grade', 'N/A')}
- Academic Level: {student_data.get('academic_level', 'Average')}
- Learning Style: {student_data.get('learning_style', 'Mixed')}

Please provide:
1. Weekly breakdown with specific topics to cover
2. Recommended study duration per subject per day
3. Key concepts and learning objectives for each subject
4. Suggested resources and study materials
5. Practice problems and assessments schedule
6. Tips for retention and understanding

Format the response as a structured study plan that can be easily followed."""

    return prompt


def build_grade_analysis_prompt(student, grades_data):
    """
    Build a prompt for analyzing student grades.

    Args:
        student (dict): Student information
        grades_data (dict): Grades and performance data

    Returns:
        str: Formatted prompt for Groq API
    """
    prompt = f"""Analyze the academic performance of {student.get('name', 'this student')} and provide insights.

Student Information:
- Grade Level: {student.get('grade', 'N/A')}
- Current GPA: {student.get('gpa', 'N/A')}

Recent Grades:
{format_grades_data(grades_data)}

Please provide:
1. Strengths in academic performance
2. Areas that need improvement
3. Subject-wise analysis and performance trends
4. Comparison with class averages if available
5. Specific recommendations for improvement
6. Predicted academic trajectory
7. Motivation and engagement assessment

Make the analysis encouraging but honest, with actionable recommendations."""

    return prompt


def build_attendance_prompt(attendance_data):
    """
    Build a prompt for analyzing attendance patterns.

    Args:
        attendance_data (dict): Attendance information

    Returns:
        str: Formatted prompt for Groq API
    """
    prompt = f"""Analyze attendance patterns and provide insights:

Attendance Data:
- Total Days Present: {attendance_data.get('present', 0)}
- Total Days Absent: {attendance_data.get('absent', 0)}
- Total Days Late: {attendance_data.get('late', 0)}
- Attendance Rate: {attendance_data.get('attendance_rate', 'N/A')}%

Recent Pattern:
{format_attendance_pattern(attendance_data.get('pattern', []))}

Please provide:
1. Overall attendance assessment
2. Patterns and trends (improving/declining/inconsistent)
3. Impact on academic performance
4. Risk factors if attendance is below threshold
5. Specific recommendations to improve attendance
6. Suggested interventions if necessary

Focus on constructive feedback that encourages better attendance."""

    return prompt


FEATURE_DAILY_LIMITS = {
    'ai_exam_generation': 'AI_EXAM_GENERATION_DAILY_LIMIT',
    'career_orientation': 'AI_CAREER_REPORT_DAILY_LIMIT',
    'skill_gap_analysis': 'AI_SKILL_GAP_DAILY_LIMIT',
    'academic_roadmap': 'AI_SKILL_GAP_DAILY_LIMIT',
    'student_guidance': 'AI_SKILL_GAP_DAILY_LIMIT',
}


def check_ai_quota(user, request_type=None, school=None):
    """
    Check if user has remaining AI request quota.

    Args:
        user (User): User object

    Returns:
        bool: True if user is under quota, False otherwise
    """
    try:
        # Get user's AI request limit from settings
        monthly_limit = getattr(settings, 'AI_REQUEST_MONTHLY_LIMIT', 100)
        daily_limit = getattr(settings, 'AI_REQUEST_DAILY_LIMIT', 10)

        from django.utils import timezone
        from datetime import timedelta
        from .models import AIRequest

        if request_type in FEATURE_DAILY_LIMITS:
            today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            limit = getattr(settings, FEATURE_DAILY_LIMITS[request_type], 10)
            quota_queryset = AIRequest.objects.filter(
                request_type=request_type,
                created_at__gte=today,
                status__in=['pending', 'processing', 'completed'],
            )
            target_school = school or getattr(user, 'school', None)
            if target_school:
                quota_queryset = quota_queryset.filter(school=target_school)
            else:
                quota_queryset = quota_queryset.filter(user=user)
            if quota_queryset.count() >= limit:
                logger.warning(
                    "Daily AI limit reached for request_type=%s user=%s school=%s",
                    request_type,
                    getattr(user, 'id', None),
                    getattr(target_school, 'id', None),
                )
                return False

        # Check monthly quota
        thirty_days_ago = timezone.now() - timedelta(days=30)
        monthly_requests = AIRequest.objects.filter(
            user=user,
            created_at__gte=thirty_days_ago,
            status__in=['completed', 'processing']
        ).count()

        if monthly_requests >= monthly_limit:
            logger.warning(f"User {user.id} exceeded monthly AI quota")
            return False

        # Check daily quota
        today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        daily_requests = AIRequest.objects.filter(
            user=user,
            created_at__gte=today,
            status__in=['completed', 'processing']
        ).count()

        if daily_requests >= daily_limit:
            logger.warning(f"User {user.id} exceeded daily AI quota")
            return False

        return True

    except Exception as e:
        logger.error(f"Error checking AI quota: {e}")
        # Default to allowing if there's an error
        return True


def format_grades_data(grades_data):
    """Format grades data for prompt."""
    if not grades_data:
        return "No recent grades available"

    formatted = []
    for subject, grade_info in grades_data.items():
        if isinstance(grade_info, dict):
            formatted.append(f"- {subject}: {grade_info.get('grade', 'N/A')} (Trend: {grade_info.get('trend', 'stable')})")
        else:
            formatted.append(f"- {subject}: {grade_info}")

    return '\n'.join(formatted)


def format_attendance_pattern(pattern):
    """Format attendance pattern for prompt."""
    if not pattern:
        return "No recent pattern data"

    return ', '.join(pattern[-14:])  # Show last 14 days

from celery import shared_task
from django.utils import timezone
from django.db.models import Avg, Q
from datetime import timedelta
import logging

from .models import AIRequest, AIInsight
from .utils import call_groq_api as call_gemini_api  # noqa: F401 — alias kept for compatibility

logger = logging.getLogger(__name__)


@shared_task
def process_ai_request(request_id):
    """
    Celery task to process an AI request.
    Calls Groq API and saves the response.
    """
    from . import credit_engine

    try:
        ai_request = AIRequest.objects.get(id=request_id)
        ai_request.status = 'processing'
        ai_request.save(update_fields=['status', 'updated_at'])

        # Metered: the credits held when the request was accepted are settled
        # against what this call actually used, or returned if it fails.
        with credit_engine.metered(ai_request):
            result = call_gemini_api(ai_request.prompt, purpose=ai_request.request_type)
            if result['success']:
                ai_request.mark_completed(
                    response=result['response'],
                    tokens_used=result['tokens_used'],
                    processing_time_ms=result['processing_time_ms']
                )
            else:
                ai_request.mark_failed(result['error'])

        if result['success']:
            # Increment user's monthly AI request count
            increment_ai_request_count(ai_request.user)

            logger.info(f"AI Request {request_id} completed successfully")
            return {
                'status': 'success',
                'request_id': request_id,
                'tokens_used': result['tokens_used']
            }
        else:
            logger.error(f"AI Request {request_id} failed: {result['error']}")
            return {
                'status': 'error',
                'request_id': request_id,
                'error': result['error']
            }

    except AIRequest.DoesNotExist:
        logger.error(f"AI Request {request_id} not found")
        return {
            'status': 'error',
            'error': f'Request {request_id} not found'
        }
    except Exception as e:
        logger.error(f"Error processing AI request {request_id}: {e}")
        try:
            ai_request = AIRequest.objects.get(id=request_id)
            ai_request.mark_failed(str(e))
        except:
            pass
        return {
            'status': 'error',
            'request_id': request_id,
            'error': str(e)
        }


@shared_task
def generate_weekly_insights():
    """
    Generate AI insights for all schools.
    Runs weekly to create performance summaries and alerts.
    """
    try:
        from apps.schools.models import School
        from apps.students import api as students_api
        from apps.grades.models import Grade

        schools = School.objects.all()
        insights_created = 0

        for school in schools:
            # Get top performers
            top_performers = students_api.list_students(school=school).annotate(
                avg_grade=Avg('grades__score')
            ).filter(
                avg_grade__gte=85
            ).order_by('-avg_grade')[:10]

            if top_performers.exists():
                honour_roll = {
                    'students': [
                        {
                            'name': s.user.get_full_name(),
                            'average': float(s.avg_grade) if s.avg_grade else 0
                        }
                        for s in top_performers
                    ],
                    'count': top_performers.count()
                }

                insight = AIInsight.objects.create(
                    school=school,
                    insight_type='honour_roll_prediction',
                    title='Weekly Honour Roll',
                    description='Top performing students this week',
                    data=honour_roll,
                    target_role='principal,executive,teacher',
                    expires_at=timezone.now() + timedelta(days=7)
                )
                insights_created += 1

            # Check for attendance alerts
            from apps.attendance.models import AttendanceRecord

            low_attendance_students = []
            students = students_api.list_students(school=school)

            for student in students:
                week_ago = (timezone.now() - timedelta(days=7)).date()
                attendance_records = AttendanceRecord.objects.filter(
                    student=student,
                    session__date__gte=week_ago
                )

                if attendance_records.exists():
                    attendance_rate = (
                        attendance_records.filter(status='present').count() /
                        attendance_records.count() * 100
                    )

                    if attendance_rate < 75:
                        low_attendance_students.append({
                            'name': student.user.get_full_name(),
                            'attendance_rate': attendance_rate
                        })

            if low_attendance_students:
                alert = AIInsight.objects.create(
                    school=school,
                    insight_type='attendance_alert',
                    title='Low Attendance Alert',
                    description=f'{len(low_attendance_students)} students with low attendance',
                    data={'students': low_attendance_students},
                    target_role='principal,teacher,parent',
                    expires_at=timezone.now() + timedelta(days=7)
                )
                insights_created += 1

        logger.info(f"Generated {insights_created} insights")
        return {
            'status': 'success',
            'insights_created': insights_created
        }

    except Exception as e:
        logger.error(f"Error generating insights: {e}")
        return {
            'status': 'error',
            'error': str(e)
        }


@shared_task
def reset_monthly_ai_quotas():
    """
    Reset monthly AI request counts for all users.
    Runs on the first day of each month.
    """
    try:
        from apps.users.models import User

        # Reset ai_request_count
        User.objects.all().update(ai_request_count=0)

        logger.info("Monthly AI quotas reset for all users")
        return {
            'status': 'success',
            'message': 'Monthly quotas reset'
        }

    except Exception as e:
        logger.error(f"Error resetting monthly quotas: {e}")
        return {
            'status': 'error',
            'error': str(e)
        }


@shared_task
def predict_dropout_risk():
    """
    Analyze attendance and grades to identify students at risk of dropping out.
    Creates risk alerts for intervention.
    """
    try:
        from apps.students import api as students_api
        from apps.grades.models import Grade
        from apps.attendance.models import AttendanceRecord

        at_risk_students = []

        students = students_api.list_students()

        for student in students:
            risk_score = 0

            # Check attendance (30% weight)
            thirty_days_ago = (timezone.now() - timedelta(days=30)).date()
            attendance_records = AttendanceRecord.objects.filter(
                student=student,
                session__date__gte=thirty_days_ago
            )

            if attendance_records.exists():
                attendance_rate = (
                    attendance_records.filter(status='present').count() /
                    attendance_records.count() * 100
                )
                if attendance_rate < 70:
                    risk_score += 30

            # Check grades (40% weight)
            recent_grades = Grade.objects.filter(
                student=student
            ).order_by('-created')[:5]

            if recent_grades.exists():
                avg_grade = sum([g.score for g in recent_grades]) / len(recent_grades)
                if avg_grade < 50:
                    risk_score += 40

            # Check behavioral issues (30% weight)
            # This would depend on your discipline model
            # For now, we'll assume no behavioral model
            # You can add this if your system tracks it

            # If risk score is high, create alert
            if risk_score >= 60:
                at_risk_students.append({
                    'student_id': student.id,
                    'student_name': student.user.get_full_name(),
                    'risk_score': risk_score,
                    'school_id': student.school.id if hasattr(student, 'school') else None
                })

        # Create insights for high-risk students
        insights_created = 0
        for student_data in at_risk_students:
            school_id = student_data['school_id']
            if school_id:
                insight, created = AIInsight.objects.update_or_create(
                    school_id=school_id,
                    insight_type='dropout_risk',
                    defaults={
                        'title': f"Dropout Risk: {student_data['student_name']}",
                        'description': f"Risk score: {student_data['risk_score']}/100",
                        'data': student_data,
                        'target_role': 'principal,counselor,teacher',
                        'expires_at': timezone.now() + timedelta(days=30)
                    }
                )
                if created:
                    insights_created += 1

        logger.info(f"Identified {len(at_risk_students)} at-risk students")
        return {
            'status': 'success',
            'at_risk_count': len(at_risk_students),
            'insights_created': insights_created
        }

    except Exception as e:
        logger.error(f"Error predicting dropout risk: {e}")
        return {
            'status': 'error',
            'error': str(e)
        }


def increment_ai_request_count(user):
    """Helper function to increment user's AI request count."""
    try:
        from django.db.models import F
        user.__class__.objects.filter(id=user.id).update(
            ai_request_count=F('ai_request_count') + 1
        )
    except Exception as e:
        logger.error(f"Error incrementing AI request count: {e}")


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def generate_exam_questions_task(self, draft_id):
    from .exam_generation import generate_exam_questions
    from .models import AIExamDraft

    try:
        draft = AIExamDraft.objects.select_related('school', 'subject', 'school_class', 'ai_request').get(id=draft_id)
        success, error = generate_exam_questions(draft)
        if not success:
            logger.error("Exam generation failed for draft %s: %s", draft_id, error)
    except AIExamDraft.DoesNotExist:
        logger.error("AIExamDraft %s not found", draft_id)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_career_report_task(self, report_id):
    from .career_service import generate_career_report
    from .models import CareerOrientationReport

    try:
        report = CareerOrientationReport.objects.select_related('student', 'student__school', 'user', 'ai_request').get(id=report_id)
        success, error = generate_career_report(report)
        if not success:
            logger.error("Career report failed for %s: %s", report_id, error)
    except CareerOrientationReport.DoesNotExist:
        logger.error("CareerOrientationReport %s not found", report_id)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_academic_roadmap_task(self, roadmap_id):
    from .models import AcademicRoadmap
    from .roadmap_service import generate_academic_roadmap

    try:
        roadmap = AcademicRoadmap.objects.select_related('student', 'student__school', 'student__user', 'ai_request').get(id=roadmap_id)
        success, error = generate_academic_roadmap(roadmap)
        if not success:
            logger.error("Academic roadmap failed for %s: %s", roadmap_id, error)
    except AcademicRoadmap.DoesNotExist:
        logger.error("AcademicRoadmap %s not found", roadmap_id)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_skill_gap_report_task(self, report_id):
    from .models import SkillGapReport
    from .skill_gap_service import generate_skill_gap_report

    try:
        report = SkillGapReport.objects.select_related(
            'student',
            'student__school',
            'student__user',
            'sequence',
            'ai_request',
        ).get(id=report_id)
        success, error = generate_skill_gap_report(report)
        if not success:
            logger.error("Skill gap report failed for %s: %s", report_id, error)
    except SkillGapReport.DoesNotExist:
        logger.error("SkillGapReport %s not found", report_id)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_student_guidance_report_task(self, report_id):
    from .guidance_service import generate_student_guidance_report
    from .models import StudentGuidanceReport

    try:
        report = StudentGuidanceReport.objects.select_related(
            'student',
            'student__school',
            'student__user',
            'generated_by',
            'ai_request',
        ).get(id=report_id)
        success, error = generate_student_guidance_report(report)
        if not success:
            logger.error("Student guidance report failed for %s: %s", report_id, error)
    except StudentGuidanceReport.DoesNotExist:
        logger.error("StudentGuidanceReport %s not found", report_id)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task
def release_stale_ai_credit_holds():
    """Return credits held by requests that died without finishing.

    A worker killed mid-request never settles its hold. Without this, those
    credits would stay set aside for good.
    """
    from .credit_engine import release_stale_holds

    released = release_stale_holds()
    if released:
        logger.warning('Released %s stale AI credit holds', released)
    return {'released': released}


@shared_task
def expire_unused_free_credits():
    """Expire each account's unused daily free credits once the day turns.

    Daily free credits do not roll over: whatever a person does not use is gone
    at the end of their day (midnight in the credit timezone). The reset is
    otherwise lazy, applied only when they next use the app, so this scheduled
    sweep guarantees the expiry lands within the day even for people who never
    opened the app — nothing piles up.
    """
    from .credit_engine import run_daily_free_expiry

    rolled = run_daily_free_expiry()
    if rolled:
        logger.info('Daily free-credit expiry rolled over %s accounts', rolled)
    return {'rolled_over': rolled}

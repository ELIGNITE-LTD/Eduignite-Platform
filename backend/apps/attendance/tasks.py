from celery import shared_task
from django.utils import timezone
from django.core.mail import send_mail
from django.template.loader import render_to_string
from datetime import timedelta
from .models import AttendanceRecord, AttendanceSession
from apps.students import api as students_api


@shared_task
def notify_parents_of_absence():
    """Runs daily, sends notification to parents of absent students"""
    today = timezone.now().date()

    # Get all absent records from today
    absent_records = AttendanceRecord.objects.filter(
        session__date=today,
        status='absent',
        notified_parent=False
    ).select_related('student', 'session')

    for record in absent_records:
        # Every adult responsible for this student (parent links and guardians).
        for parent in students_api.get_guardian_users(record.student):
            if not getattr(parent, 'email', ''):
                continue
            try:
                subject = f"Attendance Notice: {record.student.user.get_full_name()} absent on {today}"
                context = {
                    'student_name': record.student.user.get_full_name(),
                    'date': record.session.date,
                    'period': record.session.get_period_display(),
                    'parent_name': parent.get_full_name(),
                }
                message = render_to_string('attendance_notification.html', context)

                send_mail(
                    subject,
                    message,
                    'EduIgnite <eduignitecmr@gmail.com>',
                    [parent.email],
                    html_message=message,
                    fail_silently=True,
                )

                record.notified_parent = True
                record.save()

            except Exception as e:
                print(f"Error notifying parent: {str(e)}")
                continue


@shared_task
def generate_monthly_attendance_report():
    """Creates monthly attendance summary report"""
    from django.db.models import Count, Q
    from apps.schools.models import School

    today = timezone.now().date()
    month_start = today.replace(day=1)

    schools = School.objects.all()

    for school in schools:
        students = students_api.list_students(school=school)

        report_data = []
        for student in students:
            records = AttendanceRecord.objects.filter(
                student=student,
                session__date__gte=month_start,
                session__date__lte=today
            )

            total = records.count()
            present = records.filter(status='present').count()
            absent = records.filter(status='absent').count()
            late = records.filter(status='late').count()

            if total > 0:
                percentage = (present + late) / total * 100
            else:
                percentage = 0

            report_data.append({
                'student': student,
                'total_days': total,
                'present': present,
                'absent': absent,
                'late': late,
                'percentage': percentage,
            })

        # Store or send report
        # This can be extended to save to a report model or send email

    return f"Monthly report generated for {schools.count()} schools"

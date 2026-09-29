from celery import shared_task
from django.utils import timezone
from .models import AttendanceRecord, AttendanceSession
from apps.students import api as students_api

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

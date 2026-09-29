from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count, F, Prefetch
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from apps.schools.relations import build_class_match_q, resolve_school_class
from apps.students import api as students_api
from apps.platform.access import (
    filter_student_related_by_platform_access,
    filter_students_by_platform_access,
    student_platform_charge_is_paid,
    user_platform_charge_is_paid,
)
from . import history_report
from .models import AttendanceSession, AttendanceRecord, TeacherAttendance
from .serializers import (
    AttendanceSessionSerializer, AttendanceRecordSerializer, BulkAttendanceSerializer,
    AttendanceSummarySerializer, TeacherAttendanceSerializer, ClassAttendanceReportSerializer
)
from apps.registry.permissions import RequiresApp


def _truthy_query_param(request, name):
    return str(request.query_params.get(name, '')).lower() in {'1', 'true', 'yes', 'on'}


def _current_class_attendance_filter():
    return (
        Q(session__school_class_id=F('student__school_class_id'))
        | Q(session__student_class=F('student__student_class'))
    )


class AttendanceSessionViewSet(viewsets.ModelViewSet):
    queryset = AttendanceSession.objects.select_related('teacher', 'subject', 'school')
    serializer_class = AttendanceSessionSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('attendance')]

    def get_queryset(self):
        user = self.request.user
        # AttendanceRecordSerializer renders student.user, session.subject and
        # session.teacher for every record. A bare prefetch_related('records')
        # loads the records but not those relations, and re-fetches 'session'
        # from scratch per record even though it's the same parent object
        # already in memory -- for a 40-student class session that's on the
        # order of 150-200 extra queries to render one session.
        records_queryset = AttendanceRecord.objects.select_related(
            'student__user', 'session__subject', 'session__teacher'
        )
        queryset = AttendanceSession.objects.select_related('teacher', 'subject', 'school').prefetch_related(
            Prefetch('records', queryset=records_queryset)
        )

        if user.role == 'TEACHER':
            queryset = queryset.filter(teacher=user)
        elif user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            queryset = queryset.filter(school=user.school)
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role != 'TEACHER':
            raise PermissionDenied("Only teachers can create attendance sessions.")

        request.data['teacher'] = request.user.id
        request.data['school'] = request.user.school.id
        return super().create(request, *args, **kwargs)


class AttendanceRecordViewSet(viewsets.ModelViewSet):
    queryset = AttendanceRecord.objects.select_related('session', 'student')
    serializer_class = AttendanceRecordSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('attendance')]

    def get_queryset(self):
        user = self.request.user
        queryset = filter_student_related_by_platform_access(
            AttendanceRecord.objects.select_related('session', 'student')
        )

        if user.role == 'TEACHER':
            queryset = queryset.filter(session__teacher=user)
        elif user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            queryset = queryset.filter(session__school=user.school)
        elif user.role == 'STUDENT':
            if not user_platform_charge_is_paid(user):
                return queryset.none()
            queryset = queryset.filter(student__user=user)
            if not _truthy_query_param(self.request, 'include_history'):
                queryset = queryset.filter(_current_class_attendance_filter())
        elif user.role == 'PARENT':
            linked_students = students_api.list_student_ids_for_guardian(user)
            queryset = queryset.filter(student_id__in=linked_students)
            if not _truthy_query_param(self.request, 'include_history'):
                queryset = queryset.filter(_current_class_attendance_filter())
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role != 'TEACHER':
            raise PermissionDenied("Only teachers can create attendance records.")
        return super().create(request, *args, **kwargs)

    def _summary_queryset_for_user(self, request):
        user = request.user
        queryset = filter_student_related_by_platform_access(AttendanceRecord.objects.select_related(
            'session',
            'session__school_class',
            'student',
            'student__user',
        ))
        if user.role == 'TEACHER':
            return queryset.filter(session__teacher=user)
        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            return queryset.filter(session__school=user.school)
        if user.role == 'STUDENT':
            if not user_platform_charge_is_paid(user):
                return queryset.none()
            queryset = queryset.filter(student__user=user)
            if not _truthy_query_param(request, 'include_history'):
                queryset = queryset.filter(_current_class_attendance_filter())
            return queryset
        if user.role == 'PARENT':
            linked_students = students_api.list_student_ids_for_guardian(user)
            queryset = queryset.filter(student_id__in=linked_students)
            if not _truthy_query_param(request, 'include_history'):
                queryset = queryset.filter(_current_class_attendance_filter())
            return queryset
        return queryset.none()

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Role-aware attendance statistics for dashboards."""
        records = self._summary_queryset_for_user(request)
        student_id = request.query_params.get('student_id')
        class_id = request.query_params.get('class_id') or request.query_params.get('school_class')
        class_name = request.query_params.get('class_name')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if student_id:
            records = records.filter(student_id=student_id)
        if class_id:
            records = records.filter(session__school_class_id=class_id)
        if class_name:
            records = records.filter(Q(session__student_class=class_name) | Q(student__student_class=class_name))
        if start_date:
            records = records.filter(session__date__gte=start_date)
        if end_date:
            records = records.filter(session__date__lte=end_date)

        total = records.count()
        present = records.filter(status='present').count()
        late = records.filter(status='late').count()
        absent = records.filter(status='absent').count()
        excused = records.filter(status='excused').count()
        attendance_percentage = round(((present + late) / total) * 100, 2) if total else 0

        class_rows = []
        class_summary = records.values(
            'session__school_class_id',
            'session__school_class__name',
            'session__student_class',
        ).annotate(
            total=Count('id'),
            present=Count('id', filter=Q(status='present')),
            late=Count('id', filter=Q(status='late')),
            absent=Count('id', filter=Q(status='absent')),
            excused=Count('id', filter=Q(status='excused')),
        ).order_by('session__student_class')
        for row in class_summary:
            row_total = row['total'] or 0
            class_rows.append({
                'class_id': str(row['session__school_class_id']) if row['session__school_class_id'] else None,
                'class_name': row['session__school_class__name'] or row['session__student_class'] or 'Unassigned',
                'total': row_total,
                'present': row['present'],
                'late': row['late'],
                'absent': row['absent'],
                'excused': row['excused'],
                'attendance_percentage': round(((row['present'] + row['late']) / row_total) * 100, 2) if row_total else 0,
            })

        today = timezone.now().date()
        today_records = records.filter(session__date=today)

        return Response({
            'total_records': total,
            'present': present,
            'late': late,
            'absent': absent,
            'excused': excused,
            'attendance_percentage': attendance_percentage,
            'sessions_count': records.values('session_id').distinct().count(),
            'students_tracked': records.values('student_id').distinct().count(),
            'today_absent': today_records.filter(status='absent').count(),
            'today_total': today_records.count(),
            'class_summary': class_rows,
        })

    @action(detail=False, methods=['get'], url_path='history-report/options')
    def history_report_options(self, request):
        """What the attendance history filters can offer this user, and nothing more."""
        return Response(history_report.report_options(request.user))

    @action(detail=False, methods=['get'], url_path='history-report')
    def history_report(self, request):
        """Attendance history for the official PDF, scoped to this user on the server."""
        return Response(history_report.build_report(request.user, request.query_params))

    @action(detail=False, methods=['post'])
    def bulk_record(self, request):
        """Teacher records entire class at once"""
        if request.user.role != 'TEACHER':
            raise PermissionDenied("Only teachers can record attendance.")

        student_class = request.data.get('student_class') or request.data.get('class_name')
        school_class = resolve_school_class(
            request.user.school,
            school_class_id=request.data.get('school_class'),
            class_name=student_class,
        )
        if school_class:
            student_class = school_class.name
        date = request.data.get('date')
        period = request.data.get('period', 'full_day')
        subject_id = request.data.get('subject')
        record_items = request.data.get('records', [])

        if not student_class or not date or not record_items:
            raise ValidationError("student_class, date, and records are required.")

        session, _ = AttendanceSession.objects.update_or_create(
            teacher=request.user,
            school=request.user.school,
            student_class=student_class,
            date=date,
            period=period,
            defaults={
                'school_class': school_class,
                'subject_id': subject_id or None,
            },
        )
        student_queryset = students_api.list_students(school=request.user.school)
        if school_class:
            student_queryset = student_queryset.filter(school_class=school_class)
        else:
            student_queryset = student_queryset.filter(student_class=student_class)
        locked_student_ids = {
            str(student.id)
            for student in student_queryset.select_related('user')
            if not student_platform_charge_is_paid(student)
        }
        valid_student_ids = {
            str(student_id)
            for student_id in filter_students_by_platform_access(student_queryset).values_list('id', flat=True)
        }
        records = []
        for item in record_items:
            student_id = str(item.get('student'))
            if student_id in locked_student_ids:
                raise PermissionDenied("Attendance cannot be recorded for students whose platform charges are unpaid.")
            if student_id not in valid_student_ids:
                raise ValidationError(f"Student {student_id} does not belong to the selected class.")
            record, _ = AttendanceRecord.objects.update_or_create(
                session=session,
                student_id=student_id,
                defaults={
                    'status': item.get('status', 'present'),
                    'excuse_note': item.get('excuse_note', ''),
                },
            )
            records.append(record)

        # Notify parents/guardians about absence or lateness, naming the child and
        # the subject the attendance was taken in.
        try:
            from apps.notifications.utils import notify_users

            flagged = [record for record in records if record.status in ('absent', 'late')]
            if flagged:
                subject_label = session.subject.name if session.subject_id else None
                where = f'in {subject_label}' if subject_label else 'in class'
                date_label = session.date.isoformat() if hasattr(session.date, 'isoformat') else str(session.date)
                notified_ids = []
                for record in flagged:
                    student = record.student
                    child_name = student.user.get_full_name() if student.user_id else 'Your child'
                    first_name = (child_name or 'Your child').split(' ')[0]
                    parents = [
                        parent
                        for parent in students_api.get_guardian_users(student)
                        if parent and getattr(parent, 'is_active', True)
                    ]
                    if not parents:
                        continue
                    if record.status == 'absent':
                        title = f"{first_name} was marked absent"
                        message = f"{child_name} was marked absent {where} on {date_label}."
                    else:
                        title = f"{first_name} was marked late"
                        message = f"{child_name} was marked late {where} on {date_label}."
                    notify_users(parents, title, message, notification_type='attendance', sender=request.user)
                    notified_ids.append(record.id)
                if notified_ids:
                    AttendanceRecord.objects.filter(id__in=notified_ids).update(notified_parent=True)
        except Exception:  # noqa: BLE001 — notifications must never block recording
            pass

        return Response({
            'session': AttendanceSessionSerializer(session).data,
            'records': AttendanceRecordSerializer(records, many=True).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def my_attendance(self, request):
        """Student sees own attendance"""
        if request.user.role != 'STUDENT':
            raise PermissionDenied("Only students can view their own attendance.")

        student = students_api.get_student_for_user(request.user)
        if student is None:
            return Response({'error': 'Student profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        records = self.get_queryset().filter(student=student).order_by('-session__date')
        serializer = self.get_serializer(records, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def student_summary(self, request):
        """Attendance summary per student"""
        student_id = request.query_params.get('student_id')

        if not student_id:
            return Response(
                {'error': 'student_id query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        student = students_api.get_student(student_id)
        if student is None:
            return Response({'error': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not student_platform_charge_is_paid(student):
            raise PermissionDenied("This student's platform charges are unpaid. Attendance details remain locked until the charge is cleared.")

        # Check permissions
        if request.user.role == 'STUDENT':
            if student.user != request.user:
                raise PermissionDenied("You can only view your own attendance summary.")
        elif request.user.role == 'PARENT':
            if not students_api.is_guardian_of(request.user, student):
                raise PermissionDenied("You can only view attendance for your linked children.")
        elif request.user.role not in ['TEACHER', 'SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Insufficient permissions.")

        records = AttendanceRecord.objects.filter(student=student)
        if request.user.role in ['STUDENT', 'PARENT'] and not _truthy_query_param(request, 'include_history'):
            records = records.filter(_current_class_attendance_filter())
        total_days = records.count()
        present_days = records.filter(status='present').count()
        absent_days = records.filter(status='absent').count()
        late_days = records.filter(status='late').count()
        excused_days = records.filter(status='excused').count()

        attendance_percentage = Decimal('0.00')
        if total_days > 0:
            attendance_percentage = Decimal(present_days + late_days) / Decimal(total_days) * 100
            attendance_percentage = attendance_percentage.quantize(Decimal('0.01'))

        data = {
            'student_id': str(student.id),
            'student_name': student.user.get_full_name(),
            'student_admission': student.admission_number,
            'total_days': total_days,
            'present_days': present_days,
            'absent_days': absent_days,
            'late_days': late_days,
            'excused_days': excused_days,
            'attendance_percentage': float(attendance_percentage),
        }
        serializer = AttendanceSummarySerializer(data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def class_report(self, request):
        """Date-range report for a class"""
        class_name = request.query_params.get('class_name')
        class_id = request.query_params.get('class_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        school_class = resolve_school_class(
            request.user.school,
            school_class_id=class_id,
            class_name=class_name,
        )
        if school_class:
            class_name = school_class.name

        if not class_name and not school_class:
            return Response(
                {'error': 'class_name or class_id query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied("Only school staff can view class reports.")

        sessions = AttendanceSession.objects.filter(school=request.user.school).filter(
            build_class_match_q(
                'school_class',
                'student_class',
                school_class_id=getattr(school_class, 'id', None),
                class_name=class_name,
            )
        )

        if start_date:
            sessions = sessions.filter(date__gte=start_date)
        if end_date:
            sessions = sessions.filter(date__lte=end_date)

        records = filter_student_related_by_platform_access(
            AttendanceRecord.objects.filter(session__in=sessions).select_related('session', 'student')
        )

        summary = {}
        for record in records:
            student_id = str(record.student.id)
            if student_id not in summary:
                summary[student_id] = {
                    'id': student_id,
                    'name': record.student.user.get_full_name(),
                    'present': 0,
                    'absent': 0,
                    'late': 0,
                    'excused': 0,
                    'total': 0,
                }
            summary[student_id]['total'] += 1
            summary[student_id][record.status] += 1

        data = []
        for item in summary.values():
            attendance_value = item['present'] + item['late']
            item['percentage'] = round((attendance_value / item['total']) * 100, 2) if item['total'] else 0
            data.append(item)

        return Response(data)

    @action(detail=False, methods=['get'])
    def absent_students_today(self, request):
        """List of absent students for today"""
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER']:
            raise PermissionDenied("Only school staff can view this information.")

        today = timezone.now().date()
        sessions = AttendanceSession.objects.filter(date=today, school=request.user.school)
        absent_records = filter_student_related_by_platform_access(
            AttendanceRecord.objects.filter(session__in=sessions, status='absent').select_related('student', 'session')
        )

        data = []
        for record in absent_records:
            data.append({
                'id': str(record.student.id),
                'name': record.student.user.get_full_name(),
                'avatar': getattr(record.student.user, 'avatar', None),
                'admission_number': record.student.admission_number,
                'class': record.student.student_class,
                'period': record.session.period,
                'parent_notified': record.notified_parent,
            })

        return Response(data)


class TeacherAttendanceViewSet(viewsets.ModelViewSet):
    queryset = TeacherAttendance.objects.select_related('teacher', 'noted_by', 'school')
    serializer_class = TeacherAttendanceSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('attendance')]

    def get_queryset(self):
        user = self.request.user
        queryset = TeacherAttendance.objects.select_related('teacher', 'noted_by', 'school')

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            queryset = queryset.filter(school=user.school)
        elif user.role == 'TEACHER':
            queryset = queryset.filter(teacher=user)
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Only school administrators can record teacher attendance.")

        request.data['school'] = request.user.school.id
        request.data['noted_by'] = request.user.id
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN']:
            raise PermissionDenied("Only school administrators can update teacher attendance.")
        return super().update(request, *args, **kwargs)

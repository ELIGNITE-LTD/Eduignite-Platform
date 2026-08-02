from django.contrib import admin
from .models import AttendanceSession, AttendanceRecord, TeacherAttendance


@admin.register(AttendanceSession)
class AttendanceSessionAdmin(admin.ModelAdmin):
    list_display = ['student_class', 'date', 'period', 'teacher', 'school']
    list_filter = ['school', 'date', 'period', 'created']
    search_fields = ['student_class', 'teacher__first_name', 'teacher__last_name']
    readonly_fields = ['id', 'created', 'modified']


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ['student', 'session', 'status', 'notified_parent']
    list_filter = ['status', 'session__date', 'notified_parent', 'created']
    search_fields = ['student__admission_number', 'student__user__first_name', 'student__user__last_name']
    readonly_fields = ['id', 'created', 'modified']


@admin.register(TeacherAttendance)
class TeacherAttendanceAdmin(admin.ModelAdmin):
    list_display = ['teacher', 'date', 'status', 'check_in_time', 'check_out_time']
    list_filter = ['school', 'date', 'status']
    search_fields = ['teacher__first_name', 'teacher__last_name']
    readonly_fields = ['id', 'created', 'modified']

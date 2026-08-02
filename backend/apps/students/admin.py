from django.contrib import admin
from .models import Student, ParentStudentLink


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ['admission_number', 'user', 'student_class', 'school', 'is_on_honour_roll']
    list_filter = ['school', 'class_level', 'section', 'is_on_honour_roll', 'created']
    search_fields = ['admission_number', 'user__first_name', 'user__last_name', 'user__email']
    readonly_fields = ['id', 'created', 'modified', 'qr_code']
    fieldsets = (
        ('User Information', {
            'fields': ('id', 'user', 'school')
        }),
        ('Class Information', {
            'fields': ('student_class', 'class_level', 'section')
        }),
        ('Personal Information', {
            'fields': ('date_of_birth', 'gender', 'admission_number', 'admission_date')
        }),
        ('Guardian Information', {
            'fields': ('guardian_name', 'guardian_phone', 'guardian_whatsapp')
        }),
        ('Academic Information', {
            'fields': ('annual_average', 'is_on_honour_roll', 'qr_code')
        }),
        ('Timestamps', {
            'fields': ('created', 'modified'),
            'classes': ('collapse',)
        })
    )


@admin.register(ParentStudentLink)
class ParentStudentLinkAdmin(admin.ModelAdmin):
    list_display = ['parent', 'student', 'relationship', 'is_primary']
    list_filter = ['relationship', 'is_primary', 'created']
    search_fields = ['parent__first_name', 'parent__last_name', 'student__admission_number', 'student__user__first_name']
    readonly_fields = ['id', 'created', 'modified']

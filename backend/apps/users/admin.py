from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

User = get_user_model()


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Custom User admin."""

    list_display = ('matricule', 'name', 'email', 'role', 'school', 'is_active', 'is_license_paid')
    list_filter = ('role', 'is_active', 'is_license_paid', 'date_joined')
    search_fields = ('matricule', 'name', 'email', 'phone')
    ordering = ('-date_joined',)

    fieldsets = (
        (None, {'fields': ('id', 'matricule', 'password', 'uid')}),
        ('Personal Info', {'fields': ('name', 'email', 'phone', 'whatsapp', 'avatar')}),
        ('Role & School', {'fields': ('role', 'school')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('License & AI', {'fields': ('is_license_paid', 'ai_request_count')}),
        ('Academic', {'fields': ('annual_avg',)}),
        ('Important Dates', {'fields': ('date_joined', 'last_login')}),
    )

    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('matricule', 'password1', 'password2')}),
        ('Personal Info', {'fields': ('name', 'email', 'phone')}),
        ('Role & School', {'fields': ('role', 'school')}),
    )

    readonly_fields = ('id', 'date_joined', 'last_login')
    filter_horizontal = ('groups', 'user_permissions')

from django.contrib import admin

from .models import ProprietorActionLog, ProprietorSchoolLink


@admin.register(ProprietorSchoolLink)
class ProprietorSchoolLinkAdmin(admin.ModelAdmin):
    list_display = ('proprietor', 'school', 'created_by', 'created_at')
    search_fields = ('proprietor__matricule', 'proprietor__name', 'school__name')
    raw_id_fields = ('proprietor', 'school', 'created_by')


@admin.register(ProprietorActionLog)
class ProprietorActionLogAdmin(admin.ModelAdmin):
    """The audit trail is read-only."""

    list_display = ('created_at', 'action', 'actor', 'proprietor', 'school', 'target_user', 'ip_address')
    list_filter = ('action',)
    search_fields = ('proprietor__matricule', 'actor__matricule', 'detail')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

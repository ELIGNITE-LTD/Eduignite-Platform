from django.apps import AppConfig


class SchoolSiteMediaConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.school_site_media'
    label = 'school_site_media'
    verbose_name = 'School website events and gallery'

    def ready(self):
        from . import signals  # noqa: F401

from django.apps import AppConfig


class SchoolsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.schools'
    label = 'schools'
    verbose_name = 'Schools'

    def ready(self):
        """Import signals when app is ready."""
        pass

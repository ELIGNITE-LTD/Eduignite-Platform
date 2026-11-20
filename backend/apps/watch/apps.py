from django.apps import AppConfig


class WatchConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.watch'
    verbose_name = 'Security and system watch'

    def ready(self):
        from . import signals  # noqa: F401  (connects the background-task failure signal)

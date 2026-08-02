"""Discovers every app's declaration at startup.

Django already walks INSTALLED_APPS, so the registry piggybacks on that: each
EduIgnite app that declares itself puts an ``eduignite_app.py`` beside its
models, and importing it runs the ``register(...)`` call.

Discovery happens in ``ready()``, which means a broken declaration stops the
server rather than producing a platform that is quietly missing a feature.
"""

from importlib import import_module

from django.apps import AppConfig, apps as django_apps


class RegistryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.registry'
    label = 'registry'
    verbose_name = 'App Registry'

    def ready(self):
        for app_config in django_apps.get_app_configs():
            if not app_config.name.startswith('apps.'):
                continue
            try:
                import_module(f'{app_config.name}.eduignite_app')
            except ModuleNotFoundError as exc:
                # The app simply does not declare itself — that is allowed.
                # Anything else is a real import error inside the declaration
                # and must not be swallowed.
                if exc.name not in (
                    f'{app_config.name}.eduignite_app',
                    f'{app_config.name}',
                ):
                    raise

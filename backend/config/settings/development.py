from .base import *

DEBUG = True

ALLOWED_HOSTS = ['*']

CORS_ALLOW_ALL_ORIGINS = True

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# django-debug-toolbar is omitted here: it injects HTML into browsable API/schema pages
# and breaks with NoReverseMatch ('djdt') under ASGI/Daphne. Use Django admin, logs,
# or drf-spectacular at /api/docs/ for inspection instead.

LOGGING['loggers']['django']['level'] = 'DEBUG'
LOGGING['loggers']['apps']['level'] = 'DEBUG'

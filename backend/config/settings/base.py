import os
from pathlib import Path
from datetime import timedelta
from decimal import Decimal
from django.core.exceptions import ImproperlyConfigured
from decouple import AutoConfig, Csv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
config = AutoConfig(search_path=BASE_DIR)


def env_flag(name: str) -> bool:
    return os.environ.get(name, '').lower() in {'1', 'true', 'yes', 'on'}


IS_RENDER = env_flag('RENDER')


def require_env(name: str, message: str = None) -> str:
    value = config(name, default='')
    if value == '':
        raise ImproperlyConfigured(message or f'{name} is required and has no fallback default.')
    return value


# No insecure default: a deployment that forgets to set this must fail to
# start, not silently sign every JWT with a hardcoded string that is public
# in this file -- that would let anyone forge an access token for any user.
SECRET_KEY = require_env('DJANGO_SECRET_KEY')

DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config(
    'ALLOWED_HOSTS',
    default='localhost,127.0.0.1,api.eduignite.online',
    cast=Csv(),
)

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
    'channels',
    'django_celery_beat',
    'django_celery_results',
    'django_extensions',
    # EduIgnite apps
    'apps.authentication',
    'apps.users',
    'apps.schools',
    'apps.students',
    'apps.assignments',
    'apps.grades',
    'apps.attendance',
    'apps.fees',
    'apps.library',
    'apps.announcements',
    'apps.community',
    'apps.chat',
    'apps.ai_features',
    'apps.bots',
    'apps.orders',
    'apps.platform',
    'apps.feedback',
    'apps.support',
    'apps.staff_remarks',
    'apps.live_classes',
    'apps.exams',
    'apps.notifications',
    'apps.app_store',
    'apps.relationships',
    'apps.config',
    'apps.registry',
    'apps.offline_licensing',
    'apps.academy',
    'apps.surveys',
    'apps.partners',
    'apps.proprietors',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # Compress API/JSON responses so they travel smaller over slow mobile links.
    'django.middleware.gzip.GZipMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.RequestLoggingMiddleware',
    'core.middleware.SchoolContextMiddleware',
    # Answers a repeated write with its original answer, so work queued on a
    # device with no connection cannot be recorded twice when it is sent.
    'core.idempotency.IdempotencyMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

ASGI_APPLICATION = 'config.asgi.application'

DB_CONN_MAX_AGE = config('DB_CONN_MAX_AGE', default=600, cast=int)
RDS_DEFAULT_HOST = 'eduignite-db.covciwuwadhr.us-east-1.rds.amazonaws.com'


_DB_REQUIRED_MESSAGE = (
    '{name} is required. EduIgnite is configured for PostgreSQL/RDS only; '
    'SQLite and database fallback configuration are intentionally disabled.'
)

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': require_env('DB_NAME', _DB_REQUIRED_MESSAGE.format(name='DB_NAME')),
        'USER': require_env('DB_USER', _DB_REQUIRED_MESSAGE.format(name='DB_USER')),
        'PASSWORD': require_env('DB_PASSWORD', _DB_REQUIRED_MESSAGE.format(name='DB_PASSWORD')),
        'HOST': config('DB_HOST', default=RDS_DEFAULT_HOST),
        'PORT': config('DB_PORT', default='5432'),
        'CONN_MAX_AGE': DB_CONN_MAX_AGE,
        'OPTIONS': {
            'sslmode': config('DB_SSLMODE', default='require'),
        },
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# The password-reset email tells the user their link is valid for 5 minutes;
# this makes that true for django.contrib.auth.tokens.default_token_generator,
# which apps.authentication.views uses to issue and check reset tokens
# (Django's default here is 3 days, which would silently contradict the email).
PASSWORD_RESET_TIMEOUT = 300

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
# Private files (admission documents): never served by MEDIA_URL, only streamed
# through a signed, short-lived, authenticated download. Must be on persistent
# storage in production.
PRIVATE_MEDIA_ROOT = config('PRIVATE_MEDIA_ROOT', default=str(BASE_DIR / 'private_media'))

# Chat attachments travel as base64 data-URLs inside JSON bodies (WebView
# clients cannot send multipart). A 10 MB file becomes ~13.4 MB of JSON, so
# lift Django's default 2.5 MB request-body cap or photo uploads 400.
DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'users.User'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.authentication.jwt_auth.SessionAwareJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    # The three DRF defaults, plus a parser that accepts an upload encoded as a
    # base64 JSON envelope. The Capacitor mobile build sends uploads that way
    # (CapacitorHttp cannot send real multipart file bodies); the parser only
    # matches its one content type, so web and desktop uploads are unaffected.
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
        'core.parsers.Base64MultipartParser',
    ],
    # Rate limiting. Every endpoint gets a generous ceiling that legitimate use
    # (even a busy admin dashboard) never reaches, but that stops a single IP or
    # account from scraping or flooding the API. Sensitive endpoints add their
    # own strict, named scopes (see DEFAULT_THROTTLE_RATES) via ScopedRateThrottle.
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '120/min',
        'user': '20000/hour',
        # Brute-forcing a matricule/password: a human mistypes a few times, a
        # bot tries thousands. Ten a minute per IP stops the bot cold.
        'login': '10/min',
        # Mobile-money initiators raise a real prompt on a real phone, so they
        # are capped per account: enough to retry a mistyped number, far too
        # little to spam a victim's line or rack up gateway cost in a loop.
        'payment': '15/min',
        # Password-reset and activation trigger emails — capped hard so they
        # cannot be used to spam a victim's inbox or enumerate accounts.
        'password_reset': '5/hour',
        'activation': '10/hour',
        # AI calls cost real money (Groq). Fluid for a human, a wall for a script.
        'ai': '30/min',
        # Public, unauthenticated school search (offline installer wizard,
        # step 2 — finding a school before the technician has any login).
        # Generous enough for a human typing/backspacing while they narrow
        # down a name, tight enough that it cannot be used to scrape the
        # school directory at volume from a single IP.
        'school_search': '60/min',
        # Public school website endpoints (profile, staff, directory): anonymous
        # and cacheable, so one IP gets a generous but bounded rate.
        'public_site': '120/min',
        # Public admission form submissions: per IP. The per phone / email limit
        # (3 a day per school) is enforced in apps.schools.admissions_services.
        'enrollment': '5/hour',
        # AllowAny (no auth), an anonymous auth endpoint that would otherwise
        # fall back to the generic 'anon' rate. Generous enough for normal
        # multi-device refresh traffic, capped enough to stop it being used
        # to hammer the token-verification path from a single IP.
        'refresh': '30/min',
        # Public QR verification pages (ID card, report card, fee receipt).
        # A person scanning a stack of documents needs well over a handful a
        # minute; a bot walking admission numbers does not get to.
        'public_verify': '60/min',
        # Proprietor credential reset re-checks the proprietor's own password.
        'proprietor_credentials': '10/min',
        'proprietor_read': '120/min',
    },
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'EXCEPTION_HANDLER': 'core.exceptions.custom_exception_handler',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'VERIFYING_KEY': None,
    'AUDIENCE': None,
    'ISSUER': None,
    'JTI_CLAIM': 'jti',
    'TOKEN_TYPE_CLAIM': 'token_type',
    'JTI_CLAIM': 'jti',
    'SLIDING_TOKEN_REFRESH_EXP_CLAIM': 'refresh_exp',
    'SLIDING_TOKEN_LIFETIME': timedelta(minutes=5),
    'SLIDING_TOKEN_REFRESH_LIFETIME': timedelta(days=1),
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'EduIgnite API',
    'DESCRIPTION': 'EduIgnite School Management Platform API - Complete educational management system with support for multi-school deployment, role-based access control, real-time communications, and comprehensive reporting.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SCHEMA_PATH_PREFIX': '/api/v1/',
    'ENUM_ADD_UNDERSCORES': True,
    'COMPONENT_SPLIT_REQUEST': True,
    'COMPONENT_DESCRIPTION_MAPPING': {
        'authentication': 'User authentication endpoints (login, token refresh, logout)',
        'users': 'User management endpoints',
        'schools': 'School management endpoints',
        'classes': 'Class and section management endpoints',
        'subjects': 'Subject and curriculum management endpoints',
        'students': 'Student management endpoints',
        'teachers': 'Teacher management endpoints',
        'parents': 'Parent management endpoints',
        'attendance': 'Student attendance tracking',
        'assessments': 'Academic assessments and grades',
        'fees': 'Fee management and payments',
        'communications': 'School communications and announcements',
        'library': 'Library resource management',
        'notifications': 'In-app notifications',
        'chat': 'Real-time chat and messaging',
        'reports': 'Academic and administrative reports',
    },
}

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='https://eduignite.com,https://www.eduignite.com,https://admin.eduignite.com,https://dashboard.eduignite.com',
    cast=Csv()
)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    # The apps send these on every write. A custom header the browser has
    # not been told to allow makes it block the request outright, before it
    # is ever sent, which the app can only report as a network error - so
    # leaving one out here breaks signing in from the web while browsing
    # carries on working, since reads send no custom headers.
    'idempotency-key',
    'x-offline-recorded-at',
    'x-eduignite-replay',
    # AI credits: the app can show a cost and ask first, and the person said yes.
    'x-ai-credits-client',
    'x-ai-credits-confirm',
]

REDIS_URL = config('REDIS_URL', default='')
REDIS_HOST = config('REDIS_HOST', default='')
REDIS_PORT = config('REDIS_PORT', default=6379, cast=int)

if REDIS_URL or REDIS_HOST:
    redis_location = REDIS_URL or f'redis://{REDIS_HOST}:{REDIS_PORT}/1'
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [REDIS_URL or (REDIS_HOST, REDIS_PORT)],
                'capacity': 1500,
                'expiry': 10,
            },
        },
    }
    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': redis_location,
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
                'CONNECTION_POOL_KWARGS': {
                    'max_connections': 50,
                    'retry_on_timeout': True,
                },
            },
        }
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'eduignite-local-cache',
        }
    }

default_celery_broker = ''
if REDIS_URL:
    default_celery_broker = REDIS_URL.rsplit('/', 1)[0] + '/0' if '/' in REDIS_URL else REDIS_URL

CELERY_BROKER_URL = config('CELERY_BROKER_URL', default=default_celery_broker)
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default=CELERY_BROKER_URL)
CELERY_ACCEPT_CONTENT = ['application/json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60
CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60
CELERY_TASK_ALWAYS_EAGER = config(
    'CELERY_TASK_ALWAYS_EAGER',
    default=False,
    cast=bool,
)
CELERY_TASK_EAGER_PROPAGATES = config(
    'CELERY_TASK_EAGER_PROPAGATES',
    default=CELERY_TASK_ALWAYS_EAGER,
    cast=bool,
)
CELERY_BROKER_CONNECTION_TIMEOUT = config('CELERY_BROKER_CONNECTION_TIMEOUT', default=2, cast=int)
CELERY_TASK_PUBLISH_RETRY = config('CELERY_TASK_PUBLISH_RETRY', default=False, cast=bool)
CELERY_TASK_PUBLISH_RETRY_POLICY = {
    'max_retries': config('CELERY_TASK_PUBLISH_MAX_RETRIES', default=1, cast=int),
    'interval_start': 0,
    'interval_step': 0.2,
    'interval_max': 1,
}
AI_ALLOW_SYNC_FALLBACK = config('AI_ALLOW_SYNC_FALLBACK', default=False, cast=bool)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
        'simple': {
            'format': '{levelname} {asctime} {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'filters': {
        'require_debug_true': {
            '()': 'django.utils.log.RequireDebugTrue',
        },
        'require_debug_false': {
            '()': 'django.utils.log.RequireDebugFalse',
        },
    },
    'handlers': {
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        'file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'maxBytes': 1024 * 1024 * 10,
            'backupCount': 5,
            'formatter': 'verbose',
        },
        'celery_file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'celery.log',
            'maxBytes': 1024 * 1024 * 10,
            'backupCount': 5,
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': True,
        },
        'django.request': {
            'handlers': ['console', 'file'],
            'level': 'ERROR',
            'propagate': False,
        },
        'django.security': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
        'celery': {
            'handlers': ['console', 'celery_file'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}

os.makedirs(BASE_DIR / 'logs', exist_ok=True)

EMAIL_BACKEND = config(
    'EMAIL_BACKEND',
    default='django.core.mail.backends.smtp.EmailBackend'
)
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='eduignitecmr@gmail.com')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='EduIgnite <eduignitecmr@gmail.com>')
SERVER_EMAIL = config('SERVER_EMAIL', default='eduignitecmr@gmail.com')
# The PUBLIC WEBSITE origin. Every printed QR (ID card, report card, fee receipt)
# encodes <FRONTEND_URL>/verify/...; see core/verification.py. Production must
# set it to the live website (https://eduignite.online), never the API host.
FRONTEND_URL = config('FRONTEND_URL', default='https://eduignite.online')
FRONTEND_URLS = config(
    'FRONTEND_URLS',
    default='https://eduignite.online,https://www.eduignite.online,https://admin.eduignite.online,https://dashboard.eduignite.online',
    cast=Csv(),
)

# Report-card QR codes point here. It is the always-deployed backend, which
# server-renders the report card as a public HTML page, so a scanned card
# always resolves online — independent of any web-app deployment.
REPORT_CARD_VERIFY_BASE = config(
    'REPORT_CARD_VERIFY_BASE',
    default='https://api.eduignite.online/api/v1/grades/grades/verify-report-card-page',
)

# Transactional email provider.  Brevo is the default because its free plan is
# generous for school onboarding and account notifications.
EMAIL_PROVIDER = config('EMAIL_PROVIDER', default='brevo')
BREVO_API_KEY = config('BREVO_API_KEY', default='')
BREVO_API_URL = config('BREVO_API_URL', default='https://api.brevo.com/v3/smtp/email')
EMAIL_FROM_ADDRESS = config('EMAIL_FROM_ADDRESS', default=SERVER_EMAIL)
EMAIL_FROM_NAME = config('EMAIL_FROM_NAME', default='EduIgnite')
EMAIL_PROVIDER_TIMEOUT_SECONDS = config('EMAIL_PROVIDER_TIMEOUT_SECONDS', default=12, cast=int)
# School-request alerts go to every active CEO and CTO. These extra addresses
# (comma separated) are added to them; set EXECUTIVE_NOTIFY_EMAILS_ONLY=True to
# send ONLY to these instead.
EXECUTIVE_NOTIFY_EMAILS = config('EXECUTIVE_NOTIFY_EMAILS', default='', cast=Csv())
EXECUTIVE_NOTIFY_EMAILS_ONLY = config('EXECUTIVE_NOTIFY_EMAILS_ONLY', default=False, cast=bool)

FIREBASE_CREDENTIALS = {
    'type': config('FIREBASE_TYPE', default='service_account'),
    'project_id': config('FIREBASE_PROJECT_ID', default=''),
    'private_key_id': config('FIREBASE_PRIVATE_KEY_ID', default=''),
    'private_key': config('FIREBASE_PRIVATE_KEY', default='').replace('\\n', '\n'),
    'client_email': config('FIREBASE_CLIENT_EMAIL', default=''),
    'client_id': config('FIREBASE_CLIENT_ID', default=''),
    'auth_uri': config('FIREBASE_AUTH_URI', default='https://accounts.google.com/o/oauth2/auth'),
    'token_uri': config('FIREBASE_TOKEN_URI', default='https://oauth2.googleapis.com/token'),
    'auth_provider_x509_cert_url': config(
        'FIREBASE_AUTH_PROVIDER_CERT_URL',
        default='https://www.googleapis.com/oauth2/v1/certs'
    ),
    'client_x509_cert_url': config('FIREBASE_CLIENT_CERT_URL', default=''),
}

# ─── EduIgnite Offline licensing (ECDSA P-256 signing key) ─────────────────────
# DEV ONLY value lives in .env.example / a gitignored local .env. Production
# value must be provisioned from AWS SSM Parameter Store at
# /eduignite/prod/offline-licensing/private-key — see apps/offline_licensing/crypto.py.
OFFLINE_LICENSING_PRIVATE_KEY_PEM = config(
    'OFFLINE_LICENSING_PRIVATE_KEY_PEM', default=''
).replace('\\n', '\n')

# ─── App version CI updates ─────────────────────────────────────────────────
# DEV ONLY value lives in .env.example / a gitignored local .env. Production
# value must be provisioned from AWS SSM Parameter Store (mirrors
# OFFLINE_LICENSING_PRIVATE_KEY_PEM's provisioning story above) and set once
# as the GitHub Actions secret CI_VERSION_UPDATE_TOKEN — see
# apps/platform/app_version_views.py.
CI_VERSION_UPDATE_TOKEN = config('CI_VERSION_UPDATE_TOKEN', default='')

# ─── AI provider ───────────────────────────────────────────────────────────────
# When GEMINI_API_KEY is set, the whole AI layer runs on Google Gemini via its
# OpenAI-compatible endpoint (gemini-2.0-flash is multimodal, so it also serves
# the photo/vision path). Leave it empty to fall back to Groq. The one central
# EduIgnite system prompt is unchanged either way (apps/ai_features/utils.py).
GEMINI_API_KEY = config('GEMINI_API_KEY', default='')
GEMINI_MODEL = config('GEMINI_MODEL', default='gemini-2.5-flash')
GEMINI_BASE_URL = config(
    'GEMINI_BASE_URL',
    default='https://generativelanguage.googleapis.com/v1beta/openai/',
)

# ─── AI / Groq (fallback provider) ──────────────────────────────────────────────
GROQ_API_KEY = config('GROQ_API_KEY', default='')
# The model every AI feature falls back to when none is configured.
#
# It was 'llama-3.3-70b-versatile', which this account cannot reach: Groq
# answers model_not_found, so every AI feature failed no matter how well the
# key was set. Check with `manage.py check_groq` after changing it - a model
# name that is merely plausible is how this broke in the first place.
GROQ_MODEL = config('GROQ_MODEL', default='openai/gpt-oss-120b')
# How long a gpt-oss model may think before it answers. Its thinking is paid
# for out of max_tokens, so 'high' on a 900-token chat reply spends the reply.
GROQ_REASONING_EFFORT = config('GROQ_REASONING_EFFORT', default='low')
# Questions sent as photos go to a model that can read images; the default
# text model cannot. At most this many photos, this large together, per question.
#
# Groq retires vision models without warning (the Llama 4 models now answer
# model_not_found), so the ones in GROQ_VISION_FALLBACK_MODELS are tried in
# turn when the first is gone.
GROQ_VISION_MODEL = config('GROQ_VISION_MODEL', default='qwen/qwen3.8-27b')
GROQ_VISION_FALLBACK_MODELS = config(
    'GROQ_VISION_FALLBACK_MODELS',
    default='qwen/qwen3.8-27b,meta-llama/llama-4-maverick-17b-128e-instruct,meta-llama/llama-4-scout-17b-16e-instruct',
    cast=lambda v: [s.strip() for s in v.split(',') if s.strip()],
)
AI_CHAT_MAX_IMAGES = config('AI_CHAT_MAX_IMAGES', default=3, cast=int)
AI_CHAT_MAX_IMAGE_BYTES = config('AI_CHAT_MAX_IMAGE_BYTES', default=3 * 1024 * 1024, cast=int)
# Whole papers (apps/ai_features/paper.py): photos or a paste holding several
# questions are read into a list and every question is solved in full, side
# by side over every Groq key, then joined into one answer.
AI_PAPER_MODE = config('AI_PAPER_MODE', default=True, cast=bool)
AI_PAPER_MAX_QUESTIONS = config('AI_PAPER_MAX_QUESTIONS', default=15, cast=int)
AI_PAPER_MAX_TOKENS = config('AI_PAPER_MAX_TOKENS', default=8000, cast=int)
AI_PAPER_READ_MAX_TOKENS = config('AI_PAPER_READ_MAX_TOKENS', default=6000, cast=int)
AI_PAPER_CONTINUATIONS = config('AI_PAPER_CONTINUATIONS', default=2, cast=int)
AI_PAPER_CONCURRENCY = config('AI_PAPER_CONCURRENCY', default=3, cast=int)
AI_PAPER_TIMEOUT_SECONDS = config('AI_PAPER_TIMEOUT_SECONDS', default=150, cast=int)
# On Groq's free tier each key allows 8,000 tokens a minute; a busy key says
# how long to wait, and the client waits and retries this many times.
AI_PAPER_MAX_RETRIES = config('AI_PAPER_MAX_RETRIES', default=6, cast=int)
# Groq's per-minute token limit for one key. On the free tier a request whose
# prompt plus max_tokens is over it is refused (413), so paper answers are
# sized to fit. 0 when the account has no such limit (Developer tier).
GROQ_TOKENS_PER_MINUTE = config('GROQ_TOKENS_PER_MINUTE', default=8000, cast=int)
AI_PAPER_TOKENS_PER_QUESTION = config('AI_PAPER_TOKENS_PER_QUESTION', default=3500, cast=int)
# Which models solve paper questions, best first; a busy one hands over to the
# next. Qwen was more accurate on real A-Level physics than gpt-oss.
AI_PAPER_SOLVER_MODELS = config(
    'AI_PAPER_SOLVER_MODELS',
    default='qwen/qwen3.8-27b,openai/gpt-oss-120b',
    cast=lambda v: [s.strip() for s in v.split(',') if s.strip()],
)
GROQ_PAPER_REASONING_EFFORT = config('GROQ_PAPER_REASONING_EFFORT', default='medium')

# EduIgnite AI on Telegram (apps.bots). The token comes from @BotFather; the
# webhook secret is any long random string, given to Telegram by
# `manage.py telegram_setup` and checked on every delivery.
TELEGRAM_BOT_TOKEN = config('TELEGRAM_BOT_TOKEN', default='')
TELEGRAM_WEBHOOK_SECRET = config('TELEGRAM_WEBHOOK_SECRET', default='')
TELEGRAM_BOT_USERNAME = config('TELEGRAM_BOT_USERNAME', default='')
# Where Telegram reaches this API, for the webhook address.
BOTS_PUBLIC_API_URL = config('BOTS_PUBLIC_API_URL', default='https://api.eduignite.online')
# The website whose /print/ai-answer page draws answers into PDFs, and
# whether to use it (a headless browser) or only the plain PDF.
BOT_RENDER_BASE_URL = config('BOT_RENDER_BASE_URL', default='')
BOT_BROWSER_RENDERING = config('BOT_BROWSER_RENDERING', default=True, cast=bool)
# Room for a worked, step-by-step answer in the chat (with its LaTeX) plus the
# model's short thinking; 900 cut solutions off mid-step.
AI_CHAT_MAX_TOKENS = config('AI_CHAT_MAX_TOKENS', default=2400, cast=int)
GROQ_TIMEOUT_SECONDS = config('GROQ_TIMEOUT_SECONDS', default=35, cast=int)
GROQ_MAX_RETRIES = config('GROQ_MAX_RETRIES', default=1, cast=int)
GROQ_FAST_API_KEY = config('GROQ_FAST_API_KEY', default='')
GROQ_EXAM_API_KEY = config('GROQ_EXAM_API_KEY', default='')
GROQ_CAREER_API_KEY = config('GROQ_CAREER_API_KEY', default='')
GROQ_FAST_MODEL = config('GROQ_FAST_MODEL', default=GROQ_MODEL)
GROQ_EXAM_MODEL = config('GROQ_EXAM_MODEL', default=GROQ_FAST_MODEL)
GROQ_CAREER_MODEL = config('GROQ_CAREER_MODEL', default=GROQ_FAST_MODEL)
GROQ_FAST_TIMEOUT_SECONDS = config('GROQ_FAST_TIMEOUT_SECONDS', default=18, cast=int)
GROQ_FAST_MAX_RETRIES = config('GROQ_FAST_MAX_RETRIES', default=0, cast=int)
GROQ_CAREER_TIMEOUT_SECONDS = config('GROQ_CAREER_TIMEOUT_SECONDS', default=18, cast=int)
GROQ_CAREER_MAX_RETRIES = config('GROQ_CAREER_MAX_RETRIES', default=0, cast=int)
AI_INLINE_FAST_FEATURES = config('AI_INLINE_FAST_FEATURES', default='ai_exam_generation,career_orientation', cast=Csv())

# ─── Limits ────────────────────────────────────────────────────────────────────
# How much AI a person may use is decided by AI credits (apps.ai_features
# .credit_engine): a daily free allowance, plus any credits they buy. The
# allowance, prices and rates live in the database and are edited from the
# executive dashboard, not here. What stays below are per-school ceilings on
# the heaviest features, a guard against runaway use rather than a price.
#
# The day free credits refresh on is a day in this timezone.
AI_CREDITS_TIMEZONE = config('AI_CREDITS_TIMEZONE', default='Africa/Douala')
AI_EXAM_GENERATION_DAILY_LIMIT = config('AI_EXAM_GENERATION_DAILY_LIMIT', default=50, cast=int)
AI_CAREER_REPORT_DAILY_LIMIT = config('AI_CAREER_REPORT_DAILY_LIMIT', default=10, cast=int)
AI_SKILL_GAP_DAILY_LIMIT = config('AI_SKILL_GAP_DAILY_LIMIT', default=20, cast=int)
WEASYPRINT_BASEURL = config('WEASYPRINT_BASEURL', default='http://localhost:8000')

AWS_ACCESS_KEY_ID = config('AWS_ACCESS_KEY_ID', default='')
AWS_SECRET_ACCESS_KEY = config('AWS_SECRET_ACCESS_KEY', default='')
AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME', default='eduignite-media')
AWS_S3_REGION_NAME = config('AWS_S3_REGION_NAME', default='us-east-1')
AWS_S3_CUSTOM_DOMAIN = config('AWS_S3_CUSTOM_DOMAIN', default='')
# None, not 'public-read': the bucket has Object Ownership set to "Bucket owner
# enforced", which disables ACLs entirely. Sending any ACL makes S3 reject the
# upload with AccessControlListNotSupported. Public read is granted by the
# bucket policy instead, so files are still served — they just carry no per-
# object ACL.
AWS_DEFAULT_ACL = None
AWS_S3_OBJECT_PARAMETERS = {'CacheControl': 'max-age=86400'}
AWS_LOCATION = 'media'
if AWS_STORAGE_BUCKET_NAME and AWS_S3_CUSTOM_DOMAIN:
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/{AWS_LOCATION}/'

SENTRY_DSN = config('SENTRY_DSN', default='')
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration
        from sentry_sdk.integrations.celery import CeleryIntegration
    except ImportError:
        sentry_sdk = None
    if sentry_sdk is not None:
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            integrations=[
                DjangoIntegration(),
                CeleryIntegration(),
            ],
            traces_sample_rate=config('SENTRY_TRACES_SAMPLE_RATE', default=0.1, cast=float),
            send_default_pii=False,
            environment=config('ENVIRONMENT', default='development'),
        )

SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=False, cast=bool)
SESSION_COOKIE_SECURE = config('SESSION_COOKIE_SECURE', default=False, cast=bool)
CSRF_COOKIE_SECURE = config('CSRF_COOKIE_SECURE', default=False, cast=bool)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config('SECURE_HSTS_INCLUDE_SUBDOMAINS', default=True, cast=bool)
SECURE_HSTS_PRELOAD = config('SECURE_HSTS_PRELOAD', default=True, cast=bool)
# Stop a browser guessing a response is HTML when we said it was JSON, which
# is how an uploaded file becomes a script. Django's default is off.
SECURE_CONTENT_TYPE_NOSNIFF = True

# How much of our URL to leak to a site a user clicks through to. Django's
# default is already same-origin; stated here so a future edit has to be
# deliberate.
SECURE_REFERRER_POLICY = 'same-origin'

# SECURE_BROWSER_XSS_FILTER sets X-XSS-Protection, which every current
# browser ignores and which was itself a source of vulnerabilities. Left on
# for the handful of old browsers that still read it; it does no harm.
SECURE_BROWSER_XSS_FILTER = True

# NOTE: a Content-Security-Policy is NOT set here.
#
# This file used to define SECURE_CONTENT_SECURITY_POLICY, which looks like
# a Django setting and is not one: Django has no built-in CSP support, so
# the dictionary was read by nothing and no policy was ever sent. It has
# been removed rather than left to reassure whoever reads this next.
#
# The API serves JSON to our own apps and renders no HTML a browser will
# execute, so CSP buys it little. The place a policy actually matters is
# the Next.js sites, where it is set in each app's next.config headers().
# If this API ever serves HTML, add django-csp and a real policy here.

X_FRAME_OPTIONS = 'DENY'

FCM_SERVER_KEY = config('FCM_SERVER_KEY', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='EduIgnite <no-reply@eduignite.online>')

# --- Fapshi mobile money ---------------------------------------------------
# Credentials are read from the environment and never committed. Both the live
# and the sandbox credential sets are held at once; FAPSHI_MODE decides which is
# used. Flipping FAPSHI_MODE between 'sandbox' and 'live' (and redeploying)
# switches worlds instantly, without ever removing the live account details.
FAPSHI_MODE = config('FAPSHI_MODE', default='live')  # 'sandbox' | 'live'

# Live credential set (from the Fapshi live dashboard).
FAPSHI_BASE_URL = config('FAPSHI_BASE_URL', default='https://live.fapshi.com')
FAPSHI_API_USER = config('FAPSHI_API_USER', default='')
FAPSHI_API_KEY = config('FAPSHI_API_KEY', default='')

# Sandbox credential set (from the Fapshi sandbox dashboard). Different keys
# from live; the sandbox base URL is fixed, so only the two creds are needed.
FAPSHI_SANDBOX_API_USER = config('FAPSHI_SANDBOX_API_USER', default='')
FAPSHI_SANDBOX_API_KEY = config('FAPSHI_SANDBOX_API_KEY', default='')

# Set the same value on the Fapshi dashboard (both sandbox and live webhook
# config carry it). Without it a webhook cannot be told from anyone else posting
# to the same public URL, so an unsigned webhook is refused rather than trusted.
FAPSHI_WEBHOOK_SECRET = config('FAPSHI_WEBHOOK_SECRET', default='')

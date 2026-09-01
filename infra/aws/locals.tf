# Values derived from the inputs, used across the config.

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # api.eduignite.online, unless api_subdomain is already a full host.
  api_fqdn = can(regex("\\.", var.api_subdomain)) ? var.api_subdomain : "${var.api_subdomain}.${var.root_domain}"
  www_fqdn = "www.${var.root_domain}"

  # Root of the SSM tree the box reads at boot.
  ssm_prefix = "/${var.project_name}/${var.environment}"

  # Media host. Setting AWS_S3_CUSTOM_DOMAIN is what flips Django over to S3
  # storage (see backend/config/settings/base.py).
  s3_custom_domain = "${aws_s3_bucket.media.bucket}.s3.${var.aws_region}.amazonaws.com"

  # Defaults for the app env. var.app_env / var.app_secrets override these;
  # computed infra values (DB host, Redis URL, bucket) are merged in ssm.tf.
  app_env_defaults = {
    DJANGO_ENV             = "production"
    NODE_ENV               = "production"
    ENVIRONMENT            = "production"
    DJANGO_SETTINGS_MODULE = "config.settings.production"
    DEBUG                  = "False"

    ALLOWED_HOSTS        = join(",", [local.api_fqdn, var.root_domain, local.www_fqdn])
    CORS_ALLOWED_ORIGINS = join(",", ["https://${var.root_domain}", "https://${local.www_fqdn}"])
    CSRF_TRUSTED_ORIGINS = join(",", ["https://${var.root_domain}", "https://${local.www_fqdn}", "https://${local.api_fqdn}"])
    FRONTEND_URL         = "https://${var.root_domain}"

    SECURE_SSL_REDIRECT            = "True"
    SESSION_COOKIE_SECURE          = "True"
    CSRF_COOKIE_SECURE             = "True"
    SECURE_HSTS_SECONDS            = "31536000"
    SECURE_HSTS_INCLUDE_SUBDOMAINS = "True"
    SECURE_HSTS_PRELOAD            = "True"

    # Redis runs as a container called "redis" on the box.
    REDIS_URL                = "redis://redis:6379/1"
    REDIS_HOST               = "redis"
    REDIS_PORT               = "6379"
    CELERY_BROKER_URL        = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND    = "redis://redis:6379/0"
    CELERY_TASK_ALWAYS_EAGER = "false"

    AWS_S3_REGION_NAME = var.aws_region

    DB_PORT         = "5432"
    DB_CONN_MAX_AGE = "600"

    # LibreTranslate is off by default to keep the 2 GB box within memory. To
    # enable it, uncomment the service in docker-compose.prod.yml and point this
    # at http://libretranslate:5000.
    LIBRETRANSLATE_URL = "http://localhost:5000"
  }
}

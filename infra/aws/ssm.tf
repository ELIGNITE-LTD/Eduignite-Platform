# App environment in SSM Parameter Store. Everything under ssm_prefix is pulled
# by the box at boot (user_data.sh.tpl) and written to /opt/eduignite/.env.
# SecureString is free and encrypts at rest.
#
# Split three ways so sensitive values don't end up in a for_each:
#   plain       - defaults + non-secret computed infra values + var.app_env
#   db_password - the RDS password, kept on its own
#   secrets     - var.app_secrets

locals {
  # Non-secret values that come from the infra itself.
  ssm_computed = {
    DB_HOST                 = aws_db_instance.postgres.address
    DB_NAME                 = var.db_name
    DB_USER                 = var.db_username
    AWS_STORAGE_BUCKET_NAME = aws_s3_bucket.media.bucket
    AWS_S3_CUSTOM_DOMAIN    = local.s3_custom_domain
    ACME_EMAIL              = var.acme_email
    API_DOMAIN              = local.api_fqdn
    ROOT_DOMAIN             = var.root_domain
    WWW_DOMAIN              = local.www_fqdn
    NEXT_PUBLIC_API_URL     = "https://${local.api_fqdn}/api/v1"
    NEXT_PUBLIC_APP_URL     = "https://${var.root_domain}"
  }

  # defaults < user overrides < computed infra (so DB_HOST etc. can't be
  # overridden by accident). All non-sensitive. Empty values in the static part
  # are dropped (SSM rejects zero-length values); the computed infra values are
  # merged in afterwards so the key set stays known at plan time.
  ssm_plain = merge(
    { for k, v in merge(local.app_env_defaults, var.app_env) : k => v if v != "" },
    local.ssm_computed,
  )
}

resource "aws_ssm_parameter" "plain" {
  for_each = local.ssm_plain

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = each.value

  tags = { Name = "${local.name_prefix}-${each.key}" }
}

resource "aws_ssm_parameter" "db_password" {
  name  = "${local.ssm_prefix}/DB_PASSWORD"
  type  = "SecureString"
  value = random_password.db.result

  tags = { Name = "${local.name_prefix}-DB_PASSWORD" }
}

resource "aws_ssm_parameter" "secrets" {
  # Variable names only (non-sensitive). Empty values are skipped since SSM
  # rejects zero-length values; fill them in later and re-apply.
  for_each = nonsensitive(toset([for k, v in var.app_secrets : k if v != ""]))

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = var.app_secrets[each.key]

  tags = { Name = "${local.name_prefix}-${each.key}" }
}

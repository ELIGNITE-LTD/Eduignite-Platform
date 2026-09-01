# Inputs. Real values go in terraform.tfvars (git-ignored).

variable "aws_region" {
  description = "Region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Slug used when naming/tagging resources."
  type        = string
  default     = "eduignite"
}

variable "environment" {
  description = "Environment name (prod, staging). Used in the SSM path and tags."
  type        = string
  default     = "prod"
}

# Compute
variable "instance_type" {
  description = <<-EOT
    Instance type for the app box. t3.small (2 GB) is the practical minimum for
    the full stack plus 2 GB swap. t3.micro is free-tier but tends to OOM.
    Bump to t3.medium if you turn LibreTranslate on or run into memory limits.
  EOT
  type        = string
  default     = "t3.small"
}

variable "root_volume_gb" {
  description = "Root EBS size in GB. 30 stays inside the 12-month free tier."
  type        = number
  default     = 30
}

variable "key_name" {
  description = <<-EOT
    Existing EC2 key pair name for SSH (optional). Leave empty to use Session
    Manager for shell access instead, which needs no open SSH port.
  EOT
  type        = string
  default     = ""
}

variable "admin_ssh_cidr" {
  description = <<-EOT
    CIDR allowed on port 22. Only used when key_name is set. Set this to your
    own IP (x.x.x.x/32); don't leave it open.
  EOT
  type        = string
  default     = "0.0.0.0/0"
}

# Database
variable "db_instance_class" {
  description = "RDS instance class. db.t3.micro is free-tier for 12 months."
  type        = string
  default     = "db.t3.micro"
}

variable "db_engine_version" {
  description = <<-EOT
    Postgres major (or major.minor) version. If apply reports the version isn't
    available, list what is with:
      aws rds describe-db-engine-versions --engine postgres \
        --query 'DBEngineVersions[].EngineVersion'
    and pin one here.
  EOT
  type        = string
  default     = "15"
}

variable "db_allocated_storage" {
  description = "RDS storage in GB. 20 stays inside the free tier."
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "eduignite"
}

variable "db_username" {
  description = "RDS master username."
  type        = string
  default     = "eduignite"
}

variable "db_multi_az" {
  description = "Multi-AZ RDS. Roughly doubles the DB cost; keep off for the cheap tier."
  type        = bool
  default     = false
}

# Domain
variable "root_domain" {
  description = "Primary site domain. The site is served here and at www."
  type        = string
  default     = "eduignite.online"
}

variable "api_subdomain" {
  description = "API hostname. Prefixed onto root_domain unless it already has a dot."
  type        = string
  default     = "api"
}

variable "acme_email" {
  description = "Email Caddy registers with Let's Encrypt for automatic certs."
  type        = string
}

# CI
variable "create_github_oidc" {
  description = "Create an IAM role GitHub Actions can assume via OIDC to push images and deploy."
  type        = bool
  default     = true
}

variable "github_repo" {
  description = "GitHub owner/repo allowed to assume the CI role."
  type        = string
  default     = "ELIGNITE-LTD/Eduignite-Platform"
}

# Application environment
variable "app_env" {
  description = "Non-secret env vars written to SSM and loaded by the app."
  type        = map(string)
  default     = {}
}

variable "app_secrets" {
  description = "Secret env vars written to SSM as SecureString."
  type        = map(string)
  default     = {}
  sensitive   = true
}

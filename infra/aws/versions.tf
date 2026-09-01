# Providers and state config.
# State is local by default (fine for one maintainer). If more than one person
# runs Terraform, switch on the S3 backend below after creating the bucket and
# lock table.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # backend "s3" {
  #   bucket         = "eduignite-tfstate-<unique>"
  #   key            = "prod/aws/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "eduignite-tf-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "random" {}
provider "tls" {}

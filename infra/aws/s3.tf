# S3 bucket for user uploads. Kept private; django-storages serves objects with
# pre-signed URLs (AWS_QUERYSTRING_AUTH is on by default), so Block Public Access
# stays fully enabled and only the instance role can touch the bucket.

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "media" {
  bucket        = "${local.name_prefix}-media-${random_id.bucket_suffix.hex}"
  force_destroy = false

  tags = { Name = "${local.name_prefix}-media" }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Let the browser on the site origin load media from the S3 host.
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = [
      "https://${var.root_domain}",
      "https://${local.www_fqdn}",
      "https://${local.api_fqdn}",
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

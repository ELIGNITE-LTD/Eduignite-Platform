# The compose file, Caddyfile and deploy.sh live in S3 under deploy/. The box
# pulls them at boot and on every deploy. Going through S3 avoids depending on
# GitHub at boot and the 16 KB user-data limit. etag = filemd5 so edits here get
# re-uploaded on the next apply.

resource "aws_s3_object" "compose" {
  bucket       = aws_s3_bucket.media.id
  key          = "deploy/docker-compose.prod.yml"
  source       = "${path.module}/docker-compose.prod.yml"
  etag         = filemd5("${path.module}/docker-compose.prod.yml")
  content_type = "text/yaml"
}

resource "aws_s3_object" "caddyfile" {
  bucket       = aws_s3_bucket.media.id
  key          = "deploy/Caddyfile"
  source       = "${path.module}/Caddyfile"
  etag         = filemd5("${path.module}/Caddyfile")
  content_type = "text/plain"
}

resource "aws_s3_object" "deploy_script" {
  bucket       = aws_s3_bucket.media.id
  key          = "deploy/deploy.sh"
  source       = "${path.module}/deploy.sh"
  etag         = filemd5("${path.module}/deploy.sh")
  content_type = "text/x-shellscript"
}

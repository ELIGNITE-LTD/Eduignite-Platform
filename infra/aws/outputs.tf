# Outputs.

output "elastic_ip" {
  description = "Public IP of the box. Point your DNS A records here."
  value       = aws_eip.app.public_ip
}

output "dns_records_to_create" {
  description = "A records to add at your DNS provider, then wait for Caddy to get certs."
  value = {
    (var.root_domain) = "A ${aws_eip.app.public_ip}"
    (local.www_fqdn)  = "A ${aws_eip.app.public_ip}"
    (local.api_fqdn)  = "A ${aws_eip.app.public_ip}"
  }
}

output "site_url" {
  description = "Public site URL once DNS and HTTPS are up."
  value       = "https://${var.root_domain}"
}

output "api_url" {
  description = "Public API URL once DNS and HTTPS are up."
  value       = "https://${local.api_fqdn}"
}

output "rds_endpoint" {
  description = "RDS endpoint (private, reachable only from the box)."
  value       = aws_db_instance.postgres.address
}

output "media_bucket" {
  description = "S3 bucket holding uploads."
  value       = aws_s3_bucket.media.bucket
}

output "ecr_backend_repo" {
  description = "ECR repo URL for the backend image."
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_repo" {
  description = "ECR repo URL for the frontend image."
  value       = aws_ecr_repository.frontend.repository_url
}

output "instance_id" {
  description = "EC2 instance id (for Session Manager / Run Command)."
  value       = aws_instance.app.id
}

output "ssm_session_command" {
  description = "Open a shell on the box without SSH (needs the Session Manager plugin)."
  value       = "aws ssm start-session --target ${aws_instance.app.id} --region ${var.aws_region}"
}

output "ci_role_arn" {
  description = "IAM role ARN for GitHub Actions (set as the AWS_ROLE_ARN repo variable)."
  value       = var.create_github_oidc ? aws_iam_role.ci[0].arn : "(github OIDC disabled)"
}

output "manual_redeploy_command" {
  description = "Force a redeploy on the box from your machine."
  value       = "aws ssm send-command --instance-ids ${aws_instance.app.id} --document-name AWS-RunShellScript --parameters commands='sudo /opt/eduignite/deploy.sh' --region ${var.aws_region}"
}

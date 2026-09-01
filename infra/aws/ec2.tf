# The app box and its Elastic IP.

# Latest Ubuntu 22.04 AMI from Canonical's public SSM parameter.
data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id"
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.ubuntu.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnet.app.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  key_name               = var.key_name != "" ? var.key_name : null

  associate_public_ip_address = true

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = true
  }

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    aws_region   = var.aws_region
    ssm_prefix   = local.ssm_prefix
    account_id   = data.aws_caller_identity.current.account_id
    bucket       = aws_s3_bucket.media.bucket
    ecr_backend  = aws_ecr_repository.backend.repository_url
    ecr_frontend = aws_ecr_repository.frontend.repository_url
    swap_gb      = 2
  })

  tags = { Name = "${local.name_prefix}-app" }

  # Env, DB, bucket and deploy assets must exist before the box boots.
  depends_on = [
    aws_db_instance.postgres,
    aws_ssm_parameter.plain,
    aws_ssm_parameter.db_password,
    aws_ssm_parameter.secrets,
    aws_s3_object.compose,
    aws_s3_object.caddyfile,
    aws_s3_object.deploy_script,
  ]
}

resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id
  tags     = { Name = "${local.name_prefix}-eip" }
}

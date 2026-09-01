# Security groups.

# App box: HTTP/HTTPS open to the world, SSH only when a key pair is configured.
resource "aws_security_group" "ec2" {
  name        = "${local.name_prefix}-ec2-sg"
  description = "App box: web traffic in, optional admin SSH."
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP (also the ACME HTTP-01 challenge)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Only opened if a key pair is set. Session Manager is the preferred way in.
  dynamic "ingress" {
    for_each = var.key_name != "" ? [1] : []
    content {
      description = "SSH from admin CIDR"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [var.admin_ssh_cidr]
    }
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-ec2-sg" }
}

# Postgres only reachable from the app box.
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Postgres from the app box only."
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Postgres from the app box"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-rds-sg" }
}

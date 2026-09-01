# Managed Postgres.

resource "random_password" "db" {
  length  = 24
  special = true
  # RDS rejects / @ " and space in master passwords.
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_instance" "postgres" {
  identifier     = "${local.name_prefix}-db"
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 5 # allow storage autoscaling
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  backup_retention_period    = var.db_backup_retention_days
  backup_window              = var.db_backup_retention_days > 0 ? "03:00-04:00" : null
  maintenance_window         = "Mon:04:00-Mon:05:00"
  auto_minor_version_upgrade = true

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name_prefix}-db-final-${formatdate("YYYYMMDDhhmmss", timestamp())}"

  # timestamp() would otherwise churn the snapshot id on every plan.
  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }

  tags = { Name = "${local.name_prefix}-db" }
}

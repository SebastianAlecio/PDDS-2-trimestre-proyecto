locals {
  identifier = "${var.name}-${var.environment}"
}

resource "aws_db_subnet_group" "this" {
  name        = "${local.identifier}-subnets"
  description = "Subnet group for RDS instance ${local.identifier}; references subnets across multiple AZs."
  subnet_ids  = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name_prefix = "${local.identifier}-pg-"
  family      = "postgres17"
  description = "Parameter group for ${local.identifier}. Logs statements slower than 1s for performance triage."

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "db" {
  name        = "${local.identifier}-db"
  description = "Security group for RDS instance ${local.identifier}. Ingress is restricted to the application tier; no public access."
  vpc_id      = var.vpc_id

  egress {
    description = "All egress; RDS only initiates outbound for managed maintenance traffic."
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group_rule" "db_ingress" {
  for_each = var.allowed_security_groups

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.db.id
  source_security_group_id = each.value
  description              = "Postgres 5432 from ${each.key}"
}

resource "aws_db_instance" "this" {
  identifier        = local.identifier
  engine            = "postgres"
  engine_version    = var.engine_version
  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  multi_az = var.multi_az

  db_subnet_group_name   = aws_db_subnet_group.this.name
  parameter_group_name   = aws_db_parameter_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]

  publicly_accessible = false

  backup_retention_period = var.backup_retention_period
  skip_final_snapshot     = true
  deletion_protection     = false
}

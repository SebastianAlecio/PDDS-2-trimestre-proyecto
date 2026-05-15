data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "app_tier" {
  name        = "${var.project_name}-app-tier-${var.environment}"
  description = "Application tier security group. Acts as the source for the database ingress rule; Lambda functions join this SG when wired into the VPC (D3+)."
  vpc_id      = data.aws_vpc.default.id

  egress {
    description = "All egress."
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

module "compute" {
  source = "./modules/compute"

  environment = var.environment
  name        = var.compute_function_name
  memory_size = var.compute_memory_size
}

module "storage" {
  source = "./modules/storage"

  environment        = var.environment
  bucket_name_prefix = var.attachments_bucket_name_prefix
}

module "database" {
  source = "./modules/database"

  environment    = var.environment
  name           = "${var.project_name}-db"
  instance_class = var.db_instance_class
  multi_az       = var.db_multi_az
  vpc_id         = data.aws_vpc.default.id
  subnet_ids     = data.aws_subnets.default.ids
  allowed_security_groups = {
    app_tier = aws_security_group.app_tier.id
  }
  db_username             = var.db_username
  db_password             = var.db_password
  backup_retention_period = var.db_backup_retention_period
}

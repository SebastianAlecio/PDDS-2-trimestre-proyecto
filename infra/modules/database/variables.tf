variable "environment" {
  description = "Deployment environment. Appended to the instance identifier and to subordinate resources."
  type        = string
}

variable "name" {
  description = "Base name of the RDS instance. The final identifier is \"$${name}-$${environment}\"."
  type        = string
}

variable "instance_class" {
  description = "RDS DB instance class (e.g., db.t4g.micro, db.t4g.small)."
  type        = string
  default     = "db.t4g.micro"
}

variable "engine_version" {
  description = "Postgres engine version. Must match the family declared in the parameter group."
  type        = string
  default     = "17.10"
}

variable "allocated_storage" {
  description = "Initial allocated storage in GB. Uses gp3 storage type; can be expanded online up to max_allocated_storage."
  type        = number
  default     = 20
}

variable "multi_az" {
  description = "Whether to deploy a synchronous standby in a second AZ. Must exist as a variable per delivery rubric; recommended false in dev to halve cost."
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "VPC ID where the RDS security group lives. Subnets in var.subnet_ids must belong to this VPC."
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the DB subnet group. At least two subnets in distinct availability zones are required by RDS."
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "subnet_ids must contain at least 2 subnet IDs across distinct AZs."
  }
}

variable "allowed_security_groups" {
  description = "Security groups allowed to reach the database on the Postgres port. Map keyed by a static label (used as the for_each key so Terraform can resolve the rule set at plan time) to the SG ID."
  type        = map(string)

  validation {
    condition     = length(var.allowed_security_groups) >= 1
    error_message = "allowed_security_groups must contain at least one entry; an empty map would leave the DB unreachable."
  }
}

variable "db_username" {
  description = "Master username for the database. Not a secret; lives in tfvars."
  type        = string
}

variable "db_password" {
  description = "Master password for the database. Sourced from a sensitive variable; never committed to any file."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_password) >= 8
    error_message = "db_password must be at least 8 characters."
  }
}

variable "db_name" {
  description = "Initial database name created inside the instance. For Ticke-T this is the schema that hosts tickets, messages, agents and customers."
  type        = string
  default     = "tickets"
}

variable "backup_retention_period" {
  description = "Number of days automated backups are retained. 0 disables automated backups."
  type        = number
  default     = 7
}

variable "environment" {
  description = "Deployment environment. Drives resource naming and per-environment overrides."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be either \"dev\" or \"prod\"."
  }
}

variable "project_name" {
  description = "Short project identifier used as a name component and in default tags."
  type        = string
  default     = "pdds-oyd"
}

variable "region" {
  description = "AWS region where resources are provisioned."
  type        = string
  default     = "us-east-1"
}

variable "attachments_bucket_name_prefix" {
  description = "Prefix for the attachments bucket created by the storage module. A random suffix is appended for global uniqueness."
  type        = string
  default     = "pdds-oyd-attachments"
}

variable "compute_function_name" {
  description = "Base name of the Lambda function deployed by the compute module. The environment suffix is appended inside the module. In Ticke-T this function will sit behind API Gateway as the chat message handler (D3+)."
  type        = string
  default     = "chat-message-handler"
}

variable "compute_memory_size" {
  description = "Memory allocation in MB for the Lambda function."
  type        = number
  default     = 128
}

variable "db_instance_class" {
  description = "RDS DB instance class for the database module."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_multi_az" {
  description = "Whether the RDS instance has a synchronous standby in a second AZ. False in dev to halve cost; true is recommended for prod."
  type        = bool
  default     = false
}

variable "db_backup_retention_period" {
  description = "Days the RDS instance retains automated backups. Default 1 honors the AWS free-tier ceiling for dev accounts; raise to 7+ in prod."
  type        = number
  default     = 1
}

variable "db_username" {
  description = "Master username for the RDS instance. Not a secret; lives in tfvars."
  type        = string
  default     = "tickets_admin"
}

variable "db_password" {
  description = "Master password for the RDS instance. Sourced via TF_VAR_db_password (env var locally, GitHub Actions secret in CI). Must not appear in any committed file."
  type        = string
  sensitive   = true
}

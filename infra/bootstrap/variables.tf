variable "region" {
  description = "AWS region where the state bucket and lock table are provisioned."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project identifier propagated as a default tag and used as a name component."
  type        = string
  default     = "pdds-oyd"
}

variable "environment" {
  description = "Environment discriminator. Used in resource names and default tags so the bootstrap resources for dev and prod can coexist in the same account."
  type        = string
  default     = "shared"
}

variable "state_bucket_name_prefix" {
  description = "Prefix for the S3 bucket that stores Terraform state. A random suffix is appended for global uniqueness."
  type        = string
  default     = "pdds-oyd-tfstate"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$", var.state_bucket_name_prefix))
    error_message = "state_bucket_name_prefix must be 3-42 lowercase chars: letters, digits, or hyphens."
  }
}

variable "lock_table_name" {
  description = "Name of the DynamoDB table used by the S3 backend for state locking."
  type        = string
  default     = "pdds-oyd-tflock"
}

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

variable "bucket_name_prefix" {
  description = "Prefix for the bootstrap S3 bucket. A random suffix is appended to guarantee global uniqueness."
  type        = string
  default     = "pdds-oyd-bootstrap"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$", var.bucket_name_prefix))
    error_message = "bucket_name_prefix must be 3-42 lowercase chars: letters, digits, or hyphens; cannot start or end with a hyphen."
  }
}

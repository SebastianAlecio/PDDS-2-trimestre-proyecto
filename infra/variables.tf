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

variable "tickets_table_name" {
  description = "Base name of the DynamoDB tickets table. The environment suffix is appended inside the module."
  type        = string
  default     = "tickets"
}

variable "db_billing_mode" {
  description = "Billing mode passed through to the database module. PAY_PER_REQUEST is the default; flip to PROVISIONED only after capacity is well understood."
  type        = string
  default     = "PAY_PER_REQUEST"
}

variable "cognito_name" {
  description = "Base name of the Cognito user pool. The final name is \"$${name}-$${environment}\"."
  type        = string
  default     = "ticke-t-users"
}

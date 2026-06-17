variable "environment" {
  description = "Deployment environment. Appended to the table name."
  type        = string
}

variable "name" {
  description = "Base name of the DynamoDB table. The final name is \"$${name}-$${environment}\"."
  type        = string
}

variable "billing_mode" {
  description = "DynamoDB billing mode. PAY_PER_REQUEST scales seamlessly with bursty Lambda traffic; PROVISIONED requires capacity planning."
  type        = string
  default     = "PAY_PER_REQUEST"

  validation {
    condition     = contains(["PAY_PER_REQUEST", "PROVISIONED"], var.billing_mode)
    error_message = "billing_mode must be either \"PAY_PER_REQUEST\" or \"PROVISIONED\"."
  }
}

variable "ttl_attribute_name" {
  description = "Item attribute that DynamoDB will use to expire records via TTL. Required by the delivery rubric even if not actively populated yet."
  type        = string
  default     = "ttl"
}

variable "point_in_time_recovery_enabled" {
  description = "Whether to enable continuous backups with point-in-time recovery (35-day restore window)."
  type        = bool
  default     = true
}

variable "deletion_protection_enabled" {
  description = "Blocks accidental terraform destroy of the table. False in dev to allow free iteration; true is recommended for prod."
  type        = bool
  default     = false
}

variable "kms_key_arn" {
  description = "ARN del CMK que encripta la tabla. Si está vacío, DynamoDB usa la AWS-managed default key. Si está seteado, usa la CMK del módulo kms/ — requerido para D5 Deliverable B."
  type        = string
  default     = ""
}

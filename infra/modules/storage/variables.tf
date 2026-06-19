variable "environment" {
  description = "Deployment environment. Appended to the bucket name and propagated as a tag."
  type        = string
}

variable "bucket_name_prefix" {
  description = "Prefix for the bucket name. The final name is \"$${bucket_name_prefix}-$${environment}-$${random_hex}\" to guarantee global uniqueness."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$", var.bucket_name_prefix))
    error_message = "bucket_name_prefix must be 3-42 lowercase chars: letters, digits, or hyphens; cannot start or end with a hyphen."
  }
}

variable "lifecycle_prefix" {
  description = "Object key prefix that the lifecycle rule applies to. The rule is intentionally scoped (not bucket-wide) so unrelated objects retain Standard storage. In Ticke-T this prefix hosts chat attachments uploaded from the widget (US-03 of the cloud delivery)."
  type        = string
  default     = "attachments/"
}

variable "lifecycle_ia_transition_days" {
  description = "Days after which current-version objects under the lifecycle prefix transition to STANDARD_IA."
  type        = number
  default     = 30
}

variable "lifecycle_noncurrent_expiration_days" {
  description = "Days after which non-current object versions expire. Operates together with versioning to bound storage cost."
  type        = number
  default     = 90
}

variable "cors_allowed_origins" {
  description = "Lista de orígenes permitidos para CORS sobre el bucket. Requerido cuando el frontend hace PUT directo a S3 vía presigned URL — sin esto, el browser bloquea el upload con CORS error. En dev incluye localhost (Vite) y el dominio custom; en prod restringir solo al dominio real."
  type        = list(string)
  default     = ["*"]
}

variable "kms_key_arn" {
  description = "ARN del CMK que encripta los objetos del bucket. Si está vacío, el bucket usa SSE-S3 (AES256, AWS-managed). Si está seteado, el bucket usa aws:kms con la CMK del módulo kms/ — requerido para D5 Deliverable B."
  type        = string
  default     = ""
}

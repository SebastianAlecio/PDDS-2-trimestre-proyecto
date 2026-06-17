variable "environment" {
  description = "Deployment environment (dev / staging / prod). Sufijo del alias del CMK."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment debe ser dev, staging o prod."
  }
}

variable "project_name" {
  description = "Identificador corto del proyecto. Prefijo del alias del CMK (alias/$${project_name}-$${environment})."
  type        = string
  default     = "pdds-oyd"
}

variable "consumer_role_arns" {
  description = "Lista de IAM role ARNs de los servicios que necesitan kms:Decrypt y kms:GenerateDataKey sobre esta CMK. Típicamente las execution roles de las Lambdas que leen/escriben S3 + DDB encriptados. La key policy condiciona el uso a kms:ViaService (S3/DDB) — no permite Decrypt directo sobre payloads arbitrarios."
  type        = list(string)
  default     = []
}

variable "deletion_window_in_days" {
  description = "Días que la key queda en PendingDeletion antes de borrarse permanentemente cuando se ejecuta terraform destroy. Mínimo 7, máximo 30. 7 para dev (deletion rápida en testing); 30 para prod (ventana amplia de recovery si fue error)."
  type        = number
  default     = 7

  validation {
    condition     = var.deletion_window_in_days >= 7 && var.deletion_window_in_days <= 30
    error_message = "deletion_window_in_days debe estar entre 7 y 30."
  }
}

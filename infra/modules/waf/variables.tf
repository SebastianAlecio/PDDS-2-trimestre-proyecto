variable "environment" {
  description = "Deployment environment. Appended to the Web ACL name and propagated as a tag."
  type        = string
}

variable "name" {
  description = "Base name of the Web ACL. The final name is \"$${name}-$${environment}\"."
  type        = string
  default     = "ticke-t-waf"
}

variable "api_gateway_stage_arn" {
  description = "ARN del stage del REST API al que se asocia la Web ACL. WAF v2 soporta REST API stages directamente (a diferencia de HTTP API)."
  type        = string
}

variable "rate_limit_per_5min" {
  description = "Cantidad máxima de requests permitidas por IP en una ventana móvil de 5 minutos antes de aplicar BLOCK. AWS WAF evalúa con ventana móvil, no calendario."
  type        = number
  default     = 2000

  validation {
    condition     = var.rate_limit_per_5min >= 100 && var.rate_limit_per_5min <= 20000000
    error_message = "rate_limit_per_5min debe estar entre 100 y 20000000 (límites de aws_wafv2_web_acl RateBasedStatement)."
  }
}

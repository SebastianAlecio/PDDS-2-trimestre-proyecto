variable "environment" {
  description = "Deployment environment. Tag-only here; el dominio no incluye env porque es único."
  type        = string
}

variable "parent_domain" {
  description = "Dominio raíz cuya hosted zone se va a manejar en Route 53 (ej. \"lumenchat.app\"). Una vez creada, los nameservers de este zone tienen que pegarse en el registrador del dominio para que internet resuelva por acá."
  type        = string
}

variable "api_full_hostname" {
  description = "FQDN del API (ej. \"api.ticke-t.lumenchat.app\"). Se mapea al custom domain de API Gateway con un record A-alias cuando enable_api_custom_domain = true."
  type        = string
}

variable "enable_api_custom_domain" {
  description = "Si es true, además de la hosted zone y los records básicos crea el cert ACM, el custom domain del API Gateway, el base path mapping y el A-alias. Dejá en false para el primer apply — permite cambiar nameservers en el registrador sin que Terraform quede bloqueado esperando validación de cert."
  type        = bool
  default     = false
}

variable "api_gateway_id" {
  description = "ID del REST API a mapear al custom domain. Requerido cuando enable_api_custom_domain = true."
  type        = string
  default     = ""
}

variable "api_gateway_stage_name" {
  description = "Nombre del stage del REST API (ej. \"api\"). Requerido cuando enable_api_custom_domain = true."
  type        = string
  default     = ""
}

# ─── Records existentes a replicar desde el DNS del registrador ──────────────
#
# Para hacer una migración limpia desde Hostinger (u otro DNS provider), los
# records actuales se modelan abajo como variables. Permite tunearlos sin
# modificar el módulo. Cada una es un map o list según convenga.

variable "apex_a_record" {
  description = "IPv4 al que apunta el apex del dominio. \"\" significa: no crear record A en apex."
  type        = string
  default     = ""
}

variable "apex_aaaa_record" {
  description = "IPv6 al que apunta el apex del dominio. \"\" significa: no crear record AAAA en apex."
  type        = string
  default     = ""
}

variable "apex_mx_records" {
  description = "Records MX del apex. Cada entrada es \"<priority> <mailserver>\". Lista vacía significa: sin MX."
  type        = list(string)
  default     = []
}

variable "apex_txt_records" {
  description = "Records TXT del apex (SPF, verificaciones, etc.). Cada entrada es el contenido completo sin comillas."
  type        = list(string)
  default     = []
}

variable "subdomain_records" {
  description = "Records de subdominios distintos al apex. Cada entrada describe un record por su (name, type, value, ttl). Soporta A, CNAME, TXT. Para TXT con nombre como \"_dmarc\", el name es solo \"_dmarc\"."
  type = list(object({
    name  = string
    type  = string
    value = string
    ttl   = number
  }))
  default = []
}

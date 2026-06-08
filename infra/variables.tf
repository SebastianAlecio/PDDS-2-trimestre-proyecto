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

variable "api_name" {
  description = "Base name of the HTTP API gateway. The final name is \"$${name}-$${environment}\"."
  type        = string
  default     = "ticke-t-api"
}

variable "api_cors_allow_origins" {
  description = "Orígenes permitidos para CORS en el REST API. En dev [\"*\"] cubre Vite local y previews; en prod restringir al dominio del frontend."
  type        = list(string)
  default     = ["*"]
}

variable "api_stage_name" {
  description = "Nombre del stage del REST API (aparece como segmento de path en la URL). Cuando se monta un custom domain, este segmento queda oculto detrás del dominio."
  type        = string
  default     = "api"
}

variable "api_health_check_path" {
  description = "Path del health check del API. Default \"/\" por compliance con el rubric de OYD-D3 (\"defaulting to '/'\"). En envs/dev/dev.tfvars se sobreescribe a \"/health\" porque \"/\" en API Gateway por default responde \"Forbidden\" y no nos sirve como readiness real."
  type        = string
  default     = "/"
}

variable "waf_name" {
  description = "Base name of the WAF Web ACL. The final name is \"$${name}-$${environment}\"."
  type        = string
  default     = "ticke-t-waf"
}

variable "waf_rate_limit_per_5min" {
  description = "Cantidad máxima de requests permitidas por IP en una ventana móvil de 5 minutos antes del BLOCK. 2000 es razonable para un MVP con tráfico humano."
  type        = number
  default     = 2000
}

variable "dns_parent_domain" {
  description = "Dominio raíz cuya hosted zone se va a manejar en Route 53 (ej. \"lumenchat.app\"). Vacío significa: no provisionar el módulo dns. Todos los records de la zona se declaran como variables del módulo (ver el bloque module \"dns\" en main.tf)."
  type        = string
  default     = ""
}

variable "dns_api_full_hostname" {
  description = "FQDN del API en el dominio nuevo (ej. \"api.ticke-t.lumenchat.app\"). Solo se usa cuando enable_api_custom_domain = true."
  type        = string
  default     = ""
}

variable "dns_enable_api_custom_domain" {
  description = "Si es true, además de la hosted zone y los records de la zona, crea ACM cert + custom domain del API Gateway + A-alias. Dejar en false para el primer apply: así Terraform crea solo el DNS y nos da los nameservers para cambiar en el registrador, sin quedarse esperando validación de cert que todavía no es alcanzable."
  type        = bool
  default     = false
}

variable "dns_enable_ses_domain_identity" {
  description = "Si es true, registra el parent_domain como SES domain identity con DKIM + records de verificación en la hosted zone. Requerido para que el notifier Lambda pueda mandar emails desde *@parent_domain. Dejar en false si no se está usando SES."
  type        = bool
  default     = false
}

variable "ses_from_address" {
  description = "Dirección remitente que el notifier Lambda usa para mandar emails (ej. \"soporte@lumenchat.app\"). Debe pertenecer a un dominio o address verificado en SES. La IAM policy del notifier condiciona ses:FromAddress a este valor."
  type        = string
  default     = ""
}

variable "notifications_name_prefix" {
  description = "Prefijo para el SNS topic y la SQS queue de notificaciones. El nombre final es \"$${prefix}-$${environment}\"."
  type        = string
  default     = "ticket-notifications"
}

variable "notifications_max_receive_count" {
  description = "Cantidad de intentos del notifier Lambda sobre un mensaje SQS antes de moverlo a la DLQ. Default 3 es estándar."
  type        = number
  default     = 3
}

variable "dns_ws_full_hostname" {
  description = "FQDN del WebSocket custom domain (ej. \"ws.ticke-t.lumenchat.app\"). Solo se usa cuando dns_enable_ws_custom_domain = true."
  type        = string
  default     = ""
}

variable "dns_enable_ws_custom_domain" {
  description = "Si es true, monta el WebSocket API en wss://dns_ws_full_hostname creando aws_apigatewayv2_domain_name + api_mapping + A-alias en Route 53. Reutiliza el cert wildcard de dns (mismo wildcard cubre api.* y ws.*). Dejar en false en envs sin DNS."
  type        = bool
  default     = false
}

variable "chat_ws_function_name" {
  description = "Base name de la Lambda chat-ws. El nombre final es \"$${name}-$${environment}\"."
  type        = string
  default     = "chat-ws"
}


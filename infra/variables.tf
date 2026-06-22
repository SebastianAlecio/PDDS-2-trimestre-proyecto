variable "environment" {
  description = "Deployment environment. Drives resource naming and per-environment overrides. Acepta dev / staging / prod — staging se agregó en OYD-D4 para el multi-env pipeline."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of \"dev\", \"staging\", or \"prod\"."
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

variable "watchdog_schedule" {
  description = "Frecuencia de ejecución para la Lambda del Watchdog"
  type        = string
  default     = "rate(5 minutes)"
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

# ─── Async messaging (OYD-D4 Deliverable A) ────────────────────────────────
# Estas vars cablean los inputs del módulo async/ desde root.

variable "async_queue_name_prefix" {
  description = "Prefijo para los nombres de la cola principal + DLQ del módulo async/. Combinado con environment forma el name final (ej. ticke-t-async-dev, ticke-t-async-dev-dlq)."
  type        = string
  default     = "ticke-t-async"
}

variable "async_visibility_timeout_seconds" {
  description = "Visibility timeout (segundos) para la cola principal del módulo async/. Debe ser >= al timeout del consumer Lambda (30s en el module.async_consumer) — caso contrario SQS reentrega antes de que termine el procesamiento."
  type        = number
  default     = 60
}

variable "async_message_retention_seconds" {
  description = "Retención de mensajes en la cola principal del módulo async/. Default 4 días — suficiente para sobrevivir un outage prolongado del consumer."
  type        = number
  default     = 345600
}

variable "async_max_receive_count" {
  description = "Intentos antes de mover un mensaje a la DLQ del módulo async/. Default 3 — alineado con notifications_max_receive_count pero independiente."
  type        = number
  default     = 3
}

variable "async_dlq_message_retention_seconds" {
  description = "Retención de mensajes en la DLQ del módulo async/. Default 14 días (máximo de SQS) — la DLQ es para inspección post-incidente y queremos ventana amplia."
  type        = number
  default     = 1209600
}

# ─── Watchdog scheduler (OYD-D4 Deliverable C) ──────────────────────────
# El watchdog corre periódicamente y marca tickets vencidos por SLA.

variable "watchdog_timezone" {
  description = "IANA timezone para el cron del watchdog (ej. \"America/Guatemala\", \"UTC\"). El rubric OYD-D4 Deliverable C exige que el timezone sea un input variable, no hardcoded."
  type        = string
  default     = "America/Guatemala"
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

# ─── OIDC federation (OYD-D5 Deliverable C) ──────────────────────────────
# Vars de configuración del provider OIDC de GitHub Actions + ci_runner role.
# Se setean en cada env tfvars (dev y staging apuntan al mismo repo).

variable "enable_github_oidc" {
  description = "Si es true, el módulo iam/ crea el aws_iam_openid_connect_provider de GitHub Actions + el ci_runner role. El provider OIDC es por-cuenta — solo un env tiene que crearlo (típicamente dev). Cuando enable_github_oidc=true, github_owner y github_repo son requeridos."
  type        = bool
  default     = false
}

variable "github_owner" {
  description = "Org/usuario dueño del repo en GitHub (ej. SebastianAlecio). Usado en el sub claim del trust policy del ci_runner. Solo aplica cuando enable_github_oidc = true."
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "Nombre del repo en GitHub (ej. PDDS-2-trimestre-proyecto). Usado en el sub claim del trust policy del ci_runner. Solo aplica cuando enable_github_oidc = true."
  type        = string
  default     = ""
}

# ─── CDN / Frontend hosting (OYD-D5 Deliverable D) ────────────────────────

variable "frontend_full_hostname" {
  description = "FQDN del frontend (ej. \"app.ticke-t.lumenchat.app\"). Va al alias de la CloudFront distribution y al A-alias de Route 53. Vacío en envs sin DNS administrado (no se crea el módulo cdn)."
  type        = string
  default     = ""
}

variable "enable_frontend_cdn" {
  description = "Si es true, provisiona el módulo cdn/ (S3 + CloudFront + Route 53 alias) que hostea el frontend de Vite. Requiere frontend_full_hostname seteado, dns_parent_domain != \"\" y dns_enable_api_custom_domain = true (para que el cert wildcard esté disponible)."
  type        = bool
  default     = false
}

# ─── Observability (OYD-D5 Deliverable E) ──────────────────────────────────

variable "notification_email" {
  description = "Email que recibe alarmas de CloudWatch + notificaciones del AWS Budget al 80%. SNS manda un email de \"Confirm subscription\" que hay que aceptar manualmente para activar el subscription."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Limite mensual del AWS Budget en USD. Cuando spend del mes supera el 80% del limite, llega notificación al notification_email + SNS topic."
  type        = number
  default     = 20
}

variable "log_retention_days" {
  description = "Retención de logs en días para el API Gateway access log group (del módulo observability). Los log groups de las Lambdas usan su propia variable en el módulo compute (default 14)."
  type        = number
  default     = 14
}

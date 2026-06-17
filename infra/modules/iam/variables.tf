variable "environment" {
  description = "Deployment environment (dev / staging / prod). Sufijo del nombre de cada rol y del nombre completo de las Lambdas."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment debe ser dev, staging o prod."
  }
}

variable "project_name" {
  description = "Identificador corto del proyecto. Prefijo del nombre de cada rol."
  type        = string
  default     = "pdds-oyd"
}

# ─── ARNs de recursos consumidos por las roles ────────────────────────────
# Todos vienen como inputs; ninguno hardcodeado. Cumple el requisito del
# rubric D5 Deliverable A: "All role ARNs or service account emails must be
# exposed as module outputs and consumed by the modules that reference them.
# No role ARN may be hardcoded in any module call." — el corolario aplica
# también para los ARNs de recursos consumidos por las policies.

variable "tickets_table_arn" {
  description = "ARN de la tabla DynamoDB. Las policies que dan acceso a DDB scopean a este ARN + /index/* según el GSI que cada rol consulte."
  type        = string
}

variable "attachments_bucket_arn" {
  description = "ARN del bucket S3 de adjuntos. Las policies de tickets_lambda y chat_ws_lambda scopean a $${arn}/attachments/*; la de async_consumer a $${arn}/async-events/*."
  type        = string
}

variable "cognito_user_pool_arn" {
  description = "ARN del Cognito User Pool. Consumido por la policy cognito de tickets_lambda (AdminCreateUser/AdminAddUserToGroup/etc)."
  type        = string
}

variable "notifications_sns_topic_arn" {
  description = "ARN del topic SNS de notificaciones de tickets (ticket-notifications-<env>). Consumido por la policy sns-publish de tickets_lambda."
  type        = string
}

variable "notifications_sqs_queue_arn" {
  description = "ARN de la SQS principal de notificaciones (suscripta al topic SNS). Consumida por la policy sqs-consume del notifier_lambda."
  type        = string
}

variable "async_sqs_queue_arn" {
  description = "ARN de la SQS principal del módulo async/ (eventos genéricos del bus interno). Consumida por: policy sqs-send de tickets_lambda y watchdog_lambda (producers), y policy sqs-consume del async_consumer_lambda."
  type        = string
}

variable "websocket_api_execution_arn" {
  description = "Execution ARN del WebSocket API. Las policies ws-manage de tickets_lambda y chat_ws_lambda lo usan para scopear execute-api:ManageConnections a $${arn}/*/POST/@connections/*."
  type        = string
}

variable "ses_domain" {
  description = "Dominio verificado en SES (ej. lumenchat.app). El identity ARN se construye como arn:aws:ses:$${region}:$${account}:identity/$${ses_domain} y se usa como Resource de las policies SES. Cero wildcards."
  type        = string
}

variable "ses_from_address" {
  description = "Dirección remitente concreta (ej. soporte@lumenchat.app). Las policies SES condicionan ses:FromAddress a este valor — defense in depth además del Resource scoped al identity del dominio."
  type        = string
}

# ─── Function base names ──────────────────────────────────────────────────
# Por cada Lambda recibimos el "base name" (= var.name del módulo compute),
# no el nombre full. Acá construimos el full name ($${base}-$${environment})
# y derivamos los ARNs de log group y Lambda function por convención:
#   - log group: arn:aws:logs:$${region}:$${account}:log-group:/aws/lambda/$${full_name}
#   - function:  arn:aws:lambda:$${region}:$${account}:function:$${full_name}
# Patrón requerido para evitar dependency cycle entre módulos iam y compute
# (iam depende del nombre, compute del role ARN).

variable "tickets_function_base_name" {
  description = "Base name del tickets Lambda (sin sufijo env). Ej. \"chat-message-handler\" → full name \"chat-message-handler-dev\"."
  type        = string
}

variable "chat_ws_function_base_name" {
  description = "Base name del chat-ws Lambda. Ej. \"chat-ws\"."
  type        = string
}

variable "notifier_function_base_name" {
  description = "Base name del notifier Lambda. Ej. \"ticket-notifier\"."
  type        = string
}

variable "async_consumer_function_base_name" {
  description = "Base name del async_consumer Lambda. Ej. \"pdds-oyd-async-consumer\"."
  type        = string
}

variable "watchdog_function_base_name" {
  description = "Base name del watchdog Lambda. Ej. \"pdds-oyd-watchdog\"."
  type        = string
}

# ─── OIDC (Task 3 — Deliverable C) ───────────────────────────────────────
# Inputs del provider OIDC de GitHub Actions y del ci_runner role. La trust
# policy del ci_runner restringe sub claim a este repo específico — cero
# acceso desde forks o cuentas externas.

variable "github_owner" {
  description = "Org/usuario dueño del repositorio en GitHub (ej. SebastianAlecio). Forma parte del sub claim que el trust policy del ci_runner valida."
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "Nombre del repositorio en GitHub (ej. PDDS-2-trimestre-proyecto). Forma parte del sub claim del trust policy del ci_runner."
  type        = string
  default     = ""
}

variable "enable_oidc" {
  description = "Si es true, crea el aws_iam_openid_connect_provider de GitHub + el ci_runner role. False permite aplicar este módulo sin tocar OIDC (útil en envs donde el provider ya existe o no aplica)."
  type        = bool
  default     = false
}

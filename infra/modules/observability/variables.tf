variable "environment" {
  description = "Deployment environment (dev / staging / prod). Sufijo de nombres de log group, alarmas, dashboard y budget."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment debe ser dev, staging o prod."
  }
}

variable "project_name" {
  description = "Identificador corto del proyecto. Prefijo de nombres."
  type        = string
  default     = "pdds-oyd"
}

# ─── Logs ────────────────────────────────────────────────────────────────

variable "log_retention_days" {
  description = "Retención de logs en días para el log group del API Gateway access log (los log groups por Lambda viven en module.compute con su propia retention). Default 14 días — balance entre debuggability y costo."
  type        = number
  default     = 14
}

variable "api_name" {
  description = "Nombre del REST API (sin sufijo env). Usado en el path del access log group, en las dimensions de las alarmas API y en el dashboard."
  type        = string
}

variable "api_stage_name" {
  description = "Nombre del stage del REST API (ej. \"api\"). Usado en las dimensions de las alarmas y dashboard."
  type        = string
}

# ─── Notification target ─────────────────────────────────────────────────

variable "notification_email" {
  description = "Dirección de email que recibe las notificaciones del SNS topic de alarmas + las del budget al 80%. Se manda un email de \"Confirm subscription\" que hay que aceptar manualmente."
  type        = string
}

# ─── Lambda Errors alarm ─────────────────────────────────────────────────

variable "lambda_function_names" {
  description = "Lista de nombres completos de las Lambdas a monitorear (ej. [\"chat-message-handler-dev\", \"chat-ws-dev\", ...]). Por cada función se crea una alarma de Errors y se incluye en el widget del dashboard."
  type        = list(string)
}

variable "lambda_errors_threshold" {
  description = "Cantidad de errores en una ventana de lambda_errors_period_seconds que dispara la alarma."
  type        = number
  default     = 5
}

variable "lambda_errors_period_seconds" {
  description = "Ventana de tiempo (segundos) sobre la que se suman los errores para comparar con el threshold. 300s = 5 min."
  type        = number
  default     = 300
}

variable "lambda_errors_evaluation_periods" {
  description = "Cuántos periodos consecutivos tienen que sobrepasar el threshold antes de disparar la alarma. 1 = dispara apenas se cruza."
  type        = number
  default     = 1
}

# ─── SQS DLQ depth alarm ─────────────────────────────────────────────────

variable "sqs_dlq_names" {
  description = "Lista de nombres completos de DLQs a monitorear (ej. [\"ticket-notifications-dev-dlq\", \"ticke-t-async-dev-dlq\"]). Por cada DLQ se crea una alarma."
  type        = list(string)
}

variable "sqs_main_queue_names" {
  description = "Lista de nombres completos de las colas principales (NO DLQ) — solo para incluir en el widget del dashboard. NO se crean alarmas sobre estas colas."
  type        = list(string)
  default     = []
}

variable "dlq_depth_threshold" {
  description = "Cantidad de mensajes en la DLQ que dispara la alarma. Default 0 (cualquier mensaje en DLQ = problema)."
  type        = number
  default     = 0
}

variable "dlq_depth_period_seconds" {
  description = "Ventana de tiempo (segundos) sobre la que se observa el DLQ depth."
  type        = number
  default     = 60
}

variable "dlq_depth_evaluation_periods" {
  description = "Cuántos periodos consecutivos tienen que sobrepasar el threshold antes de disparar la alarma."
  type        = number
  default     = 1
}

# ─── API Gateway 5XX alarm ───────────────────────────────────────────────

variable "api_5xx_threshold" {
  description = "Cantidad de respuestas 5XX en una ventana de api_5xx_period_seconds que dispara la alarma."
  type        = number
  default     = 10
}

variable "api_5xx_period_seconds" {
  description = "Ventana de tiempo (segundos) sobre la que se suman los 5XX errors."
  type        = number
  default     = 300
}

variable "api_5xx_evaluation_periods" {
  description = "Cuántos periodos consecutivos tienen que sobrepasar el threshold antes de disparar la alarma."
  type        = number
  default     = 1
}

# ─── Budget ──────────────────────────────────────────────────────────────

variable "monthly_budget_usd" {
  description = "Limite mensual del budget AWS, en USD. Cuando el spend del mes supera el 80% del limite, sale notificación al notification_email + SNS topic."
  type        = number
  default     = 20
}

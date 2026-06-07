variable "environment" {
  description = "Deployment environment. Appended to los nombres de los recursos y propagado como tag."
  type        = string
}

variable "name_prefix" {
  description = "Prefijo de los nombres de los recursos del módulo. El nombre final es \"$${name_prefix}-$${environment}\" para el topic y la cola principal; la DLQ agrega el sufijo \"-dlq\"."
  type        = string
  default     = "ticket-notifications"
}

variable "max_receive_count" {
  description = "Cantidad máxima de veces que SQS entrega un mensaje antes de moverlo a la DLQ. SQS reintenta automáticamente cuando el consumer falla (la Lambda tira un error). Default 3 es estándar — suficiente para errores transitorios de SES (throttle, network), pero no tanto como para inundar la cola si la causa real es persistente (bug en código o recipient no verificado en sandbox)."
  type        = number
  default     = 3

  validation {
    condition     = var.max_receive_count >= 1 && var.max_receive_count <= 1000
    error_message = "max_receive_count debe estar entre 1 y 1000 (SQS hard limit)."
  }
}

variable "visibility_timeout_seconds" {
  description = "Tiempo que un mensaje queda invisible para otros consumers después de ser entregado. Debe ser mayor o igual al timeout de la Lambda consumer (sino el mensaje vuelve a entregarse mientras la Lambda todavía está procesando, duplicando trabajo). Default 60s cubre Lambda timeouts de hasta 60s."
  type        = number
  default     = 60
}

variable "message_retention_seconds" {
  description = "Cuánto tiempo SQS retiene un mensaje no consumido antes de tirarlo. Default 4 días (345600 s) — alineado con DLQ para tener ventana de inspección manual si algo se rompe el viernes."
  type        = number
  default     = 345600
}

variable "dlq_retention_seconds" {
  description = "Cuánto tiempo la DLQ retiene mensajes fallidos. Default 14 días (1209600 s) — el máximo de SQS, da tiempo a investigar fallos de fin de semana o vacaciones."
  type        = number
  default     = 1209600
}

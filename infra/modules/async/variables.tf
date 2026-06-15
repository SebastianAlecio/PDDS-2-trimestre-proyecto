variable "environment" {
  description = "Deployment environment. Se appenda al name_prefix para que dev y staging tengan colas con nombres distintos sin chocar."
  type        = string
}

variable "queue_name_prefix" {
  description = "Prefijo del nombre de la cola principal (sin el sufijo de environment). Ejemplo: \"ticke-t-async\" produce ticke-t-async-dev y ticke-t-async-staging. Misma cadena se usa como base de la DLQ con el sufijo \"-dlq\"."
  type        = string

  validation {
    condition     = length(var.queue_name_prefix) > 0 && length(var.queue_name_prefix) <= 50
    error_message = "queue_name_prefix debe tener entre 1 y 50 caracteres (deja margen para el sufijo de env)."
  }
}

variable "visibility_timeout_seconds" {
  description = "Tiempo que SQS oculta un mensaje recibido por un consumer antes de devolverlo a la cola si no fue eliminado. Debe ser >= al timeout de la Lambda consumer para evitar reentregas espurias mientras la Lambda aún procesa."
  type        = number
  default     = 60

  validation {
    condition     = var.visibility_timeout_seconds >= 0 && var.visibility_timeout_seconds <= 43200
    error_message = "visibility_timeout_seconds tiene que estar entre 0 y 43200 (12 horas)."
  }
}

variable "message_retention_seconds" {
  description = "Cuánto tiempo SQS guarda un mensaje en la cola PRINCIPAL antes de descartarlo. Si el consumer no logra procesarlo en este ventana, el mensaje se pierde (en la DLQ retiene aparte vía dlq_message_retention_seconds)."
  type        = number
  default     = 345600

  validation {
    condition     = var.message_retention_seconds >= 60 && var.message_retention_seconds <= 1209600
    error_message = "message_retention_seconds tiene que estar entre 60 segundos y 1209600 (14 días)."
  }
}

variable "max_receive_count" {
  description = "Número de intentos de entrega que SQS hace antes de mover el mensaje a la DLQ. Después de max_receive_count fallos consecutivos del consumer (entrega + visibility timeout expirado sin DeleteMessage), SQS dispara el redrive_policy."
  type        = number
  default     = 3

  validation {
    condition     = var.max_receive_count >= 1 && var.max_receive_count <= 1000
    error_message = "max_receive_count tiene que estar entre 1 y 1000."
  }
}

variable "dlq_message_retention_seconds" {
  description = "Cuánto tiempo SQS guarda un mensaje en la DLQ. Tiende a ser más largo que message_retention_seconds porque la DLQ es para inspección manual post-incidente (ej. 14 días) — la cola principal es para tráfico vivo."
  type        = number
  default     = 1209600

  validation {
    condition     = var.dlq_message_retention_seconds >= 60 && var.dlq_message_retention_seconds <= 1209600
    error_message = "dlq_message_retention_seconds tiene que estar entre 60 segundos y 1209600 (14 días, el máximo de SQS)."
  }
}

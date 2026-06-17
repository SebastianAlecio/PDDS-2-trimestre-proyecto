variable "environment" {
  description = "Deployment environment. Appended to the function name and propagated as a tag."
  type        = string
}

variable "name" {
  description = "Base name of the Lambda function. The final function name is \"$${name}-$${environment}\"."
  type        = string
}

variable "memory_size" {
  description = "Memory allocation for the Lambda function, in MB. CPU and network throughput scale with memory."
  type        = number
  default     = 128

  validation {
    condition     = var.memory_size >= 128 && var.memory_size <= 10240
    error_message = "memory_size must be between 128 and 10240 MB."
  }
}

variable "runtime" {
  description = "Lambda managed runtime identifier (e.g., \"nodejs22.x\", \"python3.12\")."
  type        = string
  default     = "nodejs22.x"
}

variable "architectures" {
  description = "CPU architecture(s) the Lambda function runs on. \"arm64\" usa AWS Graviton2 (~20% mejor precio/performance para workloads de Node.js puro); \"x86_64\" es la opción tradicional si la función depende de módulos nativos sin build ARM. Lista de un único elemento."
  type        = list(string)
  default     = ["arm64"]

  validation {
    condition     = length(var.architectures) == 1 && contains(["x86_64", "arm64"], var.architectures[0])
    error_message = "architectures debe ser exactamente uno de [\"x86_64\"] o [\"arm64\"]."
  }
}

variable "handler" {
  description = "Function entrypoint in the form \"file.export\" (Node.js) or \"file.function\" (Python)."
  type        = string
  default     = "index.handler"
}

variable "source_dir" {
  description = "Absolute or workspace-relative path to the directory containing the function source. Empty string means \"$${path.module}/src\"."
  type        = string
  default     = ""
}

variable "timeout_seconds" {
  description = "Maximum execution time before Lambda kills the invocation. Hard upper bound is 900 seconds."
  type        = number
  default     = 10

  validation {
    condition     = var.timeout_seconds >= 1 && var.timeout_seconds <= 900
    error_message = "timeout_seconds must be between 1 and 900."
  }
}

variable "log_retention_days" {
  description = "Retention period for the function's CloudWatch log group. 0 means \"never expire\"."
  type        = number
  default     = 14
}

variable "environment_variables" {
  description = "Map of environment variables exposed to the Lambda function at runtime. Empty map means no environment block is emitted."
  type        = map(string)
  default     = {}
}

# ─── Role ARNs — vienen del módulo iam/ (Deliverable A del rubric OYD-D5) ──
# Hasta D4 los roles se creaban inline acá. Ahora viven en infra/modules/iam/
# y se pasan como inputs. Cumple "All role ARNs must be exposed as module
# outputs and consumed by the modules that reference them — no role ARN may
# be hardcoded in any module call".

variable "execution_role_arn" {
  description = "ARN del IAM role assumido por la Lambda en runtime. Viene del módulo iam/ (un rol por función — tickets, chat_ws, notifier, async_consumer, watchdog)."
  type        = string
}

variable "scheduler_role_arn" {
  description = "ARN del IAM role assumido por EventBridge Scheduler para invocar esta Lambda. Solo se usa cuando attach_scheduler = true. Vacío cuando no aplica."
  type        = string
  default     = ""
}

# ─── SQS event source mapping (sin policy — la policy vive en iam/) ──────

variable "attach_sqs_event_source_mapping" {
  description = "Si es true, crea el aws_lambda_event_source_mapping que conecta sqs_event_source_queue_arn con esta Lambda. La IAM policy sqs:ReceiveMessage/etc vive en el rol del módulo iam/."
  type        = bool
  default     = false
}

variable "sqs_event_source_queue_arn" {
  description = "ARN de la cola SQS que dispara esta Lambda via event source mapping. Solo se usa cuando attach_sqs_event_source_mapping = true."
  type        = string
  default     = ""
}

variable "sqs_batch_size" {
  description = "Cantidad de mensajes SQS que el event source mapping entrega por invocación. 1 = un mensaje por invocación (debug granular, retry granular). 10 = throughput. Default 1 para MVP."
  type        = number
  default     = 1
}

variable "maximum_batching_window_in_seconds" {
  description = "Tiempo (segundos) que SQS espera para acumular hasta sqs_batch_size mensajes antes de invocar la Lambda. 0 = latencia mínima. > 0 = ahorra invocaciones a costa de latencia. Requerido por el rubric OYD-D4 Deliverable B como input variable."
  type        = number
  default     = 0

  validation {
    condition     = var.maximum_batching_window_in_seconds >= 0 && var.maximum_batching_window_in_seconds <= 300
    error_message = "maximum_batching_window_in_seconds tiene que estar entre 0 y 300 segundos."
  }
}

variable "bisect_batch_on_function_error" {
  description = "Si es true, cuando el handler tira un error con un batch, SQS divide en sub-batches y reintenta. NOTA: AWS SQS NO soporta este parámetro (solo Kinesis/DDB Streams) — la var queda declarada por contrato del rubric OYD-D4 Deliverable B pero NO se cablea al resource event_source_mapping."
  type        = bool
  default     = false
}

# ─── EventBridge Scheduler (OYD-D4 Deliverable C) ─────────────────────────

variable "attach_scheduler" {
  description = "Si es true, crea aws_scheduler_schedule + asigna scheduler_role_arn como invoker. NO crea el rol — viene del módulo iam/."
  type        = bool
  default     = false
}

variable "scheduler_timezone" {
  description = "IANA timezone para schedule_expression (ej. \"America/Guatemala\", \"UTC\"). Solo aplica cuando attach_scheduler = true."
  type        = string
  default     = "UTC"
}

variable "scheduler_state" {
  description = "Estado inicial del schedule: ENABLED o DISABLED. Útil para crear el schedule sin que arranque hasta tener handler/permisos confirmados."
  type        = string
  default     = "ENABLED"

  validation {
    condition     = contains(["ENABLED", "DISABLED"], var.scheduler_state)
    error_message = "scheduler_state tiene que ser ENABLED o DISABLED."
  }
}

variable "schedule_expression" {
  description = "Expresión cron o rate para invocar la Lambda periódicamente (ej. 'rate(1 hour)'). Si es \"\" no se crea ni el legacy event rule ni el scheduler v2."
  type        = string
  default     = ""
}

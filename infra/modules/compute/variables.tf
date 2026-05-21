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

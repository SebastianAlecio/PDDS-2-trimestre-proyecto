variable "environment" {
  description = "Deployment environment. Appended to los nombres y propagado como tag."
  type        = string
}

variable "name" {
  description = "Base name del WebSocket API. El nombre final es \"$${name}-$${environment}\"."
  type        = string
  default     = "ticke-t-ws"
}

variable "lambda_function_arn" {
  description = "ARN de la Lambda que actúa como integración AWS_PROXY para las 3 routes WS."
  type        = string
}

variable "lambda_function_name" {
  description = "Nombre de la Lambda. Necesario para el aws_lambda_permission que autoriza a API GW WS a invocarla."
  type        = string
}

variable "stage_name" {
  description = "Nombre del stage del WS API (queda como path segment de la URL execute-api default)."
  type        = string
  default     = "chat"
}

variable "enable_custom_domain" {
  description = "Si es true, crea aws_apigatewayv2_domain_name + api_mapping para que la URL wss://<domain_name>/ alcance este stage."
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "FQDN del custom domain WS (ej. \"ws.ticke-t.lumenchat.app\"). Requerido cuando enable_custom_domain = true."
  type        = string
  default     = ""
}

variable "regional_certificate_arn" {
  description = "ARN del ACM cert regional que cubre domain_name. Requerido cuando enable_custom_domain = true. Reutilizamos el wildcard *.ticke-t.lumenchat.app emitido por el módulo dns."
  type        = string
  default     = ""
}

variable "throttling_burst_limit" {
  description = "Burst limit del stage WS (default_route_settings). Humanos no envían en burst alto."
  type        = number
  default     = 50
}

variable "throttling_rate_limit" {
  description = "Rate limit del stage WS (rps). 20 alcanza para varios chats simultáneos."
  type        = number
  default     = 20
}

variable "route53_zone_id" {
  description = "ID de la hosted zone donde crear el A-alias del WS custom domain. Cuando enable_custom_domain = true y este valor != \"\", el módulo crea aws_route53_record.ws apuntando al regional endpoint del custom domain. Mover el record dentro de este módulo (en vez de en dns) rompe el ciclo dns ↔ realtime que aparece cuando realtime consume el cert desde dns Y dns consume el regional_domain_name desde realtime."
  type        = string
  default     = ""
}

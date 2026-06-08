variable "environment" {
  description = "Deployment environment. Appended to the API name and propagated as a tag."
  type        = string
}

variable "name" {
  description = "Base name of the REST API. The final name is \"$${name}-$${environment}\"."
  type        = string
  default     = "ticke-t-api"
}

variable "stage_name" {
  description = "Nombre del stage del REST API. Aparece como segmento de path en la URL invoke (ej. /api/tickets). Cuando se monta un custom domain, este segmento queda oculto detrás del dominio."
  type        = string
  default     = "api"
}

variable "tickets_lambda_invoke_arn" {
  description = "Invoke ARN de la Lambda tickets (chat-message-handler-dev). Backend para las rutas POST /tickets, GET /tickets/me, GET /tickets/queue, PUT /tickets/{id}/assign, PUT /tickets/{id}/status, POST /users."
  type        = string
}

variable "tickets_lambda_function_name" {
  description = "Nombre de la Lambda tickets. Para aws_lambda_permission."
  type        = string
}

variable "chat_ws_lambda_invoke_arn" {
  description = "Invoke ARN de la Lambda chat-ws (chat-ws-dev). Backend para GET /tickets/{id}/messages y POST /tickets/{id}/messages/attachments."
  type        = string
}

variable "chat_ws_lambda_function_name" {
  description = "Nombre de la Lambda chat-ws. Para aws_lambda_permission."
  type        = string
}

variable "cognito_user_pool_arn" {
  description = "ARN del User Pool de Cognito. Consumido por el authorizer COGNITO_USER_POOLS — valida el ID token en cada request a rutas autenticadas."
  type        = string
}

variable "cors_allow_origins" {
  description = "Lista de orígenes permitidos para CORS. En dev se usa [\"*\"] para soportar Vite local y previews; en prod restringir al dominio real del frontend. REST API serializa esto como string con comas para el header Access-Control-Allow-Origin."
  type        = list(string)
  default     = ["*"]
}

variable "health_check_path" {
  description = "Path del health/readiness check del API. Default \"/\" por el rubric de OYD-D3 (\"A configurable health check path must be defined, defaulting to '/'\"). En dev se sobreescribe a \"/health\" via tfvars porque \"/\" en API Gateway está reservado para responder \"Forbidden\" sobre rutas no mapeadas y no nos sirve como check real. El endpoint usa MOCK integration y devuelve 200 con {\"status\":\"ok\"} sin invocar Lambda."
  type        = string
  default     = "/"
}

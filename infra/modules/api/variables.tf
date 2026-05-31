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

variable "lambda_function_arn" {
  description = "ARN de la Lambda que actúa como integración AWS_PROXY para todas las rutas definidas en este módulo."
  type        = string
}

variable "lambda_function_name" {
  description = "Nombre de la Lambda. Necesario para crear el aws_lambda_permission que autoriza a API Gateway a invocarla."
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

output "api_id" {
  description = "ID del REST API. Útil para queries con la AWS CLI o para asociar más recursos en el futuro."
  value       = aws_api_gateway_rest_api.this.id
}

output "api_arn" {
  description = "ARN del REST API."
  value       = aws_api_gateway_rest_api.this.arn
}

output "api_endpoint" {
  description = "Invoke URL del stage. Se inyecta al frontend como VITE_API_BASE_URL. Ej: https://abc123.execute-api.us-east-1.amazonaws.com/prod."
  value       = aws_api_gateway_stage.this.invoke_url
}

output "api_execution_arn" {
  description = "Execution ARN del REST API. Consumido por aws_lambda_permission y otras IAM policies que necesiten referenciar este API."
  value       = aws_api_gateway_rest_api.this.execution_arn
}

output "stage_name" {
  description = "Nombre del stage publicado (ej. prod)."
  value       = aws_api_gateway_stage.this.stage_name
}

output "stage_arn" {
  description = "ARN del stage. Consumido por la asociación de WAF Web ACL al ingress."
  value       = aws_api_gateway_stage.this.arn
}

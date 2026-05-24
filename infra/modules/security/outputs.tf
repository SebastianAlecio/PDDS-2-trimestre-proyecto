output "user_pool_id" {
  description = "El ID del User Pool de Cognito."
  value       = aws_cognito_user_pool.pool.id
}

output "user_pool_arn" {
  description = "El ARN del User Pool de Cognito."
  value       = aws_cognito_user_pool.pool.arn
}

output "user_pool_client_id" {
  description = "El ID del User Pool Client, necesario para inicializar el SDK en el frontend."
  value       = aws_cognito_user_pool_client.client.id
}